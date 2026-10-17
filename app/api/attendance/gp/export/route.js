import { NextResponse } from "next/server";
import { getAdminIdentity } from "../../../../../lib/auth";
import { can, ACTIONS } from "../../../../../lib/rbac";
import { getGpMarks } from "../../../../../lib/gp-attendance-db";
import { GP_DATA } from "../../../../../lib/gp-data";
import { istTodayISO } from "../../../../../lib/gp-attendance";
import { buildXlsx } from "../../../../../lib/xlsx-writer";

export const runtime = "nodejs";

// GET → .xlsx download. Sheet 1: full GP roster + ONE "Present or Not" column
// for the selected day (no per-date columns as requested). Defaults to
// today (IST). Sheet 2 stays the raw audit log of who marked whom.
export async function GET(request) {
  const identity = await getAdminIdentity();
  if (!identity || !can(identity.role, ACTIONS.EXPORT_SUBMISSIONS)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Selected day — either ?date=YYYY-MM-DD or today in IST.
    let day = istTodayISO();
    const q = new URL(request.url).searchParams.get("date");
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) day = q;

    const marks = await getGpMarks();
    const presentToday = new Set(
      marks
        .filter((m) => String(m.marked_on).slice(0, 10) === day)
        .map((m) => m.rid)
    );

    // lib/gp-data.js stores compact rows: [gpNo, zoneNo, zoneName, name, station, phones, age, from, to]
    const roster = (rid) => {
      const r = GP_DATA[rid - 1] || [];
      return { gpNo: r[0] || "", zoneName: r[2] || "", name: r[3] || "" };
    };

    let daysByPerson;
    const byPerson = new Map(); // rid -> distinct dates overall (for "Days present")
    for (const m of marks) {
      const d = String(m.marked_on).slice(0, 10);
      if (!byPerson.has(m.rid)) byPerson.set(m.rid, new Set());
      byPerson.get(m.rid).add(d);
    }

    const rosterRows = [
      [
        "SR",
        "GP No.",
        "Zone/Sector No.",
        "Zone/Sector Name",
        "Name",
        "Station",
        "Mobile No.",
        "Age",
        "From",
        "To",
        "Days present",
        { v: "Present or Not", bold: true },
      ].map((h) => (typeof h === "object" ? h : { v: h, bold: true })),
      ...GP_DATA.map((row, i) => {
        const rid = i + 1;
        const mine = byPerson.get(rid);
        return [
          i + 1,
          row[0] || "",
          row[1] || "",
          row[2] || "",
          row[3] || "",
          row[4] || "",
          row[5] || "",
          row[6] || "",
          row[7] || "",
          row[8] || "",
          mine ? mine.size : 0,
          presentToday.has(rid) ? "Present" : "Not present",
        ];
      }),
    ];

    const logRows = [
      ["Roll no (rid)", "GP No.", "Name", "Zone", "Date", "Marked at (server time)", "Marked by", "Source"].map((h) => ({
        v: h,
        bold: true,
      })),
      ...marks.map((m) => {
        const r = roster(m.rid);
        return [m.rid, r.gpNo, r.name, r.zoneName, String(m.marked_on).slice(0, 10), String(m.at || ""), m.by, m.source];
      }),
    ];

    const buf = buildXlsx([
      {
        name: "Attendance",
        columns: [6, 8, 10, 16, 34, 18, 20, 6, 9, 9, 9, 22].map((w) => ({ width: w })),
        rows: rosterRows,
      },
      {
        name: "Mark log",
        columns: [10, 8, 34, 16, 12, 22, 18, 12].map((w) => ({ width: w })),
        rows: logRows,
      },
    ]);

    const filename = `gp-attendance-${day}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GP attendance export error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
