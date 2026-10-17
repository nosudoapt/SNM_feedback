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

  // The login pages must always be reachable.
  if (pathname === "/admin/login" || pathname === "/api/attendance/gp/login") {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(COOKIE_NAME)?.value || "";
  if (!cookieValue) {
    return gateFor(request, pathname, false, null);
  }

  // Only CURRENT-format tokens count as a session. Anything not starting with
  // "v3." is a stale pre-audience cookie and is treated as logged out, so old
  // gp/admin cookies can never sneak through the gate.
  const hasV3 = cookieValue.startsWith("v3.");

  // Shallow (UNVERIFIED) audience peek — signature-free so it stays Edge-safe.
  // It only refines the redirect UX; the authoritative audience + role checks
  // happen in every handler via requireAdminSession()/getAdminIdentity().
  let aud = "admin";
  if (hasV3) {
    try {
      const b64 = cookieValue.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      aud = JSON.parse(atob(b64)).a || "admin";
    } catch {
      aud = "admin"; // unparseable → assume admin; signature gate decides later
    }
  }
  return gateFor(request, pathname, hasV3, aud);
}

function gateFor(request, pathname, hasSession, aud) {
  const isAttendanceApi = pathname.startsWith("/api/attendance/");

  // Attendance endpoints accept EITHER audience (attendance users and site
  // admins alike) — role checks live in the handlers.
  if (isAttendanceApi) {
    if (hasSession) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Everything else in the matcher is admin-area: must be an admin-audience
  // session. An attendance cookie redirects to login (strict, as before).
  if (hasSession && aud === "admin") {
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

// Only these paths are gated. Public routes (/gbm-ebm,
// /feedback/pracharak-mahatma, /feedback/branch-incharge, /f/[slug],
// /api/submissions, /api/zones) and the auth endpoints (/api/auth/*) are
// deliberately NOT matched so nothing public breaks.
export const config = {
  matcher: [
    "/",
    "/feedback",
    "/find-pracharak",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/duty/:path*",
    "/api/cms/:path*",
    "/api/export/:path*",
    "/api/attendance/:path*",
  ],
};
