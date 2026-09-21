import { NextResponse } from "next/server";
import { requireCan, sameOriginOk, csrfError } from "../../../../lib/api-auth";
import { ACTIONS, ROLES, isValidRole } from "../../../../lib/rbac";
import {
  listUsers,
  upsertUser,
  setUserRole,
  setUserActive,
  getUserByEmail,
  countActiveSuperAdmins,
  recordAudit,
  normalizeEmail,
} from "../../../../lib/access-db";

// Returns an error response if the change would remove the last active
// super_admin (demotion or deactivation), else null.
async function guardLastSuperAdmin(target, willBeSuper, willBeActive) {
  const removingSuper =
    target.role === ROLES.SUPER_ADMIN && target.active && !(willBeSuper && willBeActive);
  if (!removingSuper) return null;
  const supers = await countActiveSuperAdmins();
  if (supers <= 1) {
    return NextResponse.json(
      { error: "Cannot demote or deactivate the last active super admin." },
      { status: 409 }
    );
  }
  return null;
}

export async function GET() {
  const { error } = await requireCan(ACTIONS.MANAGE_USERS);
  if (error) return error;
  const users = await listUsers();
  return NextResponse.json({ users });
}

// Add a new allowlisted user, or update an existing one's name/role.
export async function POST(request) {
  const { identity, error } = await requireCan(ACTIONS.MANAGE_USERS);
  if (error) return error;
  if (!sameOriginOk(request)) return csrfError();

  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  const role = isValidRole(body?.role) ? body.role : ROLES.VIEWER;
  const name = body?.name ? String(body.name).trim() : null;

  const existing = await getUserByEmail(email);
  if (existing) {
    const guard = await guardLastSuperAdmin(existing, role === ROLES.SUPER_ADMIN, true);
    if (guard) return guard;
  }

  const user = await upsertUser({ email, name, role, active: true });
  await recordAudit({
    actorEmail: identity.email,
    action: "user.upsert",
    target: email,
    detail: { role, name },
  });
  return NextResponse.json({ user });
}

// Change role and/or active flag of an existing user.
export async function PATCH(request) {
  const { identity, error } = await requireCan(ACTIONS.MANAGE_USERS);
  if (error) return error;
  if (!sameOriginOk(request)) return csrfError();

  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const target = await getUserByEmail(email);
  if (!target) return NextResponse.json({ error: "No such user" }, { status: 404 });

  const wantRole = body?.role;
  const wantActive = body?.active;
  if (wantRole !== undefined && !isValidRole(wantRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const willBeSuper = wantRole !== undefined ? wantRole === ROLES.SUPER_ADMIN : target.role === ROLES.SUPER_ADMIN;
  const willBeActive = wantActive !== undefined ? !!wantActive : target.active;
  const guard = await guardLastSuperAdmin(target, willBeSuper, willBeActive);
  if (guard) return guard;

  let user = target;
  if (wantRole !== undefined) {
    user = await setUserRole(email, wantRole);
    await recordAudit({ actorEmail: identity.email, action: "user.role", target: email, detail: { role: wantRole } });
  }
  if (wantActive !== undefined) {
    user = await setUserActive(email, !!wantActive);
    await recordAudit({
      actorEmail: identity.email,
      action: wantActive ? "user.activate" : "user.deactivate",
      target: email,
    });
  }
  return NextResponse.json({ user });
}
