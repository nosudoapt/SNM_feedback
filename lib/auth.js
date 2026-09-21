import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
  readSessionToken,
} from "./session-token.js";

// Re-export the pure codec so existing importers of lib/auth keep working.
export { COOKIE_NAME, createSessionToken, verifySessionToken, readSessionToken };

export async function getAdminSession() {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value || "";
}

// Boolean guard kept for backward-compatibility with the existing routes.
export async function requireAdminSession() {
  return verifySessionToken(await getAdminSession());
}

// Richer guard: returns { email, role } for RBAC checks, or null if not signed in.
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
