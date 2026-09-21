import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import {
  ensureFullDutySchema,
  getAllActivePracharaks,
  getAllActiveSatsangs,
  getAllActiveBranches,
  getActivePreferencesByPracharak,
} from "../../../../lib/duty-db";
import { neon } from "@neondatabase/serverless";

function sql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return neon(connectionString);
}

// GET /api/duty/validate — run data-quality checks across pracharaks, branches, and preferences.
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ensureFullDutySchema();
    const db = sql();
    const issues = [];

    // 1) Pracharaks with no preferences
    const pracharaks = await getAllActivePracharaks();
    const prefsByPrach = await getActivePreferencesByPracharak();
    for (const p of pracharaks) {
      if (!prefsByPrach[p.id] || prefsByPrach[p.id].length === 0) {
        issues.push({ type: "warning", category: "pracharak", message: `${p.name} has no active preference set`, id: p.id });
      }
    }

    // 2) Pracharaks with no specialization
    for (const p of pracharaks) {
      if (!p.specializations || p.specializations.length === 0) {
        issues.push({ type: "info", category: "pracharak", message: `${p.name} has no specialization listed`, id: p.id });
      }
    }

    // 3) Branches with no sector mapping
    const branches = await getAllActiveBranches();
    for (const b of branches) {
      if (!b.sectorId) {
        issues.push({ type: "warning", category: "branch", message: `${b.name} (${b.branchCode || "no code"}) has no linked sector`, id: b.id });
      }
    }

    // 4) Satsangs (old system) not covered by any branch
    const satsangs = await getAllActiveSatsangs();
    const branchSectorIds = new Set(branches.map((b) => b.sectorId).filter(Boolean));
    for (const s of satsangs) {
      if (s.isActive === false) continue;
      if (s.sector_id && !branchSectorIds.has(s.sector_id)) {
        issues.push({ type: "info", category: "coverage", message: `${s.name} has no branch record (may be legacy)` });
      } else if (!s.sector_id) {
        issues.push({ type: "warning", category: "coverage", message: `${s.name} has no sector assigned` });
      }
    }

    // 5) Duplicate contacts
    const dupes = await db`
      SELECT name, contact, COUNT(*) AS cnt
      FROM duty_pracharaks
      WHERE contact IS NOT NULL AND contact != ''
      GROUP BY name, contact
      HAVING COUNT(*) > 1
    `;
    for (const d of dupes) {
      issues.push({ type: "error", category: "duplicate", message: `Duplicate contact: ${d.name} (${d.contact}) appears ${d.cnt} times` });
    }

    return NextResponse.json({
      ok: true,
      summary: {
        total: issues.length,
        errors: issues.filter((i) => i.type === "error").length,
        warnings: issues.filter((i) => i.type === "warning").length,
        info: issues.filter((i) => i.type === "info").length,
      },
      issues,
    });
  } catch (err) {
    console.error("Validation error:", err);
    return NextResponse.json({ error: "Validation failed: " + err.message }, { status: 500 });
  }
}
