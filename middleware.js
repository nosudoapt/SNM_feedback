import { NextResponse } from "next/server";

// Central protection for the admin area. This is a fast presence gate whose only
// job is to redirect logged-out browsers to the login page and short-circuit
// unauthenticated API calls. The AUTHORITATIVE check (HMAC signature, expiry and
// role) still happens inside every route handler via requireAdminSession() /
// getAdminIdentity(), which run on the Node runtime where crypto is available.
// Keeping middleware signature-free avoids Edge-runtime crypto pitfalls and can
// never weaken the real, handler-level enforcement.
//
// NOTE: keep this cookie name in sync with COOKIE_NAME in lib/auth.js.
const COOKIE_NAME = "snm_admin_session";

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // The login page must always be reachable.
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(COOKIE_NAME)?.value);
  if (hasSession) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

// Only these paths are gated. Public routes (/feedback, /gbm-ebm,
// /find-pracharak, /f/[slug], /api/submissions, /api/zones) and the auth
// endpoints (/api/auth/*) are deliberately NOT matched so nothing public breaks.
export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/duty/:path*",
    "/api/cms/:path*",
    "/api/export/:path*",
    "/api/attendance/:path*",
  ],
};
