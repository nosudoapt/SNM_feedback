import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth";
import { neon } from "@neondatabase/serverless";
import { updateTour, deleteTour, isValidTourStatus } from "../../../../../lib/duty-db";

function sql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return neon(connectionString);
}

export async function GET(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const db = sql();
    const [row] = await db`SELECT t.*, p.name AS pracharak_name FROM duty_tours t LEFT JOIN duty_pracharaks p ON p.id = t.pracharak_id WHERE t.id = ${id}`;
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (err) {
    console.error("Duty tour fetch error:", err);
    return NextResponse.json({ error: "Failed to load tour" }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const patch = {};
    if (body.pracharakId !== undefined) patch.pracharakId = String(body.pracharakId).trim();
    if (body.startDate !== undefined) patch.startDate = body.startDate;
    if (body.endDate !== undefined) patch.endDate = body.endDate;
    if (body.location !== undefined) patch.location = body.location ? String(body.location).trim() : null;
    if (body.reason !== undefined) patch.reason = body.reason ? String(body.reason).trim() : null;
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
    if (body.status !== undefined) {
      if (!isValidTourStatus(body.status)) {
        return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (patch.startDate && patch.endDate && patch.startDate > patch.endDate) {
      return NextResponse.json({ error: "Start date must be before end date" }, { status: 400 });
    }
    await updateTour(id, patch);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty tour update error:", err);
    return NextResponse.json({ error: "Update failed: " + err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await deleteTour(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty tour delete error:", err);
    return NextResponse.json({ error: "Delete failed: " + err.message }, { status: 500 });
  }
}
