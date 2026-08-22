import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../lib/auth";
import { markAttended, getSubmissions } from "../../../lib/db";

export async function POST(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body || !Array.isArray(body.marks)) {
      return NextResponse.json({ error: "Invalid body: marks array required" }, { status: 400 });
    }
    const result = await markAttended(body.marks.slice(0, 5000));
    return NextResponse.json({ success: true, updated: result.updated });
  } catch (err) {
    console.error("Attendance sync error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await getSubmissions("all", null);
    const attended = rows.filter((row) => row.attended_at).length;
    return NextResponse.json({
      total: rows.length,
      attended,
      absent: rows.length - attended,
    });
  } catch (err) {
    console.error("Attendance stats error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
