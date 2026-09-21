import { NextResponse } from "next/server";
import { getAdminIdentity } from "../../../../lib/auth";

// Any signed-in admin can ask "who am I?" — used by the UI to tailor navigation
// and hide screens the current role can't use.
export async function GET() {
  const identity = await getAdminIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ email: identity.email, role: identity.role });
}
