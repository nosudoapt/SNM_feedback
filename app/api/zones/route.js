import { NextResponse } from "next/server";
import { searchZones, getZoneDetails } from "../../../lib/zones";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const details = searchParams.get("details");

  if (details) {
    const zone = getZoneDetails(details);
    if (!zone) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }
    return NextResponse.json(zone);
  }

  const results = searchZones(query);
  return NextResponse.json(results);
}