import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth";
import { updateSatsang, deleteSatsang } from "../../../../../lib/duty-db";

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function PATCH(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const patch = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.address !== undefined) patch.address = body.address ? String(body.address).trim() : null;
    if (body.contact !== undefined) patch.contact = body.contact ? String(body.contact).trim() : null;
    if (body.sectorId !== undefined) patch.sectorId = body.sectorId || null;
    if (body.dayOfWeek !== undefined) patch.dayOfWeek = clampInt(body.dayOfWeek, 0, 6, 0);
    if (body.date !== undefined) patch.date = body.date || null;
    if (body.timeType !== undefined) patch.timeType = body.timeType === "E" ? "E" : "M";
    if (body.timeSlot !== undefined) patch.timeSlot = body.timeSlot ? String(body.timeSlot).trim() : "10:00";
    if (body.rating !== undefined) patch.rating = clampInt(body.rating, 1, 3, 2);
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
    if (body.predefinedLocalId !== undefined) patch.predefinedLocalId = body.predefinedLocalId || null;
    if (body.name !== undefined && !patch.name) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    await updateSatsang(id, patch);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty satsang update error:", err);
    return NextResponse.json({ error: "Update failed: " + err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await deleteSatsang(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty satsang delete error:", err);
    return NextResponse.json({ error: "Delete failed: " + err.message }, { status: 500 });
  }
}
