import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth";
import { updateBranch, deleteBranch, getAllActiveBranches } from "../../../../../lib/duty-db";

const LOCATION_TYPES = ["urban", "semi_urban", "rural", "village"];

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
    const branches = await getAllActiveBranches();
    const branch = branches.find((b) => b.id === id);
    if (!branch) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(branch);
  } catch (err) {
    console.error("Duty branch fetch error:", err);
    return NextResponse.json({ error: "Failed to load branch" }, { status: 500 });
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
    if (body.branchCode !== undefined) patch.branchCode = body.branchCode ? String(body.branchCode).trim() : null;
    if (body.sectorId !== undefined) patch.sectorId = body.sectorId || null;
    if (body.city !== undefined) patch.city = body.city ? String(body.city).trim() : null;
    if (body.area !== undefined) patch.area = body.area ? String(body.area).trim() : null;
    if (body.address !== undefined) patch.address = body.address ? String(body.address).trim() : null;
    if (body.contactPerson !== undefined) patch.contactPerson = body.contactPerson ? String(body.contactPerson).trim() : null;
    if (body.contactPhone !== undefined) patch.contactPhone = body.contactPhone ? String(body.contactPhone).trim() : null;
    if (body.locationType !== undefined) patch.locationType = LOCATION_TYPES.includes(body.locationType) ? body.locationType : "urban";
    if (body.requiredSpecializations !== undefined) patch.requiredSpecializations = body.requiredSpecializations;
    if (body.requiredDays !== undefined) patch.requiredDays = body.requiredDays;
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
    await updateBranch(id, patch);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty branch update error:", err);
    return NextResponse.json({ error: "Update failed: " + err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await deleteBranch(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty branch delete error:", err);
    return NextResponse.json({ error: "Delete failed: " + err.message }, { status: 500 });
  }
}
