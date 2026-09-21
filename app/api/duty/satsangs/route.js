import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import { getSatsangsPage, createSatsang } from "../../../../lib/duty-db";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeSatsang(body) {
  const dayOfWeek = clampInt(body.dayOfWeek, 0, 6, 0);
  return {
    name: String(body.name).trim(),
    address: body.address ? String(body.address).trim() : null,
    contact: body.contact ? String(body.contact).trim() : null,
    sectorId: body.sectorId || null,
    dayOfWeek,
    date: body.date || null,
    timeType: body.timeType === "E" ? "E" : "M",
    timeSlot: body.timeSlot ? String(body.timeSlot).trim() : "10:00",
    rating: clampInt(body.rating, 1, 3, 2),
    predefinedLocalId: body.predefinedLocalId || null,
    payload: { dayName: body.date ? null : DAYS[dayOfWeek] },
  };
}

export async function GET(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const result = await getSatsangsPage({
      q: searchParams.get("q") || "",
      sectorId: searchParams.get("sectorId") || "",
      day: searchParams.get("day") || "",
      active: searchParams.get("active") || "",
      sort: searchParams.get("sort") || "name",
      order: searchParams.get("order") || "asc",
      page: Number(searchParams.get("page")) || 1,
      limit: Number(searchParams.get("limit")) || 20,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Duty satsangs list error:", err);
    return NextResponse.json({ error: "Failed to load satsangs" }, { status: 500 });
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
    const result = await createSatsang(normalizeSatsang(body));
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Duty satsang create error:", err);
    return NextResponse.json({ error: "Create failed: " + err.message }, { status: 500 });
  }
}
