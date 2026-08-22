import crypto from "crypto";
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

export async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = sql();
      await db`
        CREATE TABLE IF NOT EXISTS submissions (
          id text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          name text NOT NULL,
          phone text NOT NULL,
          zone_no text NOT NULL,
          zone_name text NOT NULL,
          zone_type text NOT NULL,
          sector_no text,
          sector_name text,
          zonal_incharge_name text,
          sector_incharge_name text,
          category text NOT NULL,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      `;
      await db`
        CREATE TABLE IF NOT EXISTS export_runs (
          id text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          filter_name text NOT NULL,
          row_count integer NOT NULL
        )
      `;
      await db`
        ALTER TABLE submissions ADD COLUMN IF NOT EXISTS attended_at timestamptz
      `;
    })();
  }

  return schemaPromise;
}

export async function createSubmission(record) {
  await ensureSchema();
  const db = sql();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db`
    INSERT INTO submissions (
      id,
      created_at,
      name,
      phone,
      zone_no,
      zone_name,
      zone_type,
      sector_no,
      sector_name,
      zonal_incharge_name,
      sector_incharge_name,
      category,
      payload
    ) VALUES (
      ${id},
      ${createdAt},
      ${record.name},
      ${record.phone},
      ${record.zoneNo},
      ${record.zoneName},
      ${record.zoneType},
      ${record.sectorNo || null},
      ${record.sectorName || null},
      ${record.zonalInchargeName || null},
      ${record.sectorInchargeName || null},
      ${record.category},
      ${JSON.stringify(record.payload || {})}::jsonb
    )
  `;

  return { id, createdAt };
}

export async function getStats() {
  await ensureSchema();
  const db = sql();
  const [totalRow] = await db`SELECT COUNT(*)::int AS count FROM submissions`;
  const [last12Row] = await db`SELECT COUNT(*)::int AS count FROM submissions WHERE created_at >= now() - interval '12 hours'`;
  const [last24Row] = await db`SELECT COUNT(*)::int AS count FROM submissions WHERE created_at >= now() - interval '24 hours'`;
  const [todayRow] = await db`SELECT COUNT(*)::int AS count FROM submissions WHERE created_at >= date_trunc('day', now())`;
  const [lastExportRow] = await db`
    SELECT created_at
    FROM export_runs
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const sinceLastExportAt = lastExportRow?.created_at || null;
  const sinceLastExportRow = sinceLastExportAt
    ? await db`SELECT COUNT(*)::int AS count FROM submissions WHERE created_at >= ${sinceLastExportAt}`
    : totalRow;

  return {
    total: totalRow?.count || 0,
    last12h: last12Row?.count || 0,
    last24h: last24Row?.count || 0,
    today: todayRow?.count || 0,
    sinceLastExport: sinceLastExportRow?.count || 0,
    lastExportAt: sinceLastExportAt,
  };
}

export async function getRecentSubmissions(limit = 25) {
  await ensureSchema();
  const db = sql();
  return db`
    SELECT *
    FROM submissions
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function getSubmissions(range = "all", categories = null) {
  await ensureSchema();
  const db = sql();
  const lastExport = await db`
    SELECT created_at
    FROM export_runs
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const sinceLastExportAt = lastExport?.[0]?.created_at || null;

  const hasCategoryFilter = Array.isArray(categories) && categories.length > 0;
  const extra = hasCategoryFilter ? db` AND category = ANY(${categories})` : db``;

  if (range === "since_last_export" && sinceLastExportAt) {
    return db`
      SELECT *
      FROM submissions
      WHERE created_at >= ${sinceLastExportAt}${extra}
      ORDER BY created_at DESC
    `;
  }

  if (range === "12h") {
    return db`
      SELECT *
      FROM submissions
      WHERE created_at >= now() - interval '12 hours'${extra}
      ORDER BY created_at DESC
    `;
  }

  if (range === "24h") {
    return db`
      SELECT *
      FROM submissions
      WHERE created_at >= now() - interval '24 hours'${extra}
      ORDER BY created_at DESC
    `;
  }

  if (range === "today") {
    return db`
      SELECT *
      FROM submissions
      WHERE created_at >= date_trunc('day', now())${extra}
      ORDER BY created_at DESC
    `;
  }

  return db`
    SELECT *
    FROM submissions
    ${hasCategoryFilter ? db`WHERE category = ANY(${categories})` : db``}
    ORDER BY created_at DESC
  `;
}

const SORT_COLUMNS = {
  created_at: "created_at",
  name: "name",
  phone: "phone",
  zone_no: "zone_no",
};

export async function getSubmissionsPage({
  q = "",
  category = "",
  zoneType = "",
  sort = "created_at",
  order = "desc",
  page = 1,
  limit = 20,
} = {}) {
  await ensureSchema();
  const db = sql();
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;
  const sortCol = SORT_COLUMNS[sort] || "created_at";
  const dir = order === "asc" ? "ASC" : "DESC";

  const conds = [];
  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    conds.push(db`(name ILIKE ${term} OR phone ILIKE ${term} OR zone_no ILIKE ${term} OR zone_name ILIKE ${term})`);
  }
  if (category && category !== "all") conds.push(db`category = ${category}`);
  if (zoneType && zoneType !== "all") conds.push(db`zone_type = ${zoneType}`);

  let where = db``;
  if (conds.length) {
    where = db`WHERE ${conds[0]}`;
    for (let i = 1; i < conds.length; i += 1) {
      where = db`${where} AND ${conds[i]}`;
    }
  }

  const [countRow] = await db`SELECT COUNT(*)::int AS count FROM submissions ${where}`;
  const rows = await db`
    SELECT *
    FROM submissions ${where}
    ORDER BY ${db.unsafe(`${sortCol} ${dir}`)}
    LIMIT ${safeLimit} OFFSET ${offset}
  `;

  return { rows, total: countRow?.count || 0 };
}

export async function getChartData() {
  await ensureSchema();
  const db = sql();

  const daily = await db`
    SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
    FROM submissions
    WHERE created_at >= now() - interval '13 days'
    GROUP BY day
    ORDER BY day
  `;
  const byCategory = await db`
    SELECT category, COUNT(*)::int AS count
    FROM submissions
    GROUP BY category
    ORDER BY count DESC
  `;
  const byZoneType = await db`
    SELECT zone_type, COUNT(*)::int AS count
    FROM submissions
    GROUP BY zone_type
    ORDER BY count DESC
  `;
  const topZones = await db`
    SELECT zone_no, zone_name, COUNT(*)::int AS count
    FROM submissions
    GROUP BY zone_no, zone_name
    ORDER BY count DESC
    LIMIT 8
  `;

  return { daily, byCategory, byZoneType, topZones };
}

export async function recordExportRun(filterName, rowCount) {
  await ensureSchema();
  const db = sql();
  return db`
    INSERT INTO export_runs (id, filter_name, row_count)
    VALUES (${crypto.randomUUID()}, ${filterName}, ${rowCount})
    RETURNING created_at
  `;
}

export async function latestExportAt() {
  await ensureSchema();
  const db = sql();
  const [row] = await db`
    SELECT created_at
    FROM export_runs
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return row?.created_at || null;
}

export async function markAttended(marks) {
  await ensureSchema();
  const db = sql();
  let updated = 0;
  for (const mark of marks) {
    const id = String(mark.id || "").trim();
    if (!id) continue;
    const at = mark.at ? new Date(mark.at) : new Date();
    if (Number.isNaN(at.getTime())) continue;
    const result = await db`
      UPDATE submissions
      SET attended_at = ${at.toISOString()}
      WHERE id = ${id}
      RETURNING id
    `;
    updated += result?.length || 0;
  }
  return { updated };
}
