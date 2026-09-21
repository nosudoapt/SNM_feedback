// lib/session-token.js
// Pure, framework-free session-token codec so it can be unit-tested with
// `node --test` (lib/auth.js wraps this with Next's cookies() helpers).
//
// Token format (v2): "v2.<base64url(JSON{e,r,iat})>.<hmac-sha256>"
// Legacy (v1):       "<issuedAt>.<hmac-sha256>"  — treated as the owner/super_admin.

import crypto from "crypto";
import { normalizeRole, ROLES } from "./rbac.js";

export const COOKIE_NAME = "snm_admin_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const V2_PREFIX = "v2";

// Fail CLOSED in production: never sign with a guessable fallback secret.
const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-do-not-use-in-prod";
let warnedAboutDevSecret = false;

function secret() {
  const configured = process.env.AUTH_SECRET || process.env.ADMIN_AUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is not set. Refusing to sign sessions with a fallback secret in production."
    );
  }
  if (!warnedAboutDevSecret) {
    console.warn(
      "[auth] AUTH_SECRET is not set — using an insecure development fallback. Set AUTH_SECRET before deploying."
    );
    warnedAboutDevSecret = true;
  }
  return DEV_FALLBACK_SECRET;
}

function hmac(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

function timingSafeEqualHex(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function base64urlEncode(str) {
  return Buffer.from(str, "utf8").toString("base64url");
}

function base64urlDecode(b64) {
  return Buffer.from(b64, "base64url").toString("utf8");
}

// Identity attributed to a legacy (v1) cookie, or when no per-user email exists.
export function ownerEmail() {
  return (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || "admin")
    .toString()
    .trim()
    .toLowerCase();
}

export function createSessionToken(email = null, role = null, iat = Date.now()) {
  const payload = {
    e: email ? String(email).trim().toLowerCase() : ownerEmail(),
    r: normalizeRole(role || ROLES.SUPER_ADMIN),
    iat,
  };
  const body = base64urlEncode(JSON.stringify(payload));
  return `${V2_PREFIX}.${body}.${hmac(body)}`;
}

// Returns { email, role, iat } for a valid, unexpired token, else null.
export function readSessionToken(token, now = Date.now()) {
  if (!token || typeof token !== "string") return null;

  if (token.startsWith(`${V2_PREFIX}.`)) {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [, body, sig] = parts;
    if (!body || !sig) return null;
    if (!timingSafeEqualHex(sig, hmac(body))) return null;
    let payload;
    try {
      payload = JSON.parse(base64urlDecode(body));
    } catch {
      return null;
    }
    const iat = Number(payload?.iat);
    if (!Number.isFinite(iat) || now - iat > SESSION_TTL_MS) return null;
    return {
      email: (payload.e || ownerEmail()).toString().toLowerCase(),
      role: normalizeRole(payload.r),
      iat,
    };
  }

  // Legacy v1 token.
  const [issuedAt, sig] = token.split(".");
  if (!issuedAt || !sig) return null;
  const ts = Number(issuedAt);
  if (!Number.isFinite(ts) || now - ts > SESSION_TTL_MS) return null;
  if (!timingSafeEqualHex(sig, hmac(issuedAt))) return null;
  return { email: ownerEmail(), role: ROLES.SUPER_ADMIN, iat: ts };
}

export function verifySessionToken(token, now = Date.now()) {
  return readSessionToken(token, now) !== null;
}
