import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import { getBranchesPage, createBranch } from "../../../../lib/duty-db";

const LOCATION_TYPES = ["urban", "semi_urban", "rural", "village"];

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeBranch(body) {
  const defaultSchedule = [{ week: 1, day: 1 }, { week: 2, day: 1 }];
  return {
    name: String(body.name || "").trim(),
    branchCode: body.branchCode ? String(body.branchCode).trim() : null,
    sectorId: body.sectorId || null,
    city: body.city ? String(body.city).trim() : null,
    area: body.area ? String(body.area).trim() : null,
    address: body.address ? String(body.address).trim() : null,
    contactPerson: body.contactPerson ? String(body.contactPerson).trim() : null,
    contactPhone: body.contactPhone ? String(body.contactPhone).trim() : null,
    locationType: LOCATION_TYPES.includes(body.locationType) ? body.locationType : "urban",
    requiredSpecializations: Array.isArray(body.requiredSpecializations) ? body.requiredSpecializations : [],
    requiredDays: Array.isArray(body.requiredDays) ? body.requiredDays : defaultSchedule,
    payload: body.payload || {},
  };
}

export async function GET(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const result = await getBranchesPage({
      q: searchParams.get("q") || "",
      sectorId: searchParams.get("sectorId") || "",
      city: searchParams.get("city") || "",
      active: searchParams.get("active") || "",
      sort: searchParams.get("sort") || "name",
      order: searchParams.get("order") || "asc",
      page: Number(searchParams.get("page")) || 1,
      limit: Number(searchParams.get("limit")) || 20,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Duty branches list error:", err);
    return NextResponse.json({ error: "Failed to load branches" }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (!body || !String(body.name || "").trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const result = await createBranch(normalizeBranch(body));
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Duty branch create error:", err);
    return NextResponse.json({ error: "Create failed: " + err.message }, { status: 500 });
  }
}
