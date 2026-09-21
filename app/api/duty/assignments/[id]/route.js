import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth";
import { getAssignmentWithListStatus, reassignAssignment, recordDutyAudit } from "../../../../../lib/duty-db";

// PATCH /api/duty/assignments/[id] — manually (re)assign or clear one slot.
// Body: { pracharakId: string | null }. Only allowed while the list is a draft.
export async function PATCH(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const info = await getAssignmentWithListStatus(id);
    if (!info) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    if (info.list_status !== "draft") {
      return NextResponse.json({ error: "Committed lists cannot be edited" }, { status: 400 });
    }
    const body = await request.json();
    const pracharakId = body.pracharakId ? String(body.pracharakId) : null;
    const result = await reassignAssignment(id, pracharakId);
    if (result.updated === 0) {
      return NextResponse.json({ error: "Update failed" }, { status: 400 });
    }
    await recordDutyAudit("admin", "reassign_slot", info.list_id, { assignmentId: id, pracharakId });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty assignment reassign error:", err);
    return NextResponse.json({ error: "Reassign failed: " + err.message }, { status: 500 });
  }
}
