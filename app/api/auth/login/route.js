import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSessionToken, COOKIE_NAME, adminCookieOptions } from "../../../../lib/auth";
import { ROLES } from "../../../../lib/rbac";
import { seedSuperAdmin, touchLastLogin, recordAudit } from "../../../../lib/access-db";

// Best-effort, in-memory rate limiter. In a serverless deployment each warm
// instance has its own map, so this is defense-in-depth rather than a hard
// guarantee — a durable store (Neon table / Upstash) is recommended for
// production and noted in the setup guide.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map(); // ip -> { count, first }

function clientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: now });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ATTEMPTS;
}

function clearAttempts(ip) {
  attempts.delete(ip);
}

function ownerEmail() {
  return (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || "admin").toString().trim().toLowerCase();
}

export async function POST(request) {
  const ip = clientIp(request);
  try {
    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { username, password } = body || {};

    const adminUser = process.env.ADMIN_USERNAME;
    const adminPass = process.env.ADMIN_PASSWORD;

    if (!adminUser || !adminPass) {
      return NextResponse.json({ error: "Admin credentials not configured" }, { status: 500 });
    }

    if (username !== adminUser || password !== adminPass) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Successful password login = the break-glass owner, always a super_admin.
    const email = ownerEmail();
    const token = createSessionToken(email, ROLES.SUPER_ADMIN);
    const store = await cookies();
    store.set(COOKIE_NAME, token, adminCookieOptions());
    clearAttempts(ip);

    // Keep the owner in the allowlist + log the login, but never let a DB hiccup
    // block the break-glass password path.
    try {
      await seedSuperAdmin(email, process.env.ADMIN_NAME || null);
      await touchLastLogin(email);
      await recordAudit({ actorEmail: email, action: "login.password", target: email, detail: { ip } });
    } catch (dbErr) {
      console.error("Post-login bookkeeping failed (login still succeeded):", dbErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
