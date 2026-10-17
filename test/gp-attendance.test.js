import test from "node:test";
import assert from "node:assert/strict";
import {
  GP_APP_TAG,
  djb2,
  normSearch,
  digitsOnly,
  todayISO,
  buildPayload,
  parsePayload,
  mergePayload,
  searchFields,
  matchRecord,
  effectiveUsers,
  canRole,
} from "../lib/gp-attendance.js";


const META = { ver: "list-2026-10-17", hash: djb2("x" + "y") };

test("djb2 is stable and 8 hex chars", () => {
  assert.equal(djb2("roster"), djb2("roster")); // deterministic
  assert.notEqual(djb2("roster"), djb2("roster2")); // distinct inputs differ
  assert.match(djb2("anything"), /^[0-9a-f]{8}$/);
});

test("normSearch / digitsOnly", () => {
  assert.equal(normSearch("  Sh. Gurnam Singh Ji "), "shgurnamsinghji");
  assert.equal(digitsOnly("9419163832\n9622147123"), "94191638329622147123");
});

test("todayISO is local civil day", () => {
  assert.match(todayISO(new Date(2026, 9, 17, 23, 59)), /^2026-10-17$/);
});

test("payload round-trip: build -> parse", () => {
  const text = buildPayload({ ver: META.ver, hash: META.hash, date: "2026-10-17", by: "recorder1", came: [78, 12, 45] });
  const res = parsePayload(text, META);
  assert.ok(res.ok);
  assert.deepEqual(res.data.came, [12, 45, 78]); // sorted
  assert.equal(res.data.d, "2026-10-17");
  assert.equal(res.data.by, "recorder1");
  assert.equal(JSON.parse(text).app, GP_APP_TAG);
});

test("payload rejected on version / checksum mismatch or bad json", () => {
  const bad = JSON.stringify({ app: GP_APP_TAG, v: "list-old", h: META.hash, d: "2026-10-17", came: [1] });
  assert.equal(parsePayload(bad, META).ok, false);
  const checksum = JSON.stringify({ app: GP_APP_TAG, v: META.ver, h: "deadbeef", d: "2026-10-17", came: [1] });
  assert.equal(parsePayload(checksum, META).ok, false);
  assert.equal(parsePayload("not json", META).ok, false);
  assert.equal(parsePayload('{"came":[]}', META).ok, false);
});

test("merge dedupes by rid+date and reports unknown rids", () => {
  const text = buildPayload({ ver: META.ver, hash: META.hash, date: "2026-10-17", by: "recorder1", came: [1, 2, 9999] });
  const { data } = parsePayload(text, META);
  const first = mergePayload({}, data, 601);
  assert.deepEqual(first.report.added, [1, 2]);
  assert.deepEqual(first.report.unknown, [9999]);
  assert.ok(first.marks[1]["2026-10-17"]);
  assert.ok(first.marks[2]["2026-10-17"]);
  // re-merge the same payload — nothing must be added twice
  const second = mergePayload(first.marks, data, 601);
  assert.deepEqual(second.report.added, []);
  assert.deepEqual(second.report.alreadyMarked.sort(), [1, 2]);
});

test("same rid different day is a separate mark", () => {
  const a = { d: "2026-10-17", came: [5] };
  const b = { d: "2026-10-18", came: [5] };
  const r1 = mergePayload({}, a, 601);
  const r2 = mergePayload(r1.marks, b, 601);
  assert.ok(r2.marks[5]["2026-10-17"]);
  assert.ok(r2.marks[5]["2026-10-18"]);
});

test("search: phone substring + name tokens + zone filter fields", () => {
  const rec = {
    name: "Sh. Gurnam Singh Ji",
    gpNo: "874",
    zoneNo: "02",
    zoneName: "Chandigarh",
    station: "Samgauli",
    phones: "9463586688",
  };
  const f = searchFields(rec);
  assert.ok(matchRecord(f, "gurnam", "gurnam"));
  assert.ok(matchRecord(f, "3586688", "3586688")); // last digits
  assert.ok(matchRecord(f, "874", "874")); // gp no digits
  assert.ok(matchRecord(f, "gurnam 88", "gurnam88"));
  // mixed token: name part matches, missing digit part fails
  assert.equal(matchRecord(f, "gurnam 9999", "gurnam9999"), false);
  // mixed token with correct digits passes
  assert.ok(matchRecord(f, "gurnam 3586688", "gurnam3586688"));
});

test("roles", () => {
  assert.ok(canRole("super_admin", "editor"));
  assert.ok(canRole("editor", "viewer"));
  assert.ok(!canRole("viewer", "editor"));
});

test("effectiveUsers merges local over baked", () => {
  const baked = [{ u: "admin", p: "h1", r: "super_admin" }, { u: "old", p: "h2", r: "viewer" }];
  const local = [{ u: "new", p: "h3", r: "editor" }, { u: "old", p: "h4", r: "editor" }];
  const eff = effectiveUsers(baked, local);
  assert.equal(eff.length, 3);
  const oldU = eff.find((u) => u.u === "old");
  assert.equal(oldU.p, "h4"); // local override wins
  assert.equal(oldU.r, "editor");
});

function nq(rec) {
  return normSearch(rec.name);
}
