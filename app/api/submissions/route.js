import { NextResponse } from "next/server";
import { createSubmission } from "../../../lib/db";

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { name, phone, zoneNo, zoneName, zoneType, sectorNo, sectorName, zonalInchargeName, sectorInchargeName, category } = body;

    if (!name || !phone || !zoneNo || !zoneName || !zoneType || !category) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await createSubmission({
      name,
      phone,
      zoneNo,
      zoneName,
      zoneType,
      sectorNo: sectorNo || null,
      sectorName: sectorName || null,
      zonalInchargeName: zonalInchargeName || null,
      sectorInchargeName: sectorInchargeName || null,
      category,
      payload: body,
    });

    return NextResponse.json({ success: true, id: result.id });
  } catch (err) {
    console.error("Submission error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}