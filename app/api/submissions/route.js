import { NextResponse } from "next/server";
import { createSubmission } from "../../../lib/db";

const SUBMISSIONS = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const entries = SUBMISSIONS.get(ip) || [];
  const recent = entries.filter((t) => now - t < WINDOW_MS);
  SUBMISSIONS.set(ip, recent);
  return recent.length >= MAX_PER_WINDOW;
}

function markSubmission(ip) {
  const entries = SUBMISSIONS.get(ip) || [];
  entries.push(Date.now());
  SUBMISSIONS.set(ip, entries);
}

function sanitize(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[<>]/g, "").trim();
}

function stripTags(obj) {
  if (typeof obj === "string") return sanitize(obj);
  if (Array.isArray(obj)) return obj.map(stripTags);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = stripTags(v);
    }
    return out;
  }
  return obj;
}

export async function POST(request) {
  try {
    const ip = getClientIp(request);

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many submissions. Please wait a minute and try again." },
        { status: 429 }
      );
    }

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { name, phone, zoneNo, zoneName, zoneType, category } = body;

    if (!name || !phone || !zoneNo || !zoneName || !zoneType || !category) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (typeof name !== "string" || name.length > 200) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    if (typeof phone !== "string" || phone.length > 15 || !/^\d{7,15}$/.test(phone.replace(/[\s\-+]/g, ""))) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }
    if (typeof zoneNo !== "string" || zoneNo.length > 10) {
      return NextResponse.json({ error: "Invalid zone number" }, { status: 400 });
    }
    if (typeof zoneName !== "string" || zoneName.length > 200) {
      return NextResponse.json({ error: "Invalid zone name" }, { status: 400 });
    }
    if (!["general", "special"].includes(zoneType)) {
      return NextResponse.json({ error: "Invalid zone type" }, { status: 400 });
    }
    if (!["gbm-ebm", "branch-incharge", "pracharak-mahatma", "mahila", "bal", "ems"].includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const cleaned = stripTags(body);

    markSubmission(ip);

    const result = await createSubmission({
      name: cleaned.name,
      phone: cleaned.phone,
      zoneNo: cleaned.zoneNo,
      zoneName: cleaned.zoneName,
      zoneType: cleaned.zoneType,
      sectorNo: cleaned.sectorNo || null,
      sectorName: cleaned.sectorName || null,
      zonalInchargeName: cleaned.zonalInchargeName || null,
      sectorInchargeName: cleaned.sectorInchargeName || null,
      category: cleaned.category,
      payload: cleaned,
    });

    return NextResponse.json({ success: true, id: result.id, regNo: result.regNo });
  } catch (err) {
    console.error("Submission error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
