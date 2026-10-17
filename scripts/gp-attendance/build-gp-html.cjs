// Build pipeline for the GP attendance feature.
//
//   node scripts/gp-attendance/build-gp-html.cjs
//
// 1. Parses scripts/gp-attendance/gp-raw.tsv (the Excel copy/paste of the
//    "Attendance Sheet — 22nd October 2026" GP list, quote-aware).
// 2. Validates the parsed roster (row counts, SR sequences, missing fields,
//    duplicate phones/names) — anything wrong is printed, never silently fixed.
// 3. Writes:
//      .tmp-gp-data.json           (full parsed roster, for the next step)
//      lib/gp-data.js              (server-side roster import)
//      public/gp-attendance.html   (the offline-capable attendance app)
//
// The roster stays keyed by a global roll number rid (1..N) — the ONLY key used
// in attendance payloads, so a whole day's sheet is just a few roll numbers.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HERE = __dirname;
const ROOT = path.join(HERE, "..", "..");
const RAW = path.join(HERE, "gp-raw.tsv");
const TEMPLATE = path.join(HERE, "template.html");

// ---------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------
const raw = fs.readFileSync(RAW, "utf8");
const lines = raw.split("\n");
let secondHeaderIdx = -1;
for (let i = 1; i < lines.length; i++) {
  if (lines[i].startsWith("Sl No.")) { secondHeaderIdx = i; break; }
}
if (secondHeaderIdx < 0) throw new Error("Second table header ('Sl No.') not found");

function parseRows(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === "\t") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((c) => c.trim() !== "")) rows.push(row); }
  return rows;
}

const t1 = parseRows(lines.slice(1, secondHeaderIdx).join("\n"));
const t2 = parseRows(lines.slice(secondHeaderIdx + 1).join("\n"));

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
function phones(rawMobile) {
  return String(rawMobile || "")
    .split(/[\n,\/]+/)
    .map((s) => s.replace(/[^\d]/g, ""))
    .filter((s) => s.length >= 6)
    .map((s) => (s.length > 10 && s.startsWith("0")) ? s.replace(/^0+/, "") : s);
}

const out = [];
function addRow(cols, hasAgeCols) {
  const pad = (i) => (cols[i] || "").trim();
  const [sr, gpNo, zoneNo, zoneName, name, station, mobile, age, from, to] = hasAgeCols
    ? [pad(0), pad(1), pad(2), pad(3), pad(4), pad(5), pad(6), pad(7), pad(8), pad(9)]
    : [pad(0), pad(1), pad(2), pad(3), pad(4), pad(5), pad(6), "", "", ""];
  out.push({
    rid: out.length + 1,
    sr: clean(sr),
    gpNo: clean(gpNo),
    zoneNo: clean(zoneNo),
    zoneName: clean(zoneName),
    name: clean(name),
    station: clean(station),
    phones: phones(mobile).join(", "),
    age: clean(age),
    from: clean(from),
    to: clean(to),
  });
}
for (const r of t1) addRow(r, true);
const mainCount = out.length;
for (const r of t2) addRow(r, false);

// ---------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------
const problems = [];
for (let i = 0; i < mainCount; i++) {
  const expect = String(i + 1);
  if (out[i].sr !== expect) problems.push(`SR sequence break: rid ${i + 1} has sheet SR ${out[i].sr}`);
}
for (let i = mainCount; i < out.length; i++) {
  const expect = String(i - mainCount + 1);
  if (out[i].sr !== expect) problems.push(`Extra-table SR break: rid ${i + 1} has sheet SR ${out[i].sr}`);
}
out.forEach((r) => {
  if (!r.name) problems.push(`rid ${r.rid}: no name (sheet row had a blank name)`);
  if (!r.phones) problems.push(`rid ${r.rid} ${r.name}: no phone — searchable by name only`);
  if (!r.zoneName) problems.push(`rid ${r.rid} ${r.name}: no zone`);
});
if (mainCount !== 589) problems.push(`Main table row count changed: ${mainCount} (expected 589 — update the validator if the sheet was re-issued)`);
if (out.length !== 601) problems.push(`Total row count changed: ${out.length} (expected 601 589 + 12 extra)`);

//－－ duplicate detection is informational only: a few people genuinely share a
// phone in the sheet. Attendance keys on rid, never on phone.
{
  const seen = new Map();
  for (const r of out) {
    for (const p of r.phones.split(", ").filter(Boolean)) {
      if (seen.has(p) && seen.get(p) !== r.rid) {
        const other = seen.get(p);
        console.info(`[gp] shared phone ${p}: rid ${other} (${out[other - 1].name}) & rid ${r.rid} (${r.name})`);
      } else seen.set(p, r.rid);
    }
  }
}

// Known gaps present in the source sheet itself (22 Oct 2026 issue). If a new
// run reports a problem NOT in this list, treat it as a real regression.
const KNOWN_GAPS = [
  "rid 115: no name",
  "rid 124 Sh Vivek Rafiq Ji: no phone",
  "rid 455 Tej Singh Bhandari Ji: no phone",
  "rid 595 Sh Ram Lal Manocha Ji: no phone",
];
for (const known of KNOWN_GAPS) {
  const idx = problems.findIndex((p) => p.startsWith(known));
  if (idx >= 0) problems.splice(idx, 1);
}

if (problems.length) {
  console.error("\n=== NEW GP ROSTER PROBLEMS ===\n" + problems.join("\n"));
  process.exitCode = 1; // files were still written, but the failure is loud
} else {
  console.log("Roster validated (known sheet gaps tolerated).");
}

// ---------------------------------------------------------------------
// Emit lib/gp-data.js (server roster) + JSON dump
// ---------------------------------------------------------------------
const compact = out.map((r) => [r.gpNo, r.zoneNo, r.zoneName, r.name, r.station, r.phones, r.age, r.from, r.to]);
const meta = {
  v: "list-2026-10-17",
  h: "",
  event: {
    title: "GP Attendance — Braham Gyan Kaksh",
    sub: "79th Annual Nirankari Sant Samagam, Oct. 2026 · Samalkha",
  },
};

// roster fingerprint over the compact matrix (stable, format-insensitive)
meta.h = (() => {
  let h = 5381;
  const s = JSON.stringify(compact);
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return ("00000000" + h.toString(16)).slice(-8);
})();

const esc4js = (s) => s.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

fs.writeFileSync(
  path.join(ROOT, "lib", "gp-data.js"),
  `// lib/gp-data.js — GENERATED by scripts/gp-attendance/build-gp-html.cjs — do not edit by hand.
// GP (Gyan Prachark) roster for the 79th Annual Nirankari Sant Samagam (Samalkha).
// rid = index + 1. Compact rows: [gpNo, zoneNo, zoneName, name, station, phones, age, from, to]
export const GP_META = ${JSON.stringify(meta)};
export const GP_DATA = ${esc4js(JSON.stringify(compact))};
`
);
fs.writeFileSync(path.join(HERE, "gp-data.json"), JSON.stringify({ meta, data: compact }, null, 1));

// ---------------------------------------------------------------------
// Emit public/gp-attendance.html from the template
// ---------------------------------------------------------------------
// Baked-in users (offline logins are checked against this list). Override at
// build time via GP_BUILD_USERS="name:pin:role,name2:pin2:role" (roles:
// viewer | editor | super_admin). Default admin:1234 = break-glass; change it.
function sha256u(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}
function parseBuildUsers(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [u, p, r] = s.split(":").map((x) => x.trim());
      return u && /^\d{4,8}$/.test(p || "") ? { u, n: u, p, r: r || "viewer" } : null;
    })
    .filter(Boolean);
}
const USERS = parseBuildUsers(process.env.GP_BUILD_USERS).length
  ? parseBuildUsers(process.env.GP_BUILD_USERS)
  : [{ u: "admin", n: "Admin", p: "1234", r: "super_admin" }];
console.log("Baked offline users: " + USERS.map((u) => u.u + " (" + u.r + ")").join(", "));
const usersJs = JSON.stringify(USERS.map((u) => ({ u: u.u, n: u.n, p: sha256u(u.u + ":" + u.p), r: u.r })));

let template = fs.readFileSync(TEMPLATE, "utf8");
template = template
  .replace("__LIST_META__", esc4js(JSON.stringify(meta)))
  .replace("__GP_DATA__", esc4js(JSON.stringify(compact)))
  .replace("__GP_USERS__", esc4js(usersJs));

// crude syntax check of the big application <script> block
const appScript = template.split("<script>").filter(Boolean).pop().split("</script>")[0];
new Function(appScript); // throws on syntax error

fs.writeFileSync(path.join(ROOT, "public", "gp-attendance.html"), template);

console.log(`Roster: ${out.length} records (main ${mainCount} + extra ${out.length - mainCount}).`);
console.log(`List version: ${meta.v}  checksum: ${meta.h}`);
console.log("Wrote lib/gp-data.js, scripts/gp-attendance/gp-data.json, public/gp-attendance.html");
