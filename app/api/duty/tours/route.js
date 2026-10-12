import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import { getToursPage, createTour } from "../../../../lib/duty-db";

export async function GET(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const result = await getToursPage({
      pracharakId: searchParams.get("pracharakId") || "",
      month: searchParams.get("month") || "",
      year: searchParams.get("year") || "",
      status: searchParams.get("status") || "",
      sort: searchParams.get("sort") || "start_date",
      order: searchParams.get("order") || "asc",
      page: Number(searchParams.get("page")) || 1,
      limit: Number(searchParams.get("limit")) || 50,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Duty tours list error:", err);
    return NextResponse.json({ error: "Failed to load tours" }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (!body || !body.pracharakId) {
      return NextResponse.json({ error: "Pracharak is required" }, { status: 400 });
    }
    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: "Start date and end date are required" }, { status: 400 });
    }
    if (body.startDate > body.endDate) {
      return NextResponse.json({ error: "Start date must be before end date" }, { status: 400 });
    }
    if (body.status && !["not_uploaded", "uploaded", "reviewed", "locked"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }
    const result = await createTour({
      pracharakId: String(body.pracharakId).trim(),
      startDate: body.startDate,
      endDate: body.endDate,
      location: body.location ? String(body.location).trim() : null,
      reason: body.reason ? String(body.reason).trim() : null,
      status: body.status || "uploaded",
      payload: body.payload || {},
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Duty tour create error:", err);
    return NextResponse.json({ error: "Create failed: " + err.message }, { status: 500 });
  }
}
