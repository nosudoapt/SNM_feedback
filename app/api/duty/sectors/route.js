import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import { getSectors } from "../../../../lib/duty-db";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const sectors = await getSectors();
    return NextResponse.json({ sectors });
  } catch (err) {
    console.error("Duty sectors error:", err);
    return NextResponse.json({ error: "Failed to load sectors" }, { status: 500 });
  }
}
