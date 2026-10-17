// lib/gp-attendance-db.js
// Persistence for the GP (Gyan Prachark) attendance feature.
//
// Same conventions as lib/access-db.js: lazily-initialised neon() client,
// idempotent ensureSchema() guarded by a module-level promise, tagged-template
// SQL.
//
// Tables:
//   gp_attendance        — one row per (person, day) they were marked present.
//                          rid is the global roll number of the GP list.
//                          UNIQUE(rid, marked_on) makes duplicate marking (live,
//                          pasted payloads, re-posts) structurally impossible.
//   gp_attendance_users  — accounts for the 5-10 field people. role follows the
//                          same viewer|editor|super_admin scheme as lib/rbac.js
//                          (editor = can mark attendance, super_admin = admin).

import crypto from "crypto";
import { neon } from "@neondatabase/serverless";
import { normalizeRole, ROLES } from "./rbac.js";

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

export async function ensureGpSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = sql();
      await db`
        CREATE TABLE IF NOT EXISTS gp_attendance (
          rid integer NOT NULL,
          marked_on date NOT NULL,
          at timestamptz NOT NULL DEFAULT now(),
          by text NOT NULL DEFAULT '',
          source text NOT NULL DEFAULT 'live',
          PRIMARY KEY (rid, marked_on)
        )
      `;
      await db`
        CREATE TABLE IF NOT EXISTS gp_attendance_users (
          username text PRIMARY KEY,
          name text,
          role text NOT NULL DEFAULT 'viewer',
          pin_hash text NOT NULL,
          salt text NOT NULL,
          active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          last_login_at timestamptz
        )
      `;
      await seedGpUsers();
    })();
  }
  return schemaPromise;
}

// ---------------------------------------------------------------------------
// PIN hashing (scrypt + per-user salt)
// ---------------------------------------------------------------------------

export function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), String(salt), 32).toString("hex");
}

export function makeSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

// Seed accounts from GP_ATTENDANCE_USERS="user:pin:role,..." on first boot so
// there is always a break-glass admin even before the Users screen is used.
async function seedGpUsers() {
  const raw = process.env.GP_ATTENDANCE_USERS || "";
  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [username, pin, role] = s.split(":").map((x) => x.trim());
      return username && pin ? { username, pin, role: role || ROLES.VIEWER } : null;
    })
    .filter(Boolean);
  if (!entries.length) {
    // Break-glass: make sure an admin account always exists.
    const db = sql();
    const [row] = await db`SELECT COUNT(*)::int AS n FROM gp_attendance_users`;
    if (row?.n === 0) {
      const salt = makeSalt();
      const pin = process.env.GP_ADMIN_PIN || "gp-admin-1234";
      console.warn("[gp-attendance] GP_ATTENDANCE_USERS not set — seeded default admin (username: admin). Change its PIN via the admin Users screen.");
      await db`
        INSERT INTO gp_attendance_users (username, name, role, pin_hash, salt, active)
        VALUES ('admin', 'Admin', ${ROLES.SUPER_ADMIN}, ${hashPin(pin, salt)}, ${salt}, true)
        ON CONFLICT (username) DO NOTHING
      `;
    }
    return;
  }
  const db = sql();
  for (const e of entries) {
    const salt = makeSalt();
    await db`
      INSERT INTO gp_attendance_users (username, name, role, pin_hash, salt, active)
      VALUES (${e.username.toLowerCase()}, ${e.username}, ${normalizeRole(e.role)}, ${hashPin(e.pin, salt)}, ${salt}, true)
      ON CONFLICT (username) DO NOTHING
    `;
  }
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

export async function verifyGpUser(username, pin) {
  const u = normalizeUsername(username);
  if (!u || !pin) return null;
  await ensureGpSchema();
  const db = sql();
  const rows = await db`
    SELECT username, name, role, pin_hash, salt, active
    FROM gp_attendance_users WHERE username = ${u}
  `;
  const row = rows[0];
  if (!row || !row.active) return null;
  if (!safeEqualHex(row.pin_hash, hashPin(pin, row.salt))) return null;
  await db`UPDATE gp_attendance_users SET last_login_at = now() WHERE username = ${u}`;
  return { username: row.username, name: row.name || row.username, role: normalizeRole(row.role) };
}

export async function listGpUsers() {
  await ensureGpSchema();
  const db = sql();
  return db`
    SELECT username, name, role, active, created_at, last_login_at
    FROM gp_attendance_users
    ORDER BY active DESC, username ASC
  `;
}

// Add or update. `pin` optional on update (keeps the existing PIN).
export async function upsertGpUser({ username, name, pin, role, active }) {
  const u = normalizeUsername(username);
  if (!u) throw new Error("username required");
  const r = normalizeRole(role);
  const a = active === undefined ? true : !!active;
  await ensureGpSchema();
  const db = sql();
  if (pin) {
    const salt = makeSalt();
    await db`
      INSERT INTO gp_attendance_users (username, name, role, pin_hash, salt, active)
      VALUES (${u}, ${name || u}, ${r}, ${hashPin(pin, salt)}, ${salt}, ${a})
      ON CONFLICT (username) DO UPDATE
        SET name = ${name || u}, role = ${r}, active = ${a}, pin_hash = ${hashPin(pin, salt)}, salt = ${salt}
      RETURNING username, name, role, active, created_at, last_login_at
    `;
  } else {
    const rows = await db`
      UPDATE gp_attendance_users SET name = ${name || null}, role = ${r}, active = ${a}
      WHERE username = ${u}
      RETURNING username, name, role, active, created_at, last_login_at
    `;
    if (!rows.length) throw new Error("user not found — set a PIN to create it");
    return rows[0];
  }
  const rows = await db`SELECT username, name, role, active, created_at, last_login_at FROM gp_attendance_users WHERE username = ${u}`;
  return rows[0];
}

export async function setGpUserActive(username, active) {
  const u = normalizeUsername(username);
  await ensureGpSchema();
  const db = sql();
  return db`UPDATE gp_attendance_users SET active = ${!!active} WHERE username = ${u} RETURNING username, name, role, active`;
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

// marks: [{ rid, at?, by?, source? }] — duplicates are silently ignored.
export async function markGp(marks) {
  await ensureGpSchema();
  const db = sql();
  let updated = 0;
  for (const m of marks.slice(0, 5000)) {
    const rid = Number(m.rid);
    if (!Number.isInteger(rid) || rid <= 0) continue;
    const result = await db`
      INSERT INTO gp_attendance (rid, marked_on, at, by, source)
      VALUES (${rid}, ${m.date}::date, ${m.at || new Date().toISOString()}::timestamptz, ${m.by || ""}::text, ${m.source || "live"}::text)
      ON CONFLICT (rid, marked_on) DO NOTHING
      RETURNING rid
    `;
    updated += result.length;
  }
  return { updated };
}

// Admin-only removal: entries [{ rid, date }]
export async function unmarkGp(entries) {
  await ensureGpSchema();
  const db = sql();
  let removed = 0;
  for (const e of entries.slice(0, 5000)) {
    const rid = Number(e.rid);
    if (!Number.isInteger(rid) || !/^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ""))) continue;
    const result = await db`
      DELETE FROM gp_attendance WHERE rid = ${rid} AND marked_on = ${e.date}::date RETURNING rid
    `;
    removed += result.length;
  }
  return { removed };
}

export async function getGpMarks() {
  await ensureGpSchema();
  const db = sql();
  // marked_on::text — a plain "yyyy-mm-dd" string. A raw `date` column arrives
  // as a JS Date built at LOCAL midnight, which shifts the civil day across
  // timezones (IS+5:30 → UTC returns the previous day).
  return db`
    SELECT rid, marked_on::text AS marked_on, at, by, source
    FROM gp_attendance
    ORDER BY marked_on DESC, at DESC
  `;
}

export async function getGpCounts() {
  await ensureGpSchema();
  const db = sql();
  const rows = await db`
    SELECT rid, COUNT(*)::int AS days FROM gp_attendance GROUP BY rid
  `;
  const map = {};
  for (const r of rows) map[r.rid] = r.days;
  return map;
}
