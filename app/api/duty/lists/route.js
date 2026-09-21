import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import {
  listDutyLists,
  createDraftList,
  saveAssignments,
  recordDutyAudit,
  getAllActiveSatsangs,
  getAllActivePracharaks,
  getAllActiveBranches,
  getActivePreferencesByPracharak,
  getRecentAssignmentHistory,
  getRuleConfig,
} from "../../../../lib/duty-db";
import { generateDutyList } from "../../../../lib/duty-engine";

function clampMonth(m) {
  const n = Number(m);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? Math.round(n) : null;
}

function clampYear(y) {
  const n = Number(y);
  return Number.isFinite(n) && n >= 2000 && n <= 2100 ? Math.round(n) : null;
}

// GET /api/duty/lists — history of generated lists (newest first).
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const lists = await listDutyLists({ limit: 100 });
    return NextResponse.json({ lists });
  } catch (err) {
    console.error("Duty lists fetch error:", err);
    return NextResponse.json({ error: "Failed to load duty lists" }, { status: 500 });
  }
}

// POST /api/duty/lists — generate a new DRAFT list for {month, year}.
export async function POST(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const month = clampMonth(body.month);
    const year = clampYear(body.year);
    if (!month || !year) {
      return NextResponse.json({ error: "Valid month (1-12) and year are required" }, { status: 400 });
    }
    const comparisonMonth = clampMonth(body.comparisonMonth);
    const comparisonYear = clampYear(body.comparisonYear);
    const seed = Number.isFinite(Number(body.seed)) ? Number(body.seed) : Math.floor(Math.random() * 2 ** 31);

    const [satsangs, pracharaks, preferencesByPracharak, config, branches] = await Promise.all([
      getAllActiveSatsangs(),
      getAllActivePracharaks(),
      getActivePreferencesByPracharak(),
      getRuleConfig(),
      getAllActiveBranches(),
    ]);

    if (satsangs.length === 0) {
      return NextResponse.json({ error: "No active satsangs to schedule" }, { status: 400 });
    }
    if (pracharaks.length === 0) {
      return NextResponse.json({ error: "No active pracharaks available" }, { status: 400 });
    }

    const monthsBack = Number(config.branchCooldownMonths) || 3;
    const history = await getRecentAssignmentHistory({ year, month, monthsBack });

    const result = generateDutyList({
      year, month, satsangs, pracharaks, branches, preferencesByPracharak, history, config, seed,
    });

    const { id, version } = await createDraftList({
      month, year, comparisonMonth, comparisonYear, createdBy: "admin",
      payload: { seed, stats: result.stats, config, generatedAt: new Date().toISOString() },
    });
    await saveAssignments(id, result.assignments);
    await recordDutyAudit("admin", "generate_list", id, { month, year, seed, stats: result.stats });

    return NextResponse.json({ id, version, stats: result.stats, unfilled: result.unfilled });
  } catch (err) {
    console.error("Duty list generate error:", err);
    return NextResponse.json({ error: "Generation failed: " + err.message }, { status: 500 });
  }
}
