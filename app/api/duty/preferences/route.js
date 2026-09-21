import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import { getPreferenceSets, createPreferenceSet, deleteAllPreferenceSets } from "../../../../lib/duty-db";

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

export async function GET(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const pracharakId = searchParams.get("pracharakId");
    if (!pracharakId) {
      return NextResponse.json({ error: "pracharakId is required" }, { status: 400 });
    }
    const sets = await getPreferenceSets(pracharakId);
    return NextResponse.json({ sets });
  } catch (err) {
    console.error("Duty preferences list error:", err);
    return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (!body || !body.pracharakId) {
      return NextResponse.json({ error: "pracharakId is required" }, { status: 400 });
    }
    const result = await createPreferenceSet({
      pracharakId: body.pracharakId,
      setName: body.setName ? String(body.setName).trim() : "Default",
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      payload: normalizePayload(body.payload),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Duty preference create error:", err);
    return NextResponse.json({ error: "Create failed: " + err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const pracharakId = searchParams.get("pracharakId");
    if (!pracharakId) {
      return NextResponse.json({ error: "pracharakId is required" }, { status: 400 });
    }
    const result = await deleteAllPreferenceSets(pracharakId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Duty preferences delete-all error:", err);
    return NextResponse.json({ error: "Delete failed: " + err.message }, { status: 500 });
  }
}
