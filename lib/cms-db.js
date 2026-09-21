// lib/cms-db.js
// Data layer for the Form CMS. Mirrors lib/db.js conventions: lazy neon() client,
// idempotent ensureSchema() guarded by a module-level promise, raw tagged-template SQL.
//
// DESIGN NOTE (non-breaking): dynamic CMS forms store their answers in a NEW
// `form_submissions` table — deliberately NOT the existing `submissions` table.
// The legacy dashboard/stats/export in lib/db.js count and shape rows from
// `submissions` assuming the 3 hardcoded categories and NOT-NULL name/phone/zone
// columns; mixing arbitrary dynamic answers in there would pollute those numbers
// and could violate the schema. Keeping a separate table means nothing existing
// changes. The 3 legacy forms are represented here as read-only rows whose
// submissions continue to live in `submissions` (surfaced via the main dashboard).

import crypto from "crypto";
import { neon } from "@neondatabase/serverless";
import { slugify, validateFormDefinition } from "./form-schema.js";

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

// Read-only definitions for the 3 existing forms so they appear in the CMS list.
// Their public pages remain the static HTML served via next.config rewrites; their
// submissions remain in the `submissions` table. We do NOT render or submit these
// through the CMS — managed:'legacy' marks them read-only in the builder.
const LEGACY_FORMS = [
  {
    slug: "pracharak-mahatma",
    title: "Pracharak / Mahatma Feedback",
    description: "Satsang feedback for Mahila, Bal and EMS programs.",
    category: "feedback",
    public_path: "/feedback/pracharak-mahatma",
  },
  {
    slug: "branch-incharge",
    title: "Branch Incharge Feedback",
    description: "Feedback on branch incharge arrival, conduct and program.",
    category: "feedback",
    public_path: "/feedback/branch-incharge",
  },
  {
    slug: "gbm-ebm",
    title: "GBM / EBM Registration",
    description: "Registration and availability for the 79th Samagam.",
    category: "registration",
    public_path: "/gbm-ebm",
  },
];

export async function ensureCmsSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = sql();
      await db`
        CREATE TABLE IF NOT EXISTS forms (
          id text PRIMARY KEY,
          slug text UNIQUE NOT NULL,
          title text NOT NULL,
          description text,
          category text,
          status text NOT NULL DEFAULT 'draft',
          managed text NOT NULL DEFAULT 'cms',
          public_path text,
          schema jsonb NOT NULL DEFAULT '[]'::jsonb,
          version integer NOT NULL DEFAULT 1,
          created_by text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await db`
        CREATE TABLE IF NOT EXISTS form_submissions (
          id text PRIMARY KEY,
          form_slug text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          payload jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `;
      await db`
        CREATE INDEX IF NOT EXISTS form_submissions_slug_idx
        ON form_submissions (form_slug, created_at DESC)
      `;
      // Seed the 3 legacy forms as read-only, published rows (idempotent).
      for (const f of LEGACY_FORMS) {
        await db`
          INSERT INTO forms (id, slug, title, description, category, status, managed, public_path, schema, created_by)
          VALUES (${crypto.randomUUID()}, ${f.slug}, ${f.title}, ${f.description}, ${f.category},
                  'published', 'legacy', ${f.public_path}, '[]'::jsonb, 'system')
          ON CONFLICT (slug) DO UPDATE SET
            managed = 'legacy',
            public_path = EXCLUDED.public_path
        `;
      }
    })();
  }
  return schemaPromise;
}

function rowToForm(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || "",
    category: row.category || "",
    status: row.status,
    managed: row.managed,
    publicPath: row.public_path || (row.managed === "legacy" ? null : `/f/${row.slug}`),
    schema: Array.isArray(row.schema) ? row.schema : [],
    version: row.version,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readOnly: row.managed === "legacy",
  };
}

export async function listForms() {
  await ensureCmsSchema();
  const db = sql();
  const rows = await db`
    SELECT * FROM forms
    ORDER BY (managed = 'legacy') ASC, updated_at DESC
  `;
  return rows.map(rowToForm);
}

export async function getFormById(id) {
  await ensureCmsSchema();
  const db = sql();
  const [row] = await db`SELECT * FROM forms WHERE id = ${id}`;
  return rowToForm(row);
}

export async function getFormBySlug(slug) {
  await ensureCmsSchema();
  const db = sql();
  const [row] = await db`SELECT * FROM forms WHERE slug = ${slug}`;
  return rowToForm(row);
}

export async function getPublishedCmsFormBySlug(slug) {
  const form = await getFormBySlug(slug);
  if (!form || form.status !== "published" || form.managed === "legacy") return null;
  return form;
}

// Generate a unique slug from a title, appending -2, -3, ... on collision.
async function uniqueSlug(db, base) {
  const root = slugify(base) || "form";
  let candidate = root;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [hit] = await db`SELECT 1 FROM forms WHERE slug = ${candidate}`;
    if (!hit) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

export async function createForm({ title, description = "", category = "", createdBy = null }) {
  await ensureCmsSchema();
  const db = sql();
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) throw new Error("Title is required");
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, cleanTitle);
  const [row] = await db`
    INSERT INTO forms (id, slug, title, description, category, status, managed, schema, created_by)
    VALUES (${id}, ${slug}, ${cleanTitle}, ${description || null}, ${category || null},
            'draft', 'cms', '[]'::jsonb, ${createdBy})
    RETURNING *
  `;
  return rowToForm(row);
}

// Update editable metadata and/or the field schema of a CMS form. Returns
// { ok, form?, errors? }. Legacy forms are read-only.
export async function updateForm(id, { title, description, category, schema } = {}) {
  await ensureCmsSchema();
  const db = sql();
  const existing = await getFormById(id);
  if (!existing) return { ok: false, errors: ["Form not found."] };
  if (existing.readOnly) return { ok: false, errors: ["This form is managed as a legacy form and cannot be edited."] };

  let nextSchema = existing.schema;
  if (schema !== undefined) {
    const check = validateFormDefinition(schema);
    if (!check.ok) return { ok: false, errors: check.errors };
    nextSchema = check.fields;
  }

  const nextTitle = title !== undefined ? String(title).trim() : existing.title;
  if (!nextTitle) return { ok: false, errors: ["Title cannot be empty."] };
  const nextDesc = description !== undefined ? String(description).trim() : existing.description;
  const nextCat = category !== undefined ? String(category).trim() : existing.category;

  const [row] = await db`
    UPDATE forms SET
      title = ${nextTitle},
      description = ${nextDesc || null},
      category = ${nextCat || null},
      schema = ${JSON.stringify(nextSchema)}::jsonb,
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return { ok: true, form: rowToForm(row) };
}

// Publish or unpublish. Publishing requires a valid, non-empty schema.
export async function setFormStatus(id, status) {
  await ensureCmsSchema();
  const db = sql();
  const existing = await getFormById(id);
  if (!existing) return { ok: false, errors: ["Form not found."] };
  if (existing.readOnly) return { ok: false, errors: ["Legacy forms cannot be changed."] };
  if (status !== "published" && status !== "draft") {
    return { ok: false, errors: ["Invalid status."] };
  }
  if (status === "published") {
    const check = validateFormDefinition(existing.schema);
    if (!check.ok) return { ok: false, errors: check.errors };
    if (check.fields.length === 0) return { ok: false, errors: ["Add at least one field before publishing."] };
  }
  const bumpVersion = status === "published" ? existing.version + 1 : existing.version;
  const [row] = await db`
    UPDATE forms SET status = ${status}, version = ${bumpVersion}, updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return { ok: true, form: rowToForm(row) };
}

export async function deleteForm(id) {
  await ensureCmsSchema();
  const db = sql();
  const existing = await getFormById(id);
  if (!existing) return { ok: false, errors: ["Form not found."] };
  if (existing.readOnly) return { ok: false, errors: ["Legacy forms cannot be deleted."] };
  await db`DELETE FROM form_submissions WHERE form_slug = ${existing.slug}`;
  await db`DELETE FROM forms WHERE id = ${id}`;
  return { ok: true };
}

// ---- Dynamic form submissions (form_submissions table) ----

export async function createFormSubmission(slug, payload) {
  await ensureCmsSchema();
  const db = sql();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db`
    INSERT INTO form_submissions (id, form_slug, created_at, payload)
    VALUES (${id}, ${slug}, ${createdAt}, ${JSON.stringify(payload || {})}::jsonb)
  `;
  return { id, createdAt };
}

export async function countFormSubmissions(slug) {
  await ensureCmsSchema();
  const db = sql();
  const [row] = await db`SELECT COUNT(*)::int AS count FROM form_submissions WHERE form_slug = ${slug}`;
  return row?.count || 0;
}

export async function getFormSubmissionsPage(slug, { page = 1, limit = 20 } = {}) {
  await ensureCmsSchema();
  const db = sql();
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;
  const [countRow] = await db`SELECT COUNT(*)::int AS count FROM form_submissions WHERE form_slug = ${slug}`;
  const rows = await db`
    SELECT id, created_at, payload
    FROM form_submissions
    WHERE form_slug = ${slug}
    ORDER BY created_at DESC
    LIMIT ${safeLimit} OFFSET ${offset}
  `;
  return { rows, total: countRow?.count || 0 };
}

export async function getAllFormSubmissions(slug) {
  await ensureCmsSchema();
  const db = sql();
  return db`
    SELECT id, created_at, payload
    FROM form_submissions
    WHERE form_slug = ${slug}
    ORDER BY created_at DESC
  `;
}
