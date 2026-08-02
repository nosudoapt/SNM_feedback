import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "snm_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  return process.env.AUTH_SECRET || process.env.ADMIN_AUTH_SECRET || "dev-secret";
}

function hmac(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

export function createSessionToken() {
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${hmac(issuedAt)}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string") return false;
  const [issuedAt, sig] = token.split(".");
  if (!issuedAt || !sig) return false;

  const ts = Number(issuedAt);
  if (!Number.isFinite(ts) || Date.now() - ts > SESSION_TTL_MS) return false;

  const expected = hmac(issuedAt);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function getAdminSession() {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value || "";
}

export async function requireAdminSession() {
  return verifySessionToken(await getAdminSession());
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

export { COOKIE_NAME };
