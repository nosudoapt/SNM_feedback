import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth";
import { getSectors, createPracharak } from "../../../../../lib/duty-db";

// Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded commas,
// escaped double-quotes ("") and CRLF/CR/LF line endings.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const s = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ""));
}

const HEADER_ALIASES = {
  name: ["name", "pracharak", "pracharak name", "full name"],
  contact: ["contact", "phone", "mobile", "number", "contact no", "contact number"],
  sector: ["sector", "sector name", "area", "sector no", "sectorno"],
  rating: ["rating", "tier", "grade"],
  target: ["target", "monthly target", "monthlytarget", "sewa", "sewa count", "monthly sewa"],
  awad: ["aw_ad", "awad", "aw-ad", "aw ad", "aw"],
  specializations: ["specializations", "specialization", "specs", "expertise", "skills"],
  city: ["city", "town", "location"],
  isoutstation: ["is_outstation", "isoutstation", "outstation", "outsider"],
  homecity: ["home_city", "homecity", "home city", "hometown"],
};

function resolveHeader(headerCell) {
  const h = String(headerCell).trim().toLowerCase();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(h)) return key;
  }
  return null;
}

function truthy(v) {
  const s = String(v).trim().toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeName(x) {
  return String(x || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export async function POST(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const csv = body?.csv;
    if (!csv || !String(csv).trim()) {
      return NextResponse.json({ error: "No CSV content provided" }, { status: 400 });
    }
    const rows = parseCsv(csv);
    if (rows.length < 2) {
      return NextResponse.json({ error: "CSV needs a header row and at least one data row" }, { status: 400 });
    }
    const header = rows[0].map(resolveHeader);
    if (!header.includes("name")) {
      return NextResponse.json({ error: "CSV must include a 'name' column" }, { status: 400 });
    }

    const sectors = await getSectors();
    const byName = new Map();
    const byNo = new Map();
    for (const sec of sectors) {
      byName.set(normalizeName(sec.name), sec.id);
      const no = sec.payload?.sectorNo;
      if (no !== undefined && no !== null) byNo.set(String(no).trim().toLowerCase(), sec.id);
    }

    const errors = [];
    let created = 0;
    let skipped = 0;

    for (let r = 1; r < rows.length; r += 1) {
      const cells = rows[r];
      const rec = {};
      header.forEach((key, idx) => { if (key) rec[key] = cells[idx]; });
      const name = String(rec.name || "").trim();
      if (!name) { skipped += 1; errors.push({ line: r + 1, message: "Missing name" }); continue; }

      let sectorId = null;
      const sectorRaw = String(rec.sector || "").trim();
      if (sectorRaw) {
        sectorId = byName.get(normalizeName(sectorRaw)) || byNo.get(sectorRaw.toLowerCase()) || null;
        if (!sectorId) errors.push({ line: r + 1, message: `Sector "${sectorRaw}" not found — imported without a sector` });
      }

      try {
        await createPracharak({
          name,
          contact: rec.contact ? String(rec.contact).trim() : null,
          sectorId,
          rating: clampInt(rec.rating, 1, 3, 2),
          monthlyTarget: clampInt(rec.target, 0, 31, 2),
          awAd: truthy(rec.awad),
          specializations: rec.specializations ? String(rec.specializations).split(/[;,]/).map((s) => s.trim().toLowerCase()).filter(Boolean) : [],
          city: rec.city ? String(rec.city).trim() : null,
          isOutstation: truthy(rec.isoutstation),
          homeCity: rec.homecity ? String(rec.homecity).trim() : null,
          payload: {},
        });
        created += 1;
      } catch (e) {
        skipped += 1;
        errors.push({ line: r + 1, message: e.message });
      }
    }

    return NextResponse.json({
      success: true,
      created,
      skipped,
      total: rows.length - 1,
      errors: errors.slice(0, 50),
    });
  } catch (err) {
    console.error("Duty pracharak import error:", err);
    return NextResponse.json({ error: "Import failed: " + err.message }, { status: 500 });
  }
}
