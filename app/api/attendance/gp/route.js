import { NextResponse } from "next/server";
import { getAdminIdentity } from "../../../../lib/auth";
import { can, ACTIONS } from "../../../../lib/rbac";
import { markGp, unmarkGp, getGpMarks, getGpCounts } from "../../../../lib/gp-attendance-db";
import { istTodayISO } from "../../../../lib/gp-attendance";

export const runtime = "nodejs";

function identityOr401() {
  return getAdminIdentity(); // { email, role } | null
}

// GET → all marks: { counts: {rid: days}, marks: [...], dates: [...] }
export async function GET() {
  const identity = await identityOr401();
  if (!identity || !can(identity.role, ACTIONS.VIEW_SUBMISSIONS)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [marks, counts] = await Promise.all([getGpMarks(), getGpCounts()]);
    return NextResponse.json({
      marks: marks.map((m) => ({
        rid: m.rid,
        date: String(m.marked_on).slice(0, 10),
        at: m.at,
        by: m.by,
        source: m.source,
      })),
      counts,
    });
  } catch (err) {
    console.error("GP attendance GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST → body { marks: [{ rid, date?, at?, by? }] }         (recorder / editor)
//        body { unmark: [{ rid, date }] }                   (admin only)
// Duplicate (rid + date) inserts are ignored server-side (ON CONFLICT DO
// NOTHING) so re-posts of pasted payloads can never duplicate a mark.
export async function POST(request) {
  const identity = await identityOr401();
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    if (Array.isArray(body?.unmark)) {
      if (identity.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const result = await unmarkGp(
        body.unmark.map((e) => ({ rid: e.rid, date: e.date }))
      );
      const marks = await getGpMarks();
      return NextResponse.json({
        ok: true,
        removed: result.removed,
        marks: marks.map((m) => ({ rid: m.rid, date: String(m.marked_on).slice(0, 10), at: m.at, by: m.by, source: m.source })),
      });
    }

    if (!can(identity.role, ACTIONS.MANAGE_DUTY)) {
      // viewer cannot mark; using a dedicated action keeps the semantic clear
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!Array.isArray(body?.marks)) {
      return NextResponse.json({ error: "Invalid body: marks array required" }, { status: 400 });
    }

    const fallbackDate = istTodayISO();
    const prepared = body.marks.slice(0, 5000).map((m) => ({
      rid: Number(m.rid),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(m.date || "")) ? m.date : fallbackDate,
      at: m.at,
      by: String(m.by || identity.email || ""),
      source: body.source === "payload" ? "payload" : "live",
    }));
    const result = await markGp(prepared);
    const marks = await getGpMarks();
    return NextResponse.json({
      ok: true,
      updated: result.updated,
      marks: marks.map((m) => ({ rid: m.rid, date: String(m.marked_on).slice(0, 10), at: m.at, by: m.by, source: m.source })),
    });
  } catch (err) {
    console.error("GP attendance POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
