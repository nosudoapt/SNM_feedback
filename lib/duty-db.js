import crypto from "crypto";
import fs from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";

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

export async function ensureDutySchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = sql();

      await db`
        CREATE TABLE IF NOT EXISTS duty_sectors (
          id text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          name text NOT NULL,
          incharge_name text,
          is_active boolean NOT NULL DEFAULT true,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `;

      await db`
        CREATE TABLE IF NOT EXISTS duty_pracharaks (
          id text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          name text NOT NULL,
          contact text,
          sector_id text,
          rating smallint NOT NULL DEFAULT 2,
          monthly_target int NOT NULL DEFAULT 2,
          is_active boolean NOT NULL DEFAULT true,
          aw_ad boolean NOT NULL DEFAULT false,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `;

      await db`
        CREATE TABLE IF NOT EXISTS duty_satsangs (
          id text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          name text NOT NULL,
          address text,
          contact text,
          sector_id text,
          day_of_week smallint NOT NULL DEFAULT 0,
          date date,
          time_type char(1) NOT NULL DEFAULT 'M',
          time_slot text NOT NULL DEFAULT '10:00',
          rating smallint NOT NULL DEFAULT 2,
          is_active boolean NOT NULL DEFAULT true,
          predefined_local_pracharak_id text,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `;

      await db`
        CREATE TABLE IF NOT EXISTS duty_preferences (
          id text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          pracharak_id text NOT NULL,
          set_name text NOT NULL DEFAULT 'Default',
          is_active boolean NOT NULL DEFAULT true,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `;

      await db`
        CREATE TABLE IF NOT EXISTS duty_lists (
          id text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          created_by text,
          month int NOT NULL,
          year int NOT NULL,
          comparison_month int,
          comparison_year int,
          status text NOT NULL DEFAULT 'draft',
          version int NOT NULL DEFAULT 1,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `;

      await db`
        CREATE TABLE IF NOT EXISTS duty_assignments (
          id text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          list_id text NOT NULL,
          satsang_id text NOT NULL,
          pracharak_id text,
          duty_date date NOT NULL,
          is_local boolean NOT NULL DEFAULT false,
          local_kind text NOT NULL DEFAULT 'none',
          reason_code text,
          overridden_by_user boolean NOT NULL DEFAULT false,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `;

      await db`
        CREATE TABLE IF NOT EXISTS duty_rule_config (
          key text PRIMARY KEY,
          updated_at timestamptz NOT NULL DEFAULT now(),
          value jsonb NOT NULL
        )
      `;

      await db`
        CREATE TABLE IF NOT EXISTS duty_export_runs (
          id text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          view_name text NOT NULL,
          list_id text,
          row_count int NOT NULL
        )
      `;

      await db`
        CREATE TABLE IF NOT EXISTS duty_audit (
          id text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          actor text,
          action text NOT NULL,
          list_id text,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `;

      await db`CREATE INDEX IF NOT EXISTS idx_duty_assignments_list ON duty_assignments(list_id)`;
      await db`CREATE INDEX IF NOT EXISTS idx_duty_assignments_pracharak ON duty_assignments(pracharak_id)`;
    })();
  }
  return schemaPromise;
}

// ---------- Branches (Phase 1) ----------
let branchSchemaPromise = null;
export async function ensureBranchSchema() {
  if (!branchSchemaPromise) {
    branchSchemaPromise = (async () => {
      await ensureDutySchema();
      const db = sql();

      await db`
        CREATE TABLE IF NOT EXISTS duty_branches (
          id text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          name text NOT NULL,
          branch_code text,
          sector_id text,
          city text,
          area text,
          address text,
          contact_person text,
          contact_phone text,
          location_type text NOT NULL DEFAULT 'urban',
          required_specializations text[] NOT NULL DEFAULT '{}',
          required_days jsonb NOT NULL DEFAULT '[{"week":1,"day":1},{"week":2,"day":1}]'::jsonb,
          is_active boolean NOT NULL DEFAULT true,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `;

      await db`CREATE INDEX IF NOT EXISTS idx_duty_branches_sector ON duty_branches(sector_id)`;
      await db`CREATE INDEX IF NOT EXISTS idx_duty_branches_city ON duty_branches(city)`;
      await db`CREATE INDEX IF NOT EXISTS idx_duty_branches_active ON duty_branches(is_active)`;
    })();
  }
  return branchSchemaPromise;
}

// ---------- Specialization columns (Phase 1) ----------
let specColumnPromise = null;
export async function ensureSpecializationColumns() {
  if (!specColumnPromise) {
    specColumnPromise = (async () => {
      await ensureDutySchema();
      const db = sql();
      await db`ALTER TABLE duty_pracharaks ADD COLUMN IF NOT EXISTS specializations text[] NOT NULL DEFAULT '{}'`;
      await db`ALTER TABLE duty_pracharaks ADD COLUMN IF NOT EXISTS city text`;
      await db`ALTER TABLE duty_pracharaks ADD COLUMN IF NOT EXISTS is_outstation boolean NOT NULL DEFAULT false`;
      await db`ALTER TABLE duty_pracharaks ADD COLUMN IF NOT EXISTS home_city text`;
    })();
  }
  return specColumnPromise;
}

// ---------- Full schema init (call once on app startup) ----------
let fullInitPromise = null;
export async function ensureFullDutySchema() {
  if (!fullInitPromise) {
    fullInitPromise = (async () => {
      await ensureDutySchema();
      await ensureBranchSchema();
      await ensureSpecializationColumns();
      // Additional indexes for common query patterns
      const db = sql();
      await db`CREATE INDEX IF NOT EXISTS idx_duty_pracharaks_sector ON duty_pracharaks(sector_id)`;
      await db`CREATE INDEX IF NOT EXISTS idx_duty_pracharaks_active ON duty_pracharaks(is_active)`;
      await db`CREATE INDEX IF NOT EXISTS idx_duty_satsangs_sector ON duty_satsangs(sector_id)`;
      await db`CREATE INDEX IF NOT EXISTS idx_duty_satsangs_active ON duty_satsangs(is_active)`;
      await db`CREATE INDEX IF NOT EXISTS idx_duty_preferences_pracharak ON duty_preferences(pracharak_id)`;
      await db`CREATE INDEX IF NOT EXISTS idx_duty_preferences_active ON duty_preferences(is_active)`;
      await db`ALTER TABLE duty_satsangs ADD COLUMN IF NOT EXISTS date date`;
      await db`ALTER TABLE duty_branches ADD COLUMN IF NOT EXISTS required_days jsonb DEFAULT '[{"week":1,"day":1},{"week":2,"day":1}]'::jsonb`;
    })();
  }
  return fullInitPromise;
}

// ---------- Rule config ----------
export const DEFAULT_RULE_CONFIG = {
  minGapDays: 5,
  branchCooldownMonths: 3,
  // rows = pracharak rating, cols = satsang rating; true = allowed.
  // Rating 1 = highest capability. A rating-3 pracharak may not lead a rating-1 satsang.
  ratingMatrix: {
    1: { 1: true, 2: true, 3: true },
    2: { 1: true, 2: true, 3: true },
    3: { 1: false, 2: true, 3: true },
  },
  dimensionMode: { area: "hard", day: "hard", week: "hard", time: "soft" },
  sewaCountStrict: false,
  rotationWeight: 1,
  scoringWeights: { preference: 3, locality: 2, rotation: 1, utilization: 2 },
};

export async function getRuleConfig() {
  await ensureDutySchema();
  const db = sql();
  const [row] = await db`SELECT value FROM duty_rule_config WHERE key = 'global'`;
  if (!row) {
    await db`
      INSERT INTO duty_rule_config (key, value)
      VALUES ('global', ${JSON.stringify(DEFAULT_RULE_CONFIG)}::jsonb)
      ON CONFLICT (key) DO NOTHING
    `;
    return DEFAULT_RULE_CONFIG;
  }
  return { ...DEFAULT_RULE_CONFIG, ...row.value };
}

export async function updateRuleConfig(patch) {
  await ensureDutySchema();
  const db = sql();
  const current = await getRuleConfig();
  const next = { ...current, ...patch };
  await db`
    INSERT INTO duty_rule_config (key, value, updated_at)
    VALUES ('global', ${JSON.stringify(next)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(next)}::jsonb, updated_at = now()
  `;
  return next;
}

// ---------- Sectors ----------
export async function getSectors() {
  await ensureDutySchema();
  const db = sql();
  return db`SELECT * FROM duty_sectors ORDER BY name ASC`;
}

// ---------- Satsangs ----------
export async function getSatsangsPage({ q = "", sectorId = "", day = "", active = "", sort = "name", order = "asc", page = 1, limit = 20 } = {}) {
  await ensureDutySchema();
  const db = sql();
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;
  const sortCols = { name: "name", created_at: "created_at", day_of_week: "day_of_week", rating: "rating" };
  const sortCol = sortCols[sort] || "name";
  const dir = order === "desc" ? "DESC" : "ASC";

  const conds = [];
  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    conds.push(db`(name ILIKE ${term} OR address ILIKE ${term})`);
  }
  if (sectorId) conds.push(db`sector_id = ${sectorId}`);
  if (day !== "") conds.push(db`day_of_week = ${Number(day)}`);
  if (active === "true") conds.push(db`is_active = true`);
  if (active === "false") conds.push(db`is_active = false`);

  let where = db``;
  if (conds.length) {
    where = db`WHERE ${conds[0]}`;
    for (let i = 1; i < conds.length; i += 1) where = db`${where} AND ${conds[i]}`;
  }

  const [countRow] = await db`SELECT COUNT(*)::int AS count FROM duty_satsangs ${where}`;
  const rows = await db`
    SELECT * FROM duty_satsangs ${where}
    ORDER BY ${db.unsafe(`${sortCol} ${dir}`)}
    LIMIT ${safeLimit} OFFSET ${offset}
  `;
  return { rows, total: countRow?.count || 0 };
}

export async function createSatsang(record) {
  await ensureDutySchema();
  const db = sql();
  const id = crypto.randomUUID();
  await db`
    INSERT INTO duty_satsangs (id, name, address, contact, sector_id, day_of_week, date, time_type, time_slot, rating, predefined_local_pracharak_id, payload)
    VALUES (${id}, ${record.name}, ${record.address || null}, ${record.contact || null}, ${record.sectorId || null},
            ${record.dayOfWeek ?? 0}, ${record.date || null}, ${record.timeType || "M"}, ${record.timeSlot || "10:00"}, ${record.rating ?? 2},
            ${record.predefinedLocalId || null}, ${JSON.stringify(record.payload || {})}::jsonb)
  `;
  return { id };
}

export async function updateSatsang(id, patch) {
  await ensureDutySchema();
  const db = sql();
  const sets = [];
  if (patch.name !== undefined) sets.push(db`name = ${patch.name}`);
  if (patch.address !== undefined) sets.push(db`address = ${patch.address}`);
  if (patch.contact !== undefined) sets.push(db`contact = ${patch.contact}`);
  if (patch.sectorId !== undefined) sets.push(db`sector_id = ${patch.sectorId}`);
  if (patch.dayOfWeek !== undefined) sets.push(db`day_of_week = ${patch.dayOfWeek}`);
  if (patch.date !== undefined) sets.push(db`date = ${patch.date || null}`);
  if (patch.timeType !== undefined) sets.push(db`time_type = ${patch.timeType}`);
  if (patch.timeSlot !== undefined) sets.push(db`time_slot = ${patch.timeSlot}`);
  if (patch.rating !== undefined) sets.push(db`rating = ${patch.rating}`);
  if (patch.isActive !== undefined) sets.push(db`is_active = ${patch.isActive}`);
  if (patch.predefinedLocalId !== undefined) sets.push(db`predefined_local_pracharak_id = ${patch.predefinedLocalId}`);
  if (!sets.length) return { updated: 0 };
  let query = db`UPDATE duty_satsangs SET ${sets[0]}`;
  for (let i = 1; i < sets.length; i += 1) query = db`${query}, ${sets[i]}`;
  query = db`${query} WHERE id = ${id}`;
  const result = await query;
  return { updated: result?.length || 0 };
}

export async function deleteSatsang(id) {
  await ensureDutySchema();
  const db = sql();
  const result = await db`DELETE FROM duty_satsangs WHERE id = ${id}`;
  return { deleted: result?.length || 0 };
}

// ---------- Branches ----------
export async function getBranchesPage({ q = "", sectorId = "", city = "", active = "", sort = "name", order = "asc", page = 1, limit = 20 } = {}) {
  await ensureFullDutySchema();
  const db = sql();
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;
  const sortCols = { name: "name", created_at: "created_at", city: "city", required_tier: "required_tier" };
  const sortCol = sortCols[sort] || "name";
  const dir = order === "desc" ? "DESC" : "ASC";

  const conds = [];
  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    conds.push(db`(name ILIKE ${term} OR city ILIKE ${term} OR area ILIKE ${term} OR branch_code ILIKE ${term})`);
  }
  if (sectorId) conds.push(db`sector_id = ${sectorId}`);
  if (city) conds.push(db`city ILIKE ${`%${city}%`}`);
  if (active === "true") conds.push(db`is_active = true`);
  if (active === "false") conds.push(db`is_active = false`);

  let where = db``;
  if (conds.length) {
    where = db`WHERE ${conds[0]}`;
    for (let i = 1; i < conds.length; i += 1) where = db`${where} AND ${conds[i]}`;
  }

  const [countRow] = await db`SELECT COUNT(*)::int AS count FROM duty_branches ${where}`;
  const rows = await db`
    SELECT * FROM duty_branches ${where}
    ORDER BY ${db.unsafe(`${sortCol} ${dir}`)}
    LIMIT ${safeLimit} OFFSET ${offset}
  `;
  return { rows, total: countRow?.count || 0 };
}

export async function createBranch(record) {
  await ensureFullDutySchema();
  const db = sql();
  const id = crypto.randomUUID();
  const requiredDays = Array.isArray(record.requiredDays) ? record.requiredDays : [{ week: 1, day: 1 }, { week: 2, day: 1 }];
  await db`
    INSERT INTO duty_branches (id, name, branch_code, sector_id, city, area, address,
      contact_person, contact_phone, location_type, required_specializations,
      required_days, payload)
    VALUES (${id}, ${record.name}, ${record.branchCode || null}, ${record.sectorId || null},
            ${record.city || null}, ${record.area || null}, ${record.address || null},
            ${record.contactPerson || null}, ${record.contactPhone || null},
            ${record.locationType || "urban"},
            ${record.requiredSpecializations || []}, ${JSON.stringify(requiredDays)}::jsonb,
            ${JSON.stringify(record.payload || {})}::jsonb)
  `;
  return { id };
}

export async function updateBranch(id, patch) {
  await ensureFullDutySchema();
  const db = sql();
  const sets = [];
  if (patch.name !== undefined) sets.push(db`name = ${patch.name}`);
  if (patch.branchCode !== undefined) sets.push(db`branch_code = ${patch.branchCode}`);
  if (patch.sectorId !== undefined) sets.push(db`sector_id = ${patch.sectorId}`);
  if (patch.city !== undefined) sets.push(db`city = ${patch.city}`);
  if (patch.area !== undefined) sets.push(db`area = ${patch.area}`);
  if (patch.address !== undefined) sets.push(db`address = ${patch.address}`);
  if (patch.contactPerson !== undefined) sets.push(db`contact_person = ${patch.contactPerson}`);
  if (patch.contactPhone !== undefined) sets.push(db`contact_phone = ${patch.contactPhone}`);
  if (patch.locationType !== undefined) sets.push(db`location_type = ${patch.locationType}`);
  if (patch.requiredSpecializations !== undefined) sets.push(db`required_specializations = ${patch.requiredSpecializations}`);
  if (patch.requiredDays !== undefined) sets.push(db`required_days = ${patch.requiredDays}`);
  if (patch.isActive !== undefined) sets.push(db`is_active = ${patch.isActive}`);
  if (!sets.length) return { updated: 0 };
  let query = db`UPDATE duty_branches SET ${sets[0]}`;
  for (let i = 1; i < sets.length; i += 1) query = db`${query}, ${sets[i]}`;
  query = db`${query} WHERE id = ${id}`;
  const result = await query;
  return { updated: result?.length || 0 };
}

export async function deleteBranch(id) {
  await ensureFullDutySchema();
  const db = sql();
  const result = await db`DELETE FROM duty_branches WHERE id = ${id}`;
  return { deleted: result?.length || 0 };
}

export async function getAllActiveBranches() {
  await ensureFullDutySchema();
  const db = sql();
  const rows = await db`SELECT * FROM duty_branches WHERE is_active = true ORDER BY name ASC`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    branchCode: r.branch_code || null,
    sectorId: r.sector_id || null,
    city: r.city || null,
    area: r.area || null,
    address: r.address || null,
    contactPerson: r.contact_person || null,
    contactPhone: r.contact_phone || null,
    locationType: r.location_type || "urban",
    requiredSpecializations: r.required_specializations || [],
    requiredDays: r.required_days || [{ week: 1, day: 1 }, { week: 2, day: 1 }],
    isActive: r.is_active !== false,
  }));
}

// ---------- Pracharaks ----------
export async function getPracharaksPage({ q = "", sectorId = "", rating = "", active = "", sort = "name", order = "asc", page = 1, limit = 20 } = {}) {
  await ensureDutySchema();
  const db = sql();
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;
  const sortCols = { name: "name", created_at: "created_at", rating: "rating", monthly_target: "monthly_target" };
  const sortCol = sortCols[sort] || "name";
  const dir = order === "desc" ? "DESC" : "ASC";

  const conds = [];
  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    conds.push(db`(name ILIKE ${term} OR contact ILIKE ${term})`);
  }
  if (sectorId) conds.push(db`sector_id = ${sectorId}`);
  if (rating) conds.push(db`rating = ${Number(rating)}`);
  if (active === "true") conds.push(db`is_active = true`);
  if (active === "false") conds.push(db`is_active = false`);

  let where = db``;
  if (conds.length) {
    where = db`WHERE ${conds[0]}`;
    for (let i = 1; i < conds.length; i += 1) where = db`${where} AND ${conds[i]}`;
  }

  const [countRow] = await db`SELECT COUNT(*)::int AS count FROM duty_pracharaks ${where}`;
  const rows = await db`
    SELECT * FROM duty_pracharaks ${where}
    ORDER BY ${db.unsafe(`${sortCol} ${dir}`)}
    LIMIT ${safeLimit} OFFSET ${offset}
  `;
  return { rows, total: countRow?.count || 0 };
}

export async function createPracharak(record) {
  await ensureDutySchema();
  const db = sql();
  const id = crypto.randomUUID();
  const specializations = Array.isArray(record.specializations) ? record.specializations : [];
  const city = record.city ? String(record.city).trim() : null;
  const isOutstation = Boolean(record.isOutstation);
  const homeCity = record.homeCity ? String(record.homeCity).trim() : null;
  await db`
    INSERT INTO duty_pracharaks (id, name, contact, sector_id, rating, monthly_target, aw_ad, specializations, city, is_outstation, home_city, payload)
    VALUES (${id}, ${record.name}, ${record.contact || null}, ${record.sectorId || null},
            ${record.rating ?? 2}, ${record.monthlyTarget ?? 2}, ${record.awAd ?? false},
            ${specializations}, ${city}, ${isOutstation}, ${homeCity},
            ${JSON.stringify(record.payload || {})}::jsonb)
  `;
  return { id };
}

export async function updatePracharak(id, patch) {
  await ensureDutySchema();
  const db = sql();
  const sets = [];
  if (patch.name !== undefined) sets.push(db`name = ${patch.name}`);
  if (patch.contact !== undefined) sets.push(db`contact = ${patch.contact}`);
  if (patch.sectorId !== undefined) sets.push(db`sector_id = ${patch.sectorId}`);
  if (patch.rating !== undefined) sets.push(db`rating = ${patch.rating}`);
  if (patch.monthlyTarget !== undefined) sets.push(db`monthly_target = ${patch.monthlyTarget}`);
  if (patch.isActive !== undefined) sets.push(db`is_active = ${patch.isActive}`);
  if (patch.awAd !== undefined) sets.push(db`aw_ad = ${patch.awAd}`);
  if (patch.specializations !== undefined) sets.push(db`specializations = ${Array.isArray(patch.specializations) ? patch.specializations : []}`);
  if (patch.city !== undefined) sets.push(db`city = ${patch.city || null}`);
  if (patch.isOutstation !== undefined) sets.push(db`is_outstation = ${Boolean(patch.isOutstation)}`);
  if (patch.homeCity !== undefined) sets.push(db`home_city = ${patch.homeCity || null}`);
  if (!sets.length) return { updated: 0 };
  let query = db`UPDATE duty_pracharaks SET ${sets[0]}`;
  for (let i = 1; i < sets.length; i += 1) query = db`${query}, ${sets[i]}`;
  query = db`${query} WHERE id = ${id}`;
  const result = await query;
  return { updated: result?.length || 0 };
}

export async function deletePracharak(id) {
  await ensureDutySchema();
  const db = sql();
  const result = await db`DELETE FROM duty_pracharaks WHERE id = ${id}`;
  return { deleted: result?.length || 0 };
}

export async function getPracharakWithHistory(id) {
  await ensureDutySchema();
  const db = sql();
  const [pracharak] = await db`SELECT * FROM duty_pracharaks WHERE id = ${id}`;
  if (!pracharak) return null;
  const history = await db`
    SELECT da.*, ds.name AS satsang_name, ds.address AS satsang_address
    FROM duty_assignments da
    JOIN duty_satsangs ds ON ds.id = da.satsang_id
    WHERE da.pracharak_id = ${id}
    ORDER BY da.duty_date DESC
  `;
  const [countRow] = await db`SELECT COUNT(*)::int AS count FROM duty_assignments WHERE pracharak_id = ${id}`;
  return { pracharak, history, lifetimeSewaCount: countRow?.count || 0 };
}

// ---------- Pracharak preferences ----------
// A pracharak can have several named preference sets. Each set stores the
// dimensions the duty engine cares about in payload:
//   { sectorIds: string[], days: number[], weeks: number[], times: string[], note: string }
// Empty array in any dimension means "no restriction on this dimension".
export async function getPreferenceSets(pracharakId) {
  await ensureDutySchema();
  const db = sql();
  return db`SELECT * FROM duty_preferences WHERE pracharak_id = ${pracharakId} ORDER BY created_at ASC`;
}

export async function getPreferenceSet(id) {
  await ensureDutySchema();
  const db = sql();
  const [row] = await db`SELECT * FROM duty_preferences WHERE id = ${id}`;
  return row || null;
}

export async function createPreferenceSet(record) {
  await ensureDutySchema();
  const db = sql();
  const id = crypto.randomUUID();
  await db`
    INSERT INTO duty_preferences (id, pracharak_id, set_name, is_active, payload)
    VALUES (${id}, ${record.pracharakId}, ${record.setName || "Default"}, ${record.isActive ?? true},
            ${JSON.stringify(record.payload || {})}::jsonb)
  `;
  return { id };
}

export async function updatePreferenceSet(id, patch) {
  await ensureDutySchema();
  const db = sql();
  const sets = [];
  if (patch.setName !== undefined) sets.push(db`set_name = ${patch.setName}`);
  if (patch.isActive !== undefined) sets.push(db`is_active = ${patch.isActive}`);
  if (patch.payload !== undefined) sets.push(db`payload = ${JSON.stringify(patch.payload)}::jsonb`);
  if (!sets.length) return { updated: 0 };
  let query = db`UPDATE duty_preferences SET ${sets[0]}`;
  for (let i = 1; i < sets.length; i += 1) query = db`${query}, ${sets[i]}`;
  query = db`${query} WHERE id = ${id} RETURNING id`;
  const result = await query;
  return { updated: result?.length || 0 };
}

export async function deletePreferenceSet(id) {
  await ensureDutySchema();
  const db = sql();
  const result = await db`DELETE FROM duty_preferences WHERE id = ${id} RETURNING id`;
  return { deleted: result?.length || 0 };
}

export async function deleteAllPreferenceSets(pracharakId) {
  await ensureDutySchema();
  const db = sql();
  const result = await db`DELETE FROM duty_preferences WHERE pracharak_id = ${pracharakId} RETURNING id`;
  return { deleted: result?.length || 0 };
}

// Copies every preference set from one pracharak onto another (fresh ids).
export async function copyPreferenceSets(fromPracharakId, toPracharakId) {
  await ensureDutySchema();
  const db = sql();
  const source = await db`SELECT set_name, is_active, payload FROM duty_preferences WHERE pracharak_id = ${fromPracharakId} ORDER BY created_at ASC`;
  let copied = 0;
  for (const row of source) {
    await db`
      INSERT INTO duty_preferences (id, pracharak_id, set_name, is_active, payload)
      VALUES (${crypto.randomUUID()}, ${toPracharakId}, ${row.set_name}, ${row.is_active}, ${JSON.stringify(row.payload || {})}::jsonb)
    `;
    copied += 1;
  }
  return { copied };
}

// ---------- Lists ----------
export async function createDraftList({ month, year, comparisonMonth, comparisonYear, createdBy, payload }) {
  await ensureDutySchema();
  const db = sql();
  const id = crypto.randomUUID();

  const [prev] = await db`
    SELECT COALESCE(MAX(version), 0) AS v FROM duty_lists
    WHERE month = ${month} AND year = ${year}
  `;
  const version = (prev?.v || 0) + 1;

  await db`
    INSERT INTO duty_lists (id, created_by, month, year, comparison_month, comparison_year, status, version, payload)
    VALUES (${id}, ${createdBy || "admin"}, ${month}, ${year}, ${comparisonMonth}, ${comparisonYear}, 'draft', ${version}, ${JSON.stringify(payload || {})}::jsonb)
  `;
  return { id, version };
}

export async function getList(id) {
  await ensureDutySchema();
  const db = sql();
  const [list] = await db`SELECT * FROM duty_lists WHERE id = ${id}`;
  return list || null;
}

export async function listDutyLists({ limit = 50 } = {}) {
  await ensureDutySchema();
  const db = sql();
  return db`SELECT * FROM duty_lists ORDER BY year DESC, month DESC, version DESC LIMIT ${Math.min(Number(limit) || 50, 200)}`;
}

export async function commitList(id) {
  await ensureDutySchema();
  const db = sql();
  const result = await db`UPDATE duty_lists SET status = 'committed' WHERE id = ${id} AND status = 'draft' RETURNING id`;
  return { committed: result?.length || 0 };
}

// Delete a DRAFT list (and its assignments). Committed lists are protected.
export async function deleteDraftList(id) {
  await ensureDutySchema();
  const db = sql();
  const [list] = await db`SELECT status FROM duty_lists WHERE id = ${id}`;
  if (!list) return { deleted: 0, reason: "not_found" };
  if (list.status !== "draft") return { deleted: 0, reason: "not_draft" };
  await db`DELETE FROM duty_assignments WHERE list_id = ${id}`;
  const result = await db`DELETE FROM duty_lists WHERE id = ${id} RETURNING id`;
  return { deleted: result?.length || 0 };
}

// Replace a list's payload (used when regenerating a draft).
export async function updateListPayload(id, payload) {
  await ensureDutySchema();
  const db = sql();
  const result = await db`
    UPDATE duty_lists SET payload = ${JSON.stringify(payload || {})}::jsonb WHERE id = ${id} RETURNING id
  `;
  return { updated: result?.length || 0 };
}

export async function recordDutyAudit(actor, action, listId, payload) {
  await ensureDutySchema();
  const db = sql();
  await db`
    INSERT INTO duty_audit (id, actor, action, list_id, payload)
    VALUES (${crypto.randomUUID()}, ${actor}, ${action}, ${listId}, ${JSON.stringify(payload || {})}::jsonb)
  `;
}

export async function getAuditTrail(listId) {
  await ensureDutySchema();
  const db = sql();
  return db`SELECT * FROM duty_audit WHERE list_id = ${listId} ORDER BY created_at DESC LIMIT 100`;
}

export async function recordDutyExportRun(viewName, listId, rowCount) {
  await ensureDutySchema();
  const db = sql();
  await db`
    INSERT INTO duty_export_runs (id, view_name, list_id, row_count)
    VALUES (${crypto.randomUUID()}, ${viewName}, ${listId}, ${rowCount})
  `;
}

// ---------- Assignments (Phase 4: engine input, save, review, override) ----------

function pad2db(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

// Normalize a Postgres `date` value (string or Date) to 'YYYY-MM-DD'.
function toYmd(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${pad2db(v.getUTCMonth() + 1)}-${pad2db(v.getUTCDate())}`;
  }
  return String(v).slice(0, 10);
}

// Engine input: every active satsang mapped to the shape the engine expects.
export async function getAllActiveSatsangs() {
  await ensureDutySchema();
  const db = sql();
  const rows = await db`SELECT * FROM duty_satsangs WHERE is_active = true ORDER BY name ASC`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sectorId: r.sector_id || null,
    dayOfWeek: r.day_of_week ?? 0,
    date: r.date || null,
    timeType: r.time_type || "M",
    timeSlot: r.time_slot || "",
    rating: r.rating ?? 2,
    isActive: r.is_active !== false,
    predefinedLocalPracharakId: r.predefined_local_pracharak_id || null,
  }));
}

// Engine input: every active pracharak mapped to the shape the engine expects.
export async function getAllActivePracharaks() {
  await ensureFullDutySchema();
  const db = sql();
  const rows = await db`SELECT * FROM duty_pracharaks WHERE is_active = true ORDER BY name ASC`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sectorId: r.sector_id || null,
    rating: r.rating ?? 2,
    monthlyTarget: r.monthly_target ?? 2,
    isActive: r.is_active !== false,
    awAd: r.aw_ad === true,
    specializations: r.specializations || [],
    city: r.city || null,
    isOutstation: r.is_outstation === true,
    homeCity: r.home_city || null,
  }));
}

// Engine input: active preference sets grouped by pracharak id.
export async function getActivePreferencesByPracharak() {
  await ensureDutySchema();
  const db = sql();
  const rows = await db`SELECT * FROM duty_preferences WHERE is_active = true`;
  const map = {};
  for (const r of rows) {
    const p = r.payload || {};
    if (!map[r.pracharak_id]) map[r.pracharak_id] = [];
    map[r.pracharak_id].push({
      sectorIds: Array.isArray(p.sectorIds) ? p.sectorIds : [],
      days: Array.isArray(p.days) ? p.days : [],
      weeks: Array.isArray(p.weeks) ? p.weeks : [],
      times: Array.isArray(p.times) ? p.times : [],
      preferredDays: Array.isArray(p.preferredDays) ? p.preferredDays : [],
      preferredWeeks: Array.isArray(p.preferredWeeks) ? p.preferredWeeks : [],
      preferredSectorIds: Array.isArray(p.preferredSectorIds) ? p.preferredSectorIds : [],
      allowedAreas: Array.isArray(p.allowedAreas) ? p.allowedAreas : [],
      isActive: r.is_active,
    });
  }
  return map;
}

// Engine input: recently COMMITTED assignments for cooldown/gap seeding.
// Returns a trailing window [firstDay(target - monthsBack), firstDay(target)).
export async function getRecentAssignmentHistory({ year, month, monthsBack = 3 }) {
  await ensureDutySchema();
  const db = sql();
  let startY = year;
  let startM = month - monthsBack;
  while (startM <= 0) { startM += 12; startY -= 1; }
  const windowStart = `${startY}-${pad2db(startM)}-01`;
  const windowEnd = `${year}-${pad2db(month)}-01`; // exclusive: only past months
  const rows = await db`
    SELECT da.pracharak_id, da.satsang_id, da.duty_date, ds.sector_id
    FROM duty_assignments da
    JOIN duty_lists dl ON dl.id = da.list_id
    LEFT JOIN duty_satsangs ds ON ds.id = da.satsang_id
    WHERE dl.status = 'committed'
      AND da.pracharak_id IS NOT NULL
      AND da.duty_date >= ${windowStart}::date
      AND da.duty_date < ${windowEnd}::date
    ORDER BY da.duty_date DESC
  `;
  return rows.map((r) => ({
    pracharakId: r.pracharak_id,
    satsangId: r.satsang_id,
    sectorId: r.sector_id || null,
    date: toYmd(r.duty_date),
  }));
}

// Persist engine output rows for a draft list. Batched into one round trip.
export async function saveAssignments(listId, rows) {
  await ensureDutySchema();
  const db = sql();
  if (!Array.isArray(rows) || rows.length === 0) return { inserted: 0 };
  const queries = rows.map((r) => {
    const payload = {
      satsangName: r.satsangName ?? null,
      pracharakName: r.pracharakName ?? null,
      sectorId: r.sectorId ?? null,
      satsangRating: r.satsangRating ?? null,
      dayOfWeek: r.dayOfWeek ?? null,
      weekOfMonth: r.weekOfMonth ?? null,
      timeType: r.timeType ?? null,
      timeSlot: r.timeSlot ?? null,
      score: r.score ?? null,
      explanation: r.explanation ?? null,
      candidatesConsidered: r.candidatesConsidered ?? null,
    };
    return db`
      INSERT INTO duty_assignments
        (id, list_id, satsang_id, pracharak_id, duty_date, is_local, local_kind, reason_code, overridden_by_user, payload)
      VALUES
        (${crypto.randomUUID()}, ${listId}, ${r.satsangId}, ${r.pracharakId || null}, ${r.date}::date,
         ${r.isLocal === true}, ${r.localKind || "none"}, ${r.reasonCode || null}, false, ${JSON.stringify(payload)}::jsonb)
    `;
  });
  await db.transaction(queries);
  return { inserted: rows.length };
}

// Assignments for a list, joined with live satsang / sector / pracharak detail.
export async function getAssignmentsForList(listId) {
  await ensureDutySchema();
  const db = sql();
  return db`
    SELECT da.*,
           ds.name AS satsang_name, ds.address AS satsang_address, ds.sector_id AS satsang_sector_id,
           ds.time_slot AS satsang_time_slot, ds.time_type AS satsang_time_type,
           ds.day_of_week AS satsang_day_of_week, ds.rating AS satsang_rating,
           sec.name AS sector_name,
           p.name AS pracharak_name, p.contact AS pracharak_contact, p.rating AS pracharak_rating, p.sector_id AS pracharak_sector_id
    FROM duty_assignments da
    LEFT JOIN duty_satsangs ds ON ds.id = da.satsang_id
    LEFT JOIN duty_sectors sec ON sec.id = ds.sector_id
    LEFT JOIN duty_pracharaks p ON p.id = da.pracharak_id
    WHERE da.list_id = ${listId}
    ORDER BY da.duty_date ASC, ds.name ASC
  `;
}

// A list plus its joined assignments (null if the list doesn't exist).
export async function getListWithAssignments(listId) {
  const list = await getList(listId);
  if (!list) return null;
  const assignments = await getAssignmentsForList(listId);

  // Enrich each assignment with the pracharak's last called date (from committed lists).
  const pracharakIds = [...new Set(assignments.filter((a) => a.pracharak_id).map((a) => a.pracharak_id))];
  const lastCalledMap = await getLastAssignedDates(pracharakIds);

  const enriched = assignments.map((a) => ({
    ...a,
    last_called_date: a.pracharak_id ? (lastCalledMap.get(a.pracharak_id) || null) : null,
  }));

  return { list, assignments: enriched };
}

// Returns a Map<pracharakId, lastDateStr> for the given pracharak IDs.
// Queries committed lists only, scoped to the last 6 months.
export async function getLastAssignedDates(pracharakIds) {
  if (!pracharakIds || pracharakIds.length === 0) return new Map();
  await ensureDutySchema();
  const db = sql();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoff = sixMonthsAgo.toISOString().slice(0, 10);

  const rows = await db`
    SELECT DISTINCT ON (da.pracharak_id)
      da.pracharak_id, da.duty_date
    FROM duty_assignments da
    JOIN duty_lists dl ON dl.id = da.list_id
    WHERE da.pracharak_id = ANY(${pracharakIds})
      AND dl.status = 'committed'
      AND da.duty_date < CURRENT_DATE
    ORDER BY da.pracharak_id, da.duty_date DESC
  `;
  const map = new Map();
  for (const r of rows) {
    if (r.pracharak_id && r.duty_date) {
      map.set(r.pracharak_id, typeof r.duty_date === "string" ? r.duty_date.slice(0, 10) : new Date(r.duty_date).toISOString().slice(0, 10));
    }
  }
  return map;
}

// Wipe a draft list's assignments (used before regenerating).
export async function deleteAssignmentsForList(listId) {
  await ensureDutySchema();
  const db = sql();
  const result = await db`DELETE FROM duty_assignments WHERE list_id = ${listId} RETURNING id`;
  return { deleted: result?.length || 0 };
}

// Manually reassign (or clear) a single slot; flags it as user-overridden.
export async function reassignAssignment(id, pracharakId) {
  await ensureDutySchema();
  const db = sql();
  const result = await db`
    UPDATE duty_assignments
    SET pracharak_id = ${pracharakId || null},
        overridden_by_user = true,
        reason_code = ${pracharakId ? "manual_override" : "manual_clear"}
    WHERE id = ${id}
    RETURNING id
  `;
  return { updated: result?.length || 0 };
}

// One assignment plus the status of its parent list (for edit guards).
export async function getAssignmentWithListStatus(id) {
  await ensureDutySchema();
  const db = sql();
  const [row] = await db`
    SELECT da.id, da.list_id, dl.status AS list_status
    FROM duty_assignments da
    JOIN duty_lists dl ON dl.id = da.list_id
    WHERE da.id = ${id}
  `;
  return row || null;
}

// ---------- Synthetic seed ----------
function loadZone12Sectors() {
  try {
    const filePath = path.join(process.cwd(), "public", "zones-data.js");
    const content = fs.readFileSync(filePath, "utf-8");
    const json = content.replace(/^\s*window\.ZONE_DATA\s*=/, "").replace(/;\s*$/, "").trim();
    const data = JSON.parse(json);
    const zone12 = (data.specialZones || []).find((z) => String(z.zoneNo) === "12");
    return zone12?.sectors || [];
  } catch {
    return [];
  }
}

const FIRST_NAMES = ["Ramesh", "Suresh", "Mahesh", "Dinesh", "Suresh Kumar", "Rakesh", "Naresh", "Mukesh", "Jagdish", "Harish",
  "Satish", "Amar", "Kishan", "Mohan", "Sohan", "Gopal", "Madan", "Lalit", "Anil", "Sunil",
  "Ashok", "Prakash", "Vijay", "Sanjay", "Rajesh", "Om Parkash", "Bhagwan", "Krishan", "Balraj", "Yudhvir"];
const LAST_NAMES = ["Ji Delhi", "Ji Saharanpur", "Ji UP", "Ji Haryana", "Ji Bihar", "Ji Rajasthan"];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedSyntheticData(seed = 42) {
  await ensureDutySchema();
  const db = sql();

  const [{ count }] = await db`SELECT COUNT(*)::int AS count FROM duty_sectors`;
  if (count > 0) return { seeded: false, reason: "Data already present" };

  const rand = mulberry32(seed);

  // Sectors from zone 12 (Delhi NCR) of zones-data.js
  const sectors = [];
  for (const sec of loadZone12Sectors()) {
    const id = crypto.randomUUID();
    const cleanName = String(sec.sectorName || "").replace(/\s+/g, " ").trim();
    await db`
      INSERT INTO duty_sectors (id, name, incharge_name, payload)
      VALUES (${id}, ${cleanName}, ${sec.sectorInchargeName || null}, ${JSON.stringify({ sectorNo: sec.sectorNo })}::jsonb)
    `;
    sectors.push({ id, name: cleanName });
  }

  // Pracharaks
  const pracharakIds = [];
  for (let i = 0; i < 100; i += 1) {
    const id = crypto.randomUUID();
    const name = `${FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)]}`;
    const contact = `9${Math.floor(100000000 + rand() * 899999999)}`;
    const sector = sectors[Math.floor(rand() * sectors.length)];
    const rating = rand() < 0.25 ? 1 : rand() < 0.55 ? 2 : 3;
    const monthlyTarget = 1 + Math.floor(rand() * 3);
    await db`
      INSERT INTO duty_pracharaks (id, name, contact, sector_id, rating, monthly_target, aw_ad)
      VALUES (${id}, ${name}, ${contact}, ${sector.id}, ${rating}, ${monthlyTarget}, ${rand() < 0.15})
    `;
    pracharakIds.push(id);
  }

  // Satsangs: 2-4 per sector
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const satsangIds = [];
  for (const sector of sectors) {
    const num = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < num; i += 1) {
      const id = crypto.randomUUID();
      const name = `${sector.name} Satsang ${i + 1}`;
      const dayOfWeek = Math.floor(rand() * 7);
      const timeType = rand() < 0.6 ? "M" : "E";
      const timeSlot = timeType === "M" ? (rand() < 0.5 ? "09:00" : "10:30") : rand() < 0.5 ? "16:00" : "18:00";
      const rating = rand() < 0.3 ? 1 : rand() < 0.65 ? 2 : 3;
      const address = `${sector.name}, Ward ${1 + Math.floor(rand() * 20)}, Delhi`;
      await db`
        INSERT INTO duty_satsangs (id, name, address, contact, sector_id, day_of_week, time_type, time_slot, rating, payload)
        VALUES (${id}, ${name}, ${address}, ${`9${Math.floor(100000000 + rand() * 899999999)}`}, ${sector.id}, ${dayOfWeek}, ${timeType}, ${timeSlot}, ${rating}, ${JSON.stringify({ dayName: DAYS[dayOfWeek] })}::jsonb)
      `;
      satsangIds.push({ id, sectorId: sector.id });
    }
  }

  // Predefined locals: every 5th satsang gets a local pracharak from its own sector
  for (let i = 0; i < satsangIds.length; i += 5) {
    const s = satsangIds[i];
    const locals = pracharakIds.slice(); // pick any; engine checks sector match at runtime
    if (locals.length) {
      const pick = locals[Math.floor(rand() * locals.length)];
      await db`UPDATE duty_satsangs SET predefined_local_pracharak_id = ${pick} WHERE id = ${s.id}`;
    }
  }

  await getRuleConfig(); // ensures default config row exists
  await recordDutyAudit("system", "seed", null, { sectors: sectors.length, pracharaks: pracharakIds.length, satsangs: satsangIds.length });

  return { seeded: true, sectors: sectors.length, pracharaks: pracharakIds.length, satsangs: satsangIds.length };
}
