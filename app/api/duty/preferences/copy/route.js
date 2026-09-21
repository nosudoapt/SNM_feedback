import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth";
import { copyPreferenceSets } from "../../../../../lib/duty-db";

export async function POST(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { fromPracharakId, toPracharakId } = body || {};
    if (!fromPracharakId || !toPracharakId) {
      return NextResponse.json({ error: "fromPracharakId and toPracharakId are required" }, { status: 400 });
    }
    if (fromPracharakId === toPracharakId) {
      return NextResponse.json({ error: "Source and destination must differ" }, { status: 400 });
    }
    const result = await copyPreferenceSets(fromPracharakId, toPracharakId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Duty preference copy error:", err);
    return NextResponse.json({ error: "Copy failed: " + err.message }, { status: 500 });
  }
}
