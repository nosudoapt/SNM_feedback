import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth";
import { getPracharakWithHistory, updatePracharak, deletePracharak } from "../../../../../lib/duty-db";

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function GET(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const data = await getPracharakWithHistory(id);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("Duty pracharak fetch error:", err);
    return NextResponse.json({ error: "Failed to load pracharak" }, { status: 500 });
  }
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
    if (body.contact !== undefined) patch.contact = body.contact ? String(body.contact).trim() : null;
    if (body.sectorId !== undefined) patch.sectorId = body.sectorId || null;
    if (body.rating !== undefined) patch.rating = clampInt(body.rating, 1, 3, 2);
    if (body.monthlyTarget !== undefined) patch.monthlyTarget = clampInt(body.monthlyTarget, 0, 31, 2);
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
    if (body.awAd !== undefined) patch.awAd = Boolean(body.awAd);
    if (body.specializations !== undefined) patch.specializations = Array.isArray(body.specializations) ? body.specializations : [];
    if (body.city !== undefined) patch.city = body.city ? String(body.city).trim() : null;
    if (body.isOutstation !== undefined) patch.isOutstation = Boolean(body.isOutstation);
    if (body.homeCity !== undefined) patch.homeCity = body.homeCity ? String(body.homeCity).trim() : null;
    if (body.name !== undefined && !patch.name) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    await updatePracharak(id, patch);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty pracharak update error:", err);
    return NextResponse.json({ error: "Update failed: " + err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await deletePracharak(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty pracharak delete error:", err);
    return NextResponse.json({ error: "Delete failed: " + err.message }, { status: 500 });
  }
}
