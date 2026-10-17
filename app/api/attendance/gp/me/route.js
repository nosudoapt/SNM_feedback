import { NextResponse } from "next/server";
import { getAdminIdentity } from "../../../../../lib/auth";

export const runtime = "nodejs";

// "Who am I?" for the GP attendance app. Works for BOTH session audiences:
// an attendance login (recorder/viewer/admin of attendance) and a site-admin
// login (super_admin may operate the GP console too). Role comes from the
// signed session; no credentials are sent or accepted — the cookie decides.
// The app uses this to skip its login screen entirely when the unified
// /admin/login door has already authenticated the browser.
export async function GET() {
  const identity = await getAdminIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    user: {
      username: identity.email,
      name: identity.email,
      role: identity.role,
    },
    aud: identity.aud,
  });
}
