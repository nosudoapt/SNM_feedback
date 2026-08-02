import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import { getSubmissionsPage } from "../../../../lib/db";

export async function GET(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const params = {
      q: searchParams.get("q") || "",
      category: searchParams.get("category") || "",
      zoneType: searchParams.get("zoneType") || "",
      sort: searchParams.get("sort") || "created_at",
      order: searchParams.get("order") || "desc",
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "20",
    };

    const { rows, total } = await getSubmissionsPage(params);
    return NextResponse.json({
      rows,
      total,
      page: Math.max(1, Number(params.page) || 1),
      limit: Math.min(Math.max(1, Number(params.limit) || 20), 100),
    });
  } catch (err) {
    console.error("Submissions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
