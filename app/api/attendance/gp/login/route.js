import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUD_ATTENDANCE, createSessionToken, adminCookieOptions } from "../../../../../lib/auth";
import { verifyGpUser } from "../../../../../lib/gp-attendance-db";
import { recordAudit } from "../../../../../lib/access-db";

export const runtime = "nodejs";

// Login for the GP attendance field team (5-10 people with username + PIN).
// Issues the same signed session cookie format, but with AUDIENCE
// "attendance" — one centralized RBAC (roles viewer|editor|super_admin from
// lib/rbac.js), while the audience guarantees an attendance account can never
// sign into the admin area, and admin accounts keep their separate audiences.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const username = String(body?.username || "").trim();
  const pin = String(body?.pin || "");
  if (!username || !pin) {
    return NextResponse.json({ error: "Username and PIN required" }, { status: 400 });
  }

  try {
    const user = await verifyGpUser(username, pin);
    if (!user) {
      return NextResponse.json({ error: "Wrong username or PIN" }, { status: 401 });
    }
    const store = await cookies();
    const token = createSessionToken(user.username, user.role, Date.now(), AUD_ATTENDANCE);
    store.set("snm_admin_session", token, adminCookieOptions());
    await recordAudit({ actorEmail: user.username, action: "attendance.gp.login", target: user.username, detail: { role: user.role } });
    return NextResponse.json({ ok: true, user: { username: user.username, name: user.name, role: user.role } });
  } catch (err) {
    console.error("GP attendance login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
