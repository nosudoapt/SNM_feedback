import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import { seedSyntheticData } from "../../../../lib/duty-db";

export async function POST() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await seedSyntheticData();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Duty seed error:", err);
    return NextResponse.json({ error: "Seed failed: " + err.message }, { status: 500 });
  }
}
