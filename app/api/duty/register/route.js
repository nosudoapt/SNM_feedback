import { NextResponse } from "next/server";
import { ensureFullDutySchema } from "../../../lib/duty-db";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

function sql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return neon(connectionString);
}

export async function POST(request) {
  try {
    await ensureFullDutySchema();
    const db = sql();
    const body = await request.json();

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (String(body.name).trim().length > 200) {
      return NextResponse.json({ error: "Name must be under 200 characters" }, { status: 400 });
    }
    if (!body.contact || !String(body.contact).trim()) {
      return NextResponse.json({ error: "Mobile number is required" }, { status: 400 });
    }
    const contactClean = String(body.contact).trim().replace(/[\s\-()]/g, "");
    if (!/^[0-9]{7,15}$/.test(contactClean)) {
      return NextResponse.json({ error: "Invalid phone number — use 7-15 digits" }, { status: 400 });
    }
    if (!Array.isArray(body.availableSundays) || body.availableSundays.length === 0) {
      return NextResponse.json({ error: "Select at least one Sunday" }, { status: 400 });
    }
    if (!Array.isArray(body.allowedAreas) || body.allowedAreas.length === 0) {
      return NextResponse.json({ error: "Select at least one area" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const name = String(body.name).trim();
    const contact = String(body.contact).trim();
    const city = body.city ? String(body.city).trim() : null;
    const sectorId = body.sectorId || null;
    const rating = Math.min(3, Math.max(1, Number(body.rating) || 2));
    const monthlyTarget = Math.min(31, Math.max(1, Number(body.monthlyTarget) || 2));
    const specializations = Array.isArray(body.specializations) ? body.specializations : [];
    const isOutstation = Boolean(body.isOutstation);
    const notes = body.notes ? String(body.notes).trim() : null;

    const [existing] = await db`SELECT id FROM duty_pracharaks WHERE name = ${name} AND contact = ${contact} LIMIT 1`;
    if (existing) {
      return NextResponse.json({ error: "A pracharak with this name and contact already exists" }, { status: 409 });
    }

    await db`
      INSERT INTO duty_pracharaks (id, name, contact, sector_id, rating, monthly_target, specializations, city, is_outstation, payload)
      VALUES (${id}, ${name}, ${contact}, ${sectorId}, ${rating}, ${monthlyTarget}, ${specializations}, ${city}, ${isOutstation},
              ${JSON.stringify({
                source: "registration_form",
                registeredAt: new Date().toISOString(),
                availableSundays: body.availableSundays,
                availableSaturdays: body.availableSaturdays || [],
                allowedAreas: body.allowedAreas,
                notes,
              })}::jsonb)
    `;

    const preferencePayload = {
      sectorIds: sectorId ? [sectorId] : [],
      days: [0],
      weeks: body.availableSundays || [],
      times: [],
      preferredDays: [],
      preferredWeeks: [],
      preferredSectorIds: [],
      allowedAreas: body.allowedAreas || [],
      note: notes || "",
    };

    await db`
      INSERT INTO duty_preferences (id, pracharak_id, set_name, is_active, payload)
      VALUES (${crypto.randomUUID()}, ${id}, 'Registration Default', true,
              ${JSON.stringify(preferencePayload)}::jsonb)
    `;

    return NextResponse.json({ success: true, id, message: "Registration successful" });
  } catch (err) {
    console.error("Registration error:", err);
    return NextResponse.json({ error: "Registration failed: " + err.message }, { status: 500 });
  }
}
