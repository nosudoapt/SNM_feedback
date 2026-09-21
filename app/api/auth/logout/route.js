import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, getAdminIdentity } from "../../../../lib/auth";
import { recordAudit } from "../../../../lib/access-db";

export async function POST() {
  const identity = await getAdminIdentity();
  const store = await cookies();
  store.delete(COOKIE_NAME);
  if (identity) {
    try {
      await recordAudit({ actorEmail: identity.email, action: "logout", target: identity.email });
    } catch {
      /* logout must always succeed */
    }
  }
  return NextResponse.json({ success: true });
}
