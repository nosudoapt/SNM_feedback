import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSessionToken, COOKIE_NAME, adminCookieOptions } from "../../../../lib/auth";

export async function POST(request) {
  try {
    const body = await request.json();
    const { username, password } = body || {};

    const adminUser = process.env.ADMIN_USERNAME;
    const adminPass = process.env.ADMIN_PASSWORD;

    if (!adminUser || !adminPass) {
      return NextResponse.json({ error: "Admin credentials not configured" }, { status: 500 });
    }

    if (username !== adminUser || password !== adminPass) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = createSessionToken();
    const store = await cookies();
    store.set(COOKIE_NAME, token, adminCookieOptions());

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}