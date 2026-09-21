import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import { getPracharaksPage, createPracharak } from "../../../../lib/duty-db";

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function GET(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const result = await getPracharaksPage({
      q: searchParams.get("q") || "",
      sectorId: searchParams.get("sectorId") || "",
      rating: searchParams.get("rating") || "",
      active: searchParams.get("active") || "",
      sort: searchParams.get("sort") || "name",
      order: searchParams.get("order") || "asc",
      page: Number(searchParams.get("page")) || 1,
      limit: Number(searchParams.get("limit")) || 20,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Duty pracharaks list error:", err);
    return NextResponse.json({ error: "Failed to load pracharaks" }, { status: 500 });
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
    if (String(body.name).trim().length > 200) {
      return NextResponse.json({ error: "Name must be under 200 characters" }, { status: 400 });
    }
    if (body.contact) {
      const contactClean = String(body.contact).trim().replace(/[\s\-()]/g, "");
      if (!/^[0-9]{7,15}$/.test(contactClean)) {
        return NextResponse.json({ error: "Invalid phone number — use 7-15 digits" }, { status: 400 });
      }
    }
    const result = await createPracharak({
      name: String(body.name).trim(),
      contact: body.contact ? String(body.contact).trim() : null,
      sectorId: body.sectorId || null,
      rating: clampInt(body.rating, 1, 3, 2),
      monthlyTarget: clampInt(body.monthlyTarget, 0, 31, 2),
      awAd: Boolean(body.awAd),
      specializations: Array.isArray(body.specializations) ? body.specializations : [],
      city: body.city ? String(body.city).trim() : null,
      isOutstation: Boolean(body.isOutstation),
      homeCity: body.homeCity ? String(body.homeCity).trim() : null,
      payload: {},
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Duty pracharak create error:", err);
    return NextResponse.json({ error: "Create failed: " + err.message }, { status: 500 });
  }
}
