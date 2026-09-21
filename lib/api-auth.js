// lib/api-auth.js
// Small helpers for guarding API route handlers with identity + RBAC.
//
// Usage in a route:
//   const { identity, error } = await requireCan(ACTIONS.MANAGE_USERS);
//   if (error) return error;              // 401 or 403 already formed
//   // ... identity.email / identity.role are available

import { NextResponse } from "next/server";
import { getAdminIdentity } from "./auth.js";
import { can } from "./rbac.js";

export async function requireCan(action) {
  const identity = await getAdminIdentity();
  if (!identity) {
    return { identity: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (action && !can(identity.role, action)) {
    return { identity, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { identity, error: null };
}

// Lightweight CSRF defense for state-changing requests. Same-site=lax cookies
// already stop the session cookie riding along on cross-site POSTs; this is an
// extra check. If an Origin header is present it must match the Host; if it is
// absent (e.g. curl / server-to-server), we don't block.
export function sameOriginOk(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function csrfError() {
  return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });
}
