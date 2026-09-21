// lib/duty-export.js
// Pure builder: turns a committed/draft list + its assignments into the three
// workbook views the legacy system produced. No DB or Excel imports here so it
// can be unit-tested in isolation; the API route feeds the result to buildXlsx.

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const TIME_LABEL = { M: "Morning", E: "Evening" };
const RATING_LABEL = { 1: "Tier 1 · Senior", 2: "Tier 2 · Mid", 3: "Tier 3 · Newer" };
const WEEK_ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];
const REASON_LABEL = {
  predefined_local: "Predefined local",
  scored: "Auto-assigned",
  manual_override: "Manual pick",
  manual_clear: "Cleared",
  huzoor_discourse: "Huzoor Discourse",
  unfilled: "Unfilled",
};

function ymd(d) {
  if (!d) return "";
  return typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
}

function dayShort(d) {
  const str = ymd(d);
  const [y, m, day] = str.split("-").map(Number);
  if (!y || !m || !day) return "";
  return DAY_SHORT[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
}

function timeText(a) {
  const t = TIME_LABEL[a.satsang_time_type] || (a.payload && TIME_LABEL[a.payload.timeType]) || "";
  const slot = a.satsang_time_slot || (a.payload && a.payload.timeSlot) || "";
  return slot ? `${t} · ${slot}`.trim() : t;
}

function satsangName(a) {
  return a.satsang_name || (a.payload && a.payload.satsangName) || "—";
}

function pracharakName(a) {
  return a.pracharak_name || (a.payload && a.payload.pracharakName) || "";
}

function ratingOf(a) {
  const r = a.satsang_rating ?? (a.payload && a.payload.satsangRating) ?? 2;
  return RATING_LABEL[r] || String(r);
}

export function monthLabel(m, y) {
  return `${MONTHS[(Number(m) || 1) - 1] || ""} ${y}`.trim();
}

// Returns [{ name, columns, rows }] ready for buildXlsx.
export function buildDutySheets({ list, assignments }) {
  const rows = Array.isArray(assignments) ? assignments.slice() : [];
  const stats = (list && list.payload && list.payload.stats) || {};
  const perStored = stats.perPracharak || {};

  const H = (v) => ({ v, bold: true });

  /* ---- Sheet 1: By Location ---- */
  const byLocation = rows.slice().sort((a, b) => {
    const s1 = satsangName(a).localeCompare(satsangName(b));
    if (s1 !== 0) return s1;
    return ymd(a.duty_date).localeCompare(ymd(b.duty_date));
  });
  const locSheet = {
    name: "By Location",
    columns: [{ width: 12 }, { width: 6 }, { width: 26 }, { width: 18 }, { width: 16 }, { width: 15 }, { width: 22 }, { width: 16 }, { width: 15 }],
    rows: [
      [H("Date"), H("Day"), H("Satsang"), H("Sector"), H("Time"), H("Rating"), H("Pracharak"), H("Contact"), H("Status")],
      ...byLocation.map((a) => [
        ymd(a.duty_date),
        dayShort(a.duty_date),
        satsangName(a),
        a.sector_name || "—",
        timeText(a),
        ratingOf(a),
        a.pracharak_id ? pracharakName(a) : "— Unfilled —",
        a.pracharak_contact || "",
        REASON_LABEL[a.reason_code] || a.reason_code || "",
      ]),
    ],
  };

  /* ---- Sheet 2: By Pracharak ---- */
  const assigned = rows.filter((a) => a.pracharak_id);
  const byPracharak = assigned.slice().sort((a, b) => {
    const p1 = pracharakName(a).localeCompare(pracharakName(b));
    if (p1 !== 0) return p1;
    return ymd(a.duty_date).localeCompare(ymd(b.duty_date));
  });
  const pracSheet = {
    name: "By Pracharak",
    columns: [{ width: 22 }, { width: 16 }, { width: 12 }, { width: 6 }, { width: 26 }, { width: 18 }, { width: 16 }, { width: 15 }],
    rows: [
      [H("Pracharak"), H("Contact"), H("Date"), H("Day"), H("Satsang"), H("Sector"), H("Time"), H("Rating")],
      ...byPracharak.map((a) => [
        pracharakName(a),
        a.pracharak_contact || "",
        ymd(a.duty_date),
        dayShort(a.duty_date),
        satsangName(a),
        a.sector_name || "—",
        timeText(a),
        ratingOf(a),
      ]),
    ],
  };

  /* ---- Sheet 3: Summary & Analysis ---- */
  const total = rows.length;
  const filled = assigned.length;
  const unfilled = rows.filter((a) => !a.pracharak_id);
  const overrides = rows.filter((a) => a.overridden_by_user).length;
  const fillRate = total ? Math.round((filled / total) * 100) : 0;
  const ruleHits = stats.ruleHits || {};

  // live per-pracharak counts merged with stored targets
  const counts = {};
  for (const a of assigned) {
    if (!counts[a.pracharak_id]) {
      counts[a.pracharak_id] = { name: pracharakName(a) || (perStored[a.pracharak_id] && perStored[a.pracharak_id].name) || "Pracharak", assigned: 0 };
    }
    counts[a.pracharak_id].assigned += 1;
  }
  const workload = Object.keys(counts).map((id) => {
    const target = perStored[id] ? perStored[id].target : null;
    const util = target > 0 ? Math.round((counts[id].assigned / target) * 100) : null;
    return { name: counts[id].name, assigned: counts[id].assigned, target, util };
  });
  workload.sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name));

  const summaryRows = [
    [H("Duty List Summary")],
    ["Month", monthLabel(list.month, list.year)],
    ["Version", { v: list.version, num: true }],
    ["Status", list.status || ""],
    ["Comparison", list.comparison_month ? monthLabel(list.comparison_month, list.comparison_year) : "—"],
    ["Generated", (list.payload && (list.payload.generatedAt || list.payload.regeneratedAt)) || ""],
    [],
    [H("Coverage")],
    ["Total slots", { v: total, num: true }],
    ["Filled", { v: filled, num: true }],
    ["Unfilled", { v: unfilled.length, num: true }],
    ["Fill rate %", { v: fillRate, num: true }],
    ["Manual edits", { v: overrides, num: true }],
    [],
    [H("Rule blocks at generation")],
    ["Rating", { v: ruleHits.rating || 0, num: true }],
    ["Minimum gap", { v: ruleHits.gap || 0, num: true }],
    ["Branch cooldown", { v: ruleHits.cooldown || 0, num: true }],
    ["Preference", { v: ruleHits.preference || 0, num: true }],
    ["At monthly target", { v: ruleHits.target || 0, num: true }],
    [],
    [H("Pracharak utilization")],
    [H("Pracharak"), H("Assigned"), H("Target"), H("Utilization %")],
    ...workload.map((w) => [w.name, { v: w.assigned, num: true }, w.target == null ? "—" : { v: w.target, num: true }, w.util == null ? "—" : { v: w.util, num: true }]),
  ];

  if (unfilled.length) {
    summaryRows.push([], [H("Unfilled slots")], [H("Date"), H("Day"), H("Satsang"), H("Sector"), H("Time"), H("Rating")]);
    const unfilledSorted = unfilled.slice().sort((a, b) => ymd(a.duty_date).localeCompare(ymd(b.duty_date)) || satsangName(a).localeCompare(satsangName(b)));
    for (const a of unfilledSorted) {
      summaryRows.push([ymd(a.duty_date), dayShort(a.duty_date), satsangName(a), a.sector_name || "—", timeText(a), ratingOf(a)]);
    }
  }

  const summarySheet = {
    name: "Summary",
    columns: [{ width: 22 }, { width: 14 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 15 }],
    rows: summaryRows,
  };

  return [locSheet, pracSheet, summarySheet];
}

// Build a branch-wise schedule sheet: one row per branch, columns for each Sunday/Saturday.
export function buildBranchSchedule({ list, assignments, branches = [] }) {
  const rows = Array.isArray(assignments) ? assignments.slice() : [];
  const month = (list && list.month) || new Date().getMonth() + 1;
  const year = (list && list.year) || new Date().getFullYear();
  const H = (v) => ({ v, bold: true });

  const branchMap = new Map();
  for (const b of branches) {
    branchMap.set(b.id, b);
    if (b.sectorId) branchMap.set(`sector:${b.sectorId}`, b);
  }

  // Group assignments by branch
  const byBranch = new Map();
  for (const row of rows) {
    const branch = branchMap.get(row.satsang_id) || branchMap.get(`sector:${row.sector_id}`);
    const branchKey = branch ? branch.name : (row.satsang_name || row.satsang_id || "Unknown");
    if (!byBranch.has(branchKey)) byBranch.set(branchKey, []);
    byBranch.get(branchKey).push(row);
  }

  // dayOfWeek 0 = Sunday, 6 = Saturday
  const headerRow = [H("Branch / Satsang"), H("Sundays Assigned"), H("Saturdays Assigned"), H("Pracharaks Used")];
  const headerCols = [{ width: 24 }, { width: 28 }, { width: 28 }, { width: 28 }];
  const dataRows = [];

  for (const [branchKey, branchAssignments] of byBranch) {
    const sundays = branchAssignments.filter((a) => {
      const dow = a.dayOfWeek ?? (a.payload && a.payload.dayOfWeek);
      return dow === 0 || dow === "0";
    }).sort((a, b) => (a.weekOfMonth || 0) - (b.weekOfMonth || 0));
    const saturdays = branchAssignments.filter((a) => {
      const dow = a.dayOfWeek ?? (a.payload && a.payload.dayOfWeek);
      return dow === 6 || dow === "6";
    }).sort((a, b) => (a.weekOfMonth || 0) - (b.weekOfMonth || 0));
    const pracharaks = [...new Set(branchAssignments.map((a) => a.pracharak_name || (a.payload && a.payload.pracharakName)).filter(Boolean))];

    dataRows.push([
      branchKey,
      sundays.map((s) => `${WEEK_ORDINAL[s.weekOfMonth] || s.weekOfMonth} Sunday: ${s.pracharak_name || (s.payload && s.payload.pracharakName) || "—"}`).join(", ") || "None",
      saturdays.map((s) => `${WEEK_ORDINAL[s.weekOfMonth] || s.weekOfMonth} Saturday: ${s.pracharak_name || (s.payload && s.payload.pracharakName) || "—"}`).join(", ") || "None",
      pracharaks.length > 0 ? pracharaks.join(", ") : "None",
    ]);
  }

  if (dataRows.length === 0) {
    dataRows.push(["No assignments", "", "", ""]);
  }

  return {
    name: "Branch Schedule",
    columns: headerCols,
    rows: [headerRow, ...dataRows],
  };
}
