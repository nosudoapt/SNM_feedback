import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../../lib/auth";
import {
  getList,
  deleteAssignmentsForList,
  saveAssignments,
  updateListPayload,
  recordDutyAudit,
  getAllActiveSatsangs,
  getAllActivePracharaks,
  getAllActiveBranches,
  getActivePreferencesByPracharak,
  getRecentAssignmentHistory,
  getRuleConfig,
} from "../../../../../../lib/duty-db";
import { generateDutyList } from "../../../../../../lib/duty-engine";

// POST /api/duty/lists/[id]/regenerate — re-run the engine on a DRAFT list.
// Optional body { seed } to reshuffle tie-breaks; otherwise a fresh random seed.
export async function POST(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const list = await getList(id);
    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }
    if (list.status !== "draft") {
      return NextResponse.json({ error: "Only draft lists can be regenerated" }, { status: 400 });
    }

    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const seed = Number.isFinite(Number(body.seed)) ? Number(body.seed) : Math.floor(Math.random() * 2 ** 31);

    const [satsangs, pracharaks, preferencesByPracharak, config, branches] = await Promise.all([
      getAllActiveSatsangs(),
      getAllActivePracharaks(),
      getActivePreferencesByPracharak(),
      getRuleConfig(),
      getAllActiveBranches(),
    ]);

    const monthsBack = Number(config.branchCooldownMonths) || 3;
    const history = await getRecentAssignmentHistory({ year: list.year, month: list.month, monthsBack });

    const result = generateDutyList({
      year: list.year, month: list.month, satsangs, pracharaks, branches, preferencesByPracharak, history, config, seed,
    });

    await deleteAssignmentsForList(id);
    await saveAssignments(id, result.assignments);
    await updateListPayload(id, {
      ...(list.payload || {}), seed, stats: result.stats, config, regeneratedAt: new Date().toISOString(),
    });
    await recordDutyAudit("admin", "regenerate_list", id, { seed, stats: result.stats });

    return NextResponse.json({ id, stats: result.stats, unfilled: result.unfilled });
  } catch (err) {
    console.error("Duty list regenerate error:", err);
    return NextResponse.json({ error: "Regeneration failed: " + err.message }, { status: 500 });
  }
}
