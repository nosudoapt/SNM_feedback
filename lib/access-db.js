// lib/access-db.js
// Identity, allowlist and audit trail for the admin area.
//
// Follows the same conventions as lib/db.js: a lazily-initialised neon() client,
// an idempotent ensureSchema() guarded by a module-level promise, tagged-template
// SQL, and JSONB written as ${JSON.stringify(x)}::jsonb.
//
// Two tables:
//   admin_users — the email allowlist. A row here (active = true) is what lets a
//                 Google account sign in. role is one of viewer|editor|super_admin.
//   audit_log   — append-only record of who did what (logins, user changes, form
//                 publishes, etc.).

import crypto from "crypto";
import { neon } from "@neondatabase/serverless";
import { ROLES, normalizeRole } from "./rbac.js";

let sqlClient = null;
let schemaPromise = null;

function sql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  if (!sqlClient) {
    sqlClient = neon(connectionString);
  }
  return sqlClient;
}

export async function ensureAccessSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = sql();
      await db`
        CREATE TABLE IF NOT EXISTS admin_users (
          email text PRIMARY KEY,
          name text,
          role text NOT NULL DEFAULT 'viewer',
          active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          last_login_at timestamptz
        )
      `;
      await db`
        CREATE TABLE IF NOT EXISTS audit_log (
          id text PRIMARY KEY,
          at timestamptz NOT NULL DEFAULT now(),
          actor_email text,
          action text NOT NULL,
          target text,
          detail jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `;
    })();
  }
  return schemaPromise;
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function getUserByEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return null;
  await ensureAccessSchema();
  const db = sql();
  const rows = await db`SELECT email, name, role, active, created_at, last_login_at FROM admin_users WHERE email = ${e}`;
  return rows[0] || null;
}

export async function listUsers() {
  await ensureAccessSchema();
  const db = sql();
  return db`
    SELECT email, name, role, active, created_at, last_login_at
    FROM admin_users
    ORDER BY role = 'super_admin' DESC, active DESC, email ASC
  `;
}

// Add or update an allowlist entry (used by the Users & Access screen).
export async function upsertUser({ email, name, role, active }) {
  const e = normalizeEmail(email);
  if (!e) throw new Error("email required");
  const r = normalizeRole(role);
  const a = active === undefined ? true : !!active;
  await ensureAccessSchema();
  const db = sql();
  const rows = await db`
    INSERT INTO admin_users (email, name, role, active)
    VALUES (${e}, ${name || null}, ${r}, ${a})
    ON CONFLICT (email) DO UPDATE
      SET name = COALESCE(EXCLUDED.name, admin_users.name),
          role = EXCLUDED.role,
          active = EXCLUDED.active
    RETURNING email, name, role, active, created_at, last_login_at
  `;
  return rows[0];
}

export async function setUserActive(email, active) {
  const e = normalizeEmail(email);
  await ensureAccessSchema();
  const db = sql();
  const rows = await db`
    UPDATE admin_users SET active = ${!!active} WHERE email = ${e}
    RETURNING email, name, role, active, created_at, last_login_at
  `;
  return rows[0] || null;
}

export async function setUserRole(email, role) {
  const e = normalizeEmail(email);
  const r = normalizeRole(role);
  await ensureAccessSchema();
  const db = sql();
  const rows = await db`
    UPDATE admin_users SET role = ${r} WHERE email = ${e}
    RETURNING email, name, role, active, created_at, last_login_at
  `;
  return rows[0] || null;
}

export async function touchLastLogin(email) {
  const e = normalizeEmail(email);
  if (!e) return;
  await ensureAccessSchema();
  const db = sql();
  await db`UPDATE admin_users SET last_login_at = now() WHERE email = ${e}`;
}

// The password-login owner is always (re)asserted as an active super_admin so
// there is always a break-glass path into the system.
export async function seedSuperAdmin(email, name) {
  const e = normalizeEmail(email);
  if (!e) return null;
  await ensureAccessSchema();
  const db = sql();
  const rows = await db`
    INSERT INTO admin_users (email, name, role, active)
    VALUES (${e}, ${name || null}, ${ROLES.SUPER_ADMIN}, true)
    ON CONFLICT (email) DO UPDATE
      SET role = ${ROLES.SUPER_ADMIN},
          active = true,
          name = COALESCE(admin_users.name, EXCLUDED.name)
    RETURNING email, name, role, active, created_at, last_login_at
  `;
  return rows[0];
}

export async function countActiveSuperAdmins() {
  await ensureAccessSchema();
  const db = sql();
  const [row] = await db`SELECT COUNT(*)::int AS n FROM admin_users WHERE role = 'super_admin' AND active = true`;
  return row?.n || 0;
}

export async function recordAudit({ actorEmail, action, target, detail }) {
  try {
    await ensureAccessSchema();
    const db = sql();
    await db`
      INSERT INTO audit_log (id, actor_email, action, target, detail)
      VALUES (${crypto.randomUUID()}, ${normalizeEmail(actorEmail) || null}, ${String(action)}, ${target || null}, ${JSON.stringify(detail || {})}::jsonb)
    `;
  } catch (err) {
    // Never let audit logging break the actual request.
    console.error("audit_log write failed:", err);
  }
}

export async function getAuditLog({ limit = 100 } = {}) {
  await ensureAccessSchema();
  const db = sql();
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  return db`
    SELECT id, at, actor_email, action, target, detail
    FROM audit_log
    ORDER BY at DESC
    LIMIT ${lim}
  `;
}
