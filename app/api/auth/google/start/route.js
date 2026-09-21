import { NextResponse } from "next/server";
import crypto from "crypto";

// Step 1 of Google sign-in: send the browser to Google's consent screen.
// We stash a random `state` (CSRF) and `nonce` (replay protection) in short-lived
// httpOnly cookies and verify them in the callback.
//
// Dormant until GOOGLE_CLIENT_ID and OAUTH_REDIRECT_URL are configured — until
// then this just bounces back to the login page with a helpful error.
export async function GET(request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.OAUTH_REDIRECT_URL;
  const loginUrl = new URL("/admin/login", request.nextUrl.origin);

  if (!clientId || !redirectUri) {
    loginUrl.searchParams.set("error", "oauth_not_configured");
    return NextResponse.redirect(loginUrl);
  }

  const state = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("access_type", "online");
  authUrl.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(authUrl);
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes
  };
  res.cookies.set("oauth_state", state, cookieOpts);
  res.cookies.set("oauth_nonce", nonce, cookieOpts);
  return res;
}
