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
    INSERT INTO duty_satsangs (id, name, address, contact, sector_id, day_of_week, time_type, time_slot, rating, predefined_local_pracharak_id, payload)
    VALUES (${id}, ${record.name}, ${record.address || null}, ${record.contact || null}, ${record.sectorId || null},
            ${record.dayOfWeek ?? 0}, ${record.timeType || "M"}, ${record.timeSlot || "10:00"}, ${record.rating ?? 2},
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
  await db`
    INSERT INTO duty_pracharaks (id, name, contact, sector_id, rating, monthly_target, aw_ad, payload)
    VALUES (${id}, ${record.name}, ${record.contact || null}, ${record.sectorId || null},
            ${record.rating ?? 2}, ${record.monthlyTarget ?? 2}, ${record.awAd ?? false},
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
