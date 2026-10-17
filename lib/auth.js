import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  AUD_ADMIN,
  AUD_ATTENDANCE,
  createSessionToken,
  verifySessionToken,
  readSessionToken,
} from "./session-token.js";

// Re-export the pure codec so existing importers of lib/auth keep working.
export { COOKIE_NAME, AUD_ADMIN, AUD_ATTENDANCE, createSessionToken, verifySessionToken, readSessionToken };

export async function getAdminSession() {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value || "";
}

// STRICT gate for the admin area: a valid session AND the admin audience.
// An attendance-cookie (aud="attendance") from the GP field login can never
// pass this, even though it is signed with the same secret and role scheme.
export async function requireAdminSession() {
  const identity = await readSessionToken(await getAdminSession());
  return identity !== null && identity.aud === AUD_ADMIN;
}

// Richer guard: returns { email, role, iat, aud } for a valid, unexpired
// session of ANY audience. Callers decide which audience they accept.
export async function getAdminIdentity() {
  return readSessionToken(await getAdminSession());
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}
