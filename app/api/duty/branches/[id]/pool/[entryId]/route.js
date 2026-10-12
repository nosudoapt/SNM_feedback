import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../../../lib/auth";
import { updateBranchPoolEntry, removeFromBranchPool } from "../../../../../../../lib/duty-db";

export async function PATCH(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { entryId } = await params;
    const body = await request.json();
    const patch = {};
    if (body.priority !== undefined) patch.priority = typeof body.priority === "number" ? body.priority : 0;
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
    await updateBranchPoolEntry(entryId, patch);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Branch pool update error:", err);
    return NextResponse.json({ error: "Update failed: " + err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { entryId } = await params;
    await removeFromBranchPool(entryId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Branch pool remove error:", err);
    return NextResponse.json({ error: "Remove failed: " + err.message }, { status: 500 });
  }
}
