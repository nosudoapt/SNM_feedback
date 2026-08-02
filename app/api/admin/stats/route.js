import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import { getStats, getChartData } from "../../../../lib/db";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [stats, chart] = await Promise.all([getStats(), getChartData()]);
    return NextResponse.json({ stats, chart });
  } catch (err) {
    console.error("Stats error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
