import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth";
import { updatePreferenceSet, deletePreferenceSet } from "../../../../../lib/duty-db";

function normalizePayload(p) {
  const src = p || {};
  const toArr = (x) => (Array.isArray(x) ? x : []);
  return {
    sectorIds: toArr(src.sectorIds).map(String),
    days: toArr(src.days).map((d) => Number(d)).filter((d) => Number.isFinite(d) && d >= 0 && d <= 6),
    weeks: toArr(src.weeks).map((w) => Number(w)).filter((w) => Number.isFinite(w) && w >= 1 && w <= 5),
    times: toArr(src.times).filter((t) => t === "M" || t === "E"),
    preferredDays: toArr(src.preferredDays).map((d) => Number(d)).filter((d) => Number.isFinite(d) && d >= 0 && d <= 6),
    preferredWeeks: toArr(src.preferredWeeks).map((w) => Number(w)).filter((w) => Number.isFinite(w) && w >= 1 && w <= 5),
    preferredSectorIds: toArr(src.preferredSectorIds).map(String),
    allowedAreas: toArr(src.allowedAreas).map(String),
    note: src.note ? String(src.note).trim() : "",
  };
}

export async function PATCH(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const patch = {};
    if (body.setName !== undefined) patch.setName = String(body.setName).trim() || "Default";
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
    if (body.payload !== undefined) patch.payload = normalizePayload(body.payload);
    await updatePreferenceSet(id, patch);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty preference update error:", err);
    return NextResponse.json({ error: "Update failed: " + err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await deletePreferenceSet(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty preference delete error:", err);
    return NextResponse.json({ error: "Delete failed: " + err.message }, { status: 500 });
  }
}
