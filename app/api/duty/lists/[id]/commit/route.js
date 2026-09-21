import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../../lib/auth";
import { getList, commitList, recordDutyAudit } from "../../../../../../lib/duty-db";

// POST /api/duty/lists/[id]/commit — finalize a draft list.
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
    if (list.status === "committed") {
      return NextResponse.json({ error: "List is already committed" }, { status: 400 });
    }
    const result = await commitList(id);
    if (result.committed === 0) {
      return NextResponse.json({ error: "Could not commit (not in draft state)" }, { status: 400 });
    }
    await recordDutyAudit("admin", "commit_list", id, { month: list.month, year: list.year });
    return NextResponse.json({ success: true, status: "committed" });
  } catch (err) {
    console.error("Duty list commit error:", err);
    return NextResponse.json({ error: "Commit failed: " + err.message }, { status: 500 });
  }
}
