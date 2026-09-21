import { NextResponse } from "next/server";
import { COOKIE_NAME, createSessionToken, adminCookieOptions } from "../../../../../lib/auth";
import { getUserByEmail, touchLastLogin, recordAudit } from "../../../../../lib/access-db";
import { decodeJwtPayload, validateGoogleClaims } from "../../../../../lib/oauth";

export async function GET(request) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  const fail = (code) => {
    const u = new URL("/admin/login", origin);
    u.searchParams.set("error", code);
    const r = NextResponse.redirect(u);
    r.cookies.set("oauth_state", "", { path: "/", maxAge: 0 });
    r.cookies.set("oauth_nonce", "", { path: "/", maxAge: 0 });
    return r;
  };

  if (params.get("error")) return fail("access_denied");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail("missing_params");

  const cookieState = request.cookies.get("oauth_state")?.value;
  const cookieNonce = request.cookies.get("oauth_nonce")?.value;
  if (!cookieState || state !== cookieState) return fail("state_mismatch");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.OAUTH_REDIRECT_URL;
  if (!clientId || !clientSecret || !redirectUri) return fail("oauth_not_configured");

  // Exchange the authorization code for tokens.
  let idToken;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail("token_exchange");
    const tok = await tokenRes.json();
    idToken = tok.id_token;
  } catch {
    return fail("token_exchange");
  }
  if (!idToken) return fail("no_id_token");

  const payload = decodeJwtPayload(idToken);
  const claims = validateGoogleClaims(payload, { clientId, nonce: cookieNonce });
  if (!claims.ok) return fail("token_invalid");
  const email = claims.email;

  // Allowlist check — the gate. Fail closed if the DB is unreachable.
  let user;
  try {
    user = await getUserByEmail(email);
  } catch {
    return fail("server_error");
  }
  if (!user || !user.active) {
    await recordAudit({ actorEmail: email, action: "login.denied", target: email, detail: { via: "google" } });
    return fail("not_allowed");
  }

  // Success — issue the session bound to this email + their role.
  const token = createSessionToken(email, user.role);
  const res = NextResponse.redirect(new URL("/admin", origin));
  res.cookies.set(COOKIE_NAME, token, adminCookieOptions());
  res.cookies.set("oauth_state", "", { path: "/", maxAge: 0 });
  res.cookies.set("oauth_nonce", "", { path: "/", maxAge: 0 });

  try {
    await touchLastLogin(email);
    await recordAudit({ actorEmail: email, action: "login.google", target: email, detail: { role: user.role } });
  } catch {
    /* bookkeeping only */
  }
  return res;
}
