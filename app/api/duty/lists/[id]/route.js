import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth";
import {
  getListWithAssignments,
  deleteDraftList,
  recordDutyAudit,
} from "../../../../../lib/duty-db";

// GET /api/duty/lists/[id] — a list plus its joined assignments.
export async function GET(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const data = await getListWithAssignments(id);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("Duty list fetch error:", err);
    return NextResponse.json({ error: "Failed to load list" }, { status: 500 });
  }
}

// DELETE /api/duty/lists/[id] — discard a DRAFT list (committed lists protected).
export async function DELETE(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const result = await deleteDraftList(id);
    if (result.deleted === 0) {
      const msg = result.reason === "not_draft"
        ? "Only draft lists can be deleted"
        : "List not found";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    await recordDutyAudit("admin", "delete_draft_list", id, {});
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty list delete error:", err);
    return NextResponse.json({ error: "Delete failed: " + err.message }, { status: 500 });
  }
}
