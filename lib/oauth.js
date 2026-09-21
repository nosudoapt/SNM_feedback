// lib/oauth.js
// Pure helpers for the Google sign-in callback so the security-critical checks
// can be unit-tested with `node --test` (the route itself imports next/headers
// and can't be loaded outside Next).

const VALID_ISS = new Set(["accounts.google.com", "https://accounts.google.com"]);

// Decode a JWT payload WITHOUT verifying the RS256 signature. Safe here because
// the id_token comes straight from Google's token endpoint over server-side TLS
// (confidential authorization-code client). Claims are still validated below.
export function decodeJwtPayload(jwt) {
  try {
    const parts = String(jwt).split(".");
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// Validate the standard OIDC claims. Returns { ok:true, email } or { ok:false, reason }.
export function validateGoogleClaims(payload, { clientId, nonce, now = Date.now() } = {}) {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "bad_token" };
  if (!clientId || payload.aud !== clientId) return { ok: false, reason: "aud" };
  if (!VALID_ISS.has(payload.iss)) return { ok: false, reason: "iss" };
  if (!(Number(payload.exp) * 1000 > now)) return { ok: false, reason: "exp" };
  if (!nonce || payload.nonce !== nonce) return { ok: false, reason: "nonce" };
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  if (!emailVerified) return { ok: false, reason: "email_verified" };
  const email = (payload.email || "").toString().trim().toLowerCase();
  if (!email) return { ok: false, reason: "email" };
  return { ok: true, email };
}
