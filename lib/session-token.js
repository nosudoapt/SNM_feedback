// lib/session-token.js
// Pure, framework-free session-token codec so it can be unit-tested with
// `node --test` (lib/auth.js wraps this with Next's cookies() helpers).
//
// Token format (v3): "v3.<base64url(JSON{e,r,iat,a})>.<hmac-sha256>"
// `a` = audience. v3 ALWAYS carries an audience.
// Centralized RBAC: ONE signing format + ONE role scheme (lib/rbac.js), but two
// login audiences so a field-attendance account can never sign into the admin
// area and vice-versa (gp attendance login issues audience="attendance").
//
// v3 bump: v2 and v1 tokens have NO audience layout, so a stale pre-v3 cookie
// (e.g. issued by the old gp login) could be mistaken for admin. They are now
// rejected outright — everyone re-logs in once, together with the v3 rollout.

import crypto from "crypto";
import { normalizeRole, ROLES } from "./rbac.js";

export const COOKIE_NAME = "snm_admin_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const AUD_ADMIN = "admin";
export const AUD_ATTENDANCE = "attendance";
const V2_PREFIX = "v3";

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

// Identity fallback when no per-user email exists (e.g. owner logins).
export function ownerEmail() {
  return (process.env.ADMIN_EMAIL || process.env.ADMIN_USERNAME || "admin")
    .toString()
    .trim()
    .toLowerCase();
}

export function createSessionToken(email = null, role = null, iat = Date.now(), audience = AUD_ADMIN) {
  const aud = audience === AUD_ATTENDANCE ? AUD_ATTENDANCE : AUD_ADMIN;
  const payload = {
    e: email ? String(email).trim().toLowerCase() : ownerEmail(),
    r: normalizeRole(role || ROLES.SUPER_ADMIN),
    iat,
    a: aud,
  };
  const body = base64urlEncode(JSON.stringify(payload));
  return `${V2_PREFIX}.${body}.${hmac(body)}`;
}

// Returns { email, role, iat, aud } for a valid, unexpired v3 token, else null.
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
      aud: payload.a === AUD_ATTENDANCE ? AUD_ATTENDANCE : AUD_ADMIN,
    };
  }

  // Any other format (legacy v1, pre-v3 v2, garbage) is dead — the v3 bump
  // invalidates every audience-less cookie from before the RBAC unification.
  return null;
}

export function verifySessionToken(token, now = Date.now()) {
  return readSessionToken(token, now) !== null;
}
