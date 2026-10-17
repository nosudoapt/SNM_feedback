import { NextResponse } from "next/server";
import { getAdminIdentity } from "../../../../../lib/auth";
import { can, ACTIONS } from "../../../../../lib/rbac";
import { listGpUsers, upsertGpUser, setGpUserActive } from "../../../../../lib/gp-attendance-db";
import { recordAudit } from "../../../../../lib/access-db";

export const runtime = "nodejs";

// Manage the field-team accounts (USERNAME + PIN). Admin only.
export async function GET() {
  const identity = await getAdminIdentity();
  if (!identity || !can(identity.role, ACTIONS.MANAGE_USERS)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const users = await listGpUsers();
    return NextResponse.json({ users });
  } catch (err) {
    console.error("GP users GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  const identity = await getAdminIdentity();
  if (!identity || !can(identity.role, ACTIONS.MANAGE_USERS)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const username = String(body?.username || "").trim().toLowerCase();
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });
  if (!/^[\w.\- @]{2,40}$/.test(username)) {
    return NextResponse.json({ error: "Username may contain letters, numbers, dot, dash, underscore" }, { status: 400 });
  }

  try {
    if (body?.active !== undefined && !body.pin && !body.name && !body.role) {
      // plain activation toggle
      const user = await setGpUserActive(username, !!body.active);
      await recordAudit({ actorEmail: identity.email, action: "attendance.gp.user.toggle", target: username, detail: { active: !!body.active } });
      return NextResponse.json({ ok: true, user });
    }

    if (body?.pin && !/^\d{4,8}$/.test(String(body.pin))) {
      return NextResponse.json({ error: "PIN must be 4-8 digits" }, { status: 400 });
    }

    const user = await upsertGpUser({
      username,
      name: body?.name ? String(body.name).slice(0, 80) : undefined,
      pin: body?.pin ? String(body.pin) : undefined,
      role: body?.role || "viewer",
      active: body?.active === undefined ? true : !!body.active,
    });
    await recordAudit({
      actorEmail: identity.email,
      action: "attendance.gp.user.upsert",
      target: username,
      detail: { role: user.role, active: user.active, pinChanged: !!body?.pin },
    });
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    console.error("GP users POST error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
