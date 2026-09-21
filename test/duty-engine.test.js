// test/duty-engine.test.js
// Run with:  node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateDutyList,
  occurrencesInMonth,
  isRatingEligible,
  passesGap,
  passesHardPreferences,
  preferenceScore,
  monthMinus,
  dateToDayNum,
} from "../lib/duty-engine.js";

// ---------- date / occurrence helpers ----------
test("occurrencesInMonth returns only the requested weekday, spaced 7 days", () => {
  for (let dow = 0; dow < 7; dow += 1) {
    const occ = occurrencesInMonth(2026, 1, dow);
    assert.ok(occ.length === 4 || occ.length === 5, `expected 4-5 occurrences, got ${occ.length}`);
    for (const o of occ) {
      const [y, m, d] = o.date.split("-").map(Number);
      assert.equal(new Date(Date.UTC(y, m - 1, d)).getUTCDay(), dow);
    }
    for (let i = 1; i < occ.length; i += 1) {
      assert.equal(dateToDayNum(occ[i].date) - dateToDayNum(occ[i - 1].date), 7);
    }
    // week-of-month is the occurrence index
    occ.forEach((o, i) => assert.equal(o.weekOfMonth, i + 1));
  }
});

test("monthMinus wraps across year boundary", () => {
  assert.deepEqual(monthMinus(2026, 1, 3), [2025, 10]);
  assert.deepEqual(monthMinus(2026, 5, 2), [2026, 3]);
  assert.deepEqual(monthMinus(2026, 2, 14), [2024, 12]);
});

// ---------- rule primitives ----------
test("isRatingEligible: tier-3 pracharak cannot lead a tier-1 satsang", () => {
  const m = { 1: { 1: true, 2: true, 3: true }, 2: { 1: true, 2: true, 3: true }, 3: { 1: false, 2: true, 3: true } };
  assert.equal(isRatingEligible(3, 1, m), false);
  assert.equal(isRatingEligible(3, 2, m), true);
  assert.equal(isRatingEligible(1, 1, m), true);
  assert.equal(isRatingEligible(2, 1, m), true);
});

test("passesGap enforces one-per-day and minimum gap", () => {
  const assigned = [dateToDayNum("2026-01-10")];
  assert.equal(passesGap("2026-01-10", assigned, 5), false); // same day
  assert.equal(passesGap("2026-01-13", assigned, 5), false); // 3-day gap
  assert.equal(passesGap("2026-01-15", assigned, 5), true); // 5-day gap ok
  assert.equal(passesGap("2026-01-20", assigned, 5), true);
});

test("passesHardPreferences: empty sets = unconstrained; area is hard; AW-AD relaxes day only", () => {
  const mode = { area: "hard", day: "hard", week: "hard", time: "soft" };
  const slot = { sectorId: "S1", dayOfWeek: 0, weekOfMonth: 2, timeType: "M" };
  assert.equal(passesHardPreferences(slot, [], mode, false), true);
  // area mismatch → blocked
  assert.equal(passesHardPreferences(slot, [{ sectorIds: ["S2"], days: [], weeks: [], times: [] }], mode, false), false);
  // day mismatch → blocked (day hard)
  assert.equal(passesHardPreferences(slot, [{ sectorIds: [], days: [1], weeks: [], times: [] }], mode, false), false);
  // day mismatch but AW-AD relaxes day → allowed
  assert.equal(passesHardPreferences(slot, [{ sectorIds: [], days: [1], weeks: [], times: [] }], mode, true), true);
  // AW-AD does NOT relax area
  assert.equal(passesHardPreferences(slot, [{ sectorIds: ["S2"], days: [], weeks: [], times: [] }], mode, true), false);
  // matching set → allowed
  assert.equal(passesHardPreferences(slot, [{ sectorIds: ["S1"], days: [0], weeks: [2], times: [] }], mode, false), true);
});

test("preferenceScore rewards explicit matches", () => {
  const slot = { sectorId: "S1", dayOfWeek: 0, weekOfMonth: 1, timeType: "M" };
  assert.equal(preferenceScore(slot, [], false), 0.4); // unconstrained
  const full = preferenceScore(slot, [{ sectorIds: ["S1"], days: [0], weeks: [1], times: ["M"] }], false);
  assert.equal(full, 1);
  const half = preferenceScore(slot, [{ sectorIds: ["S1"], days: [3], weeks: [], times: [] }], false);
  assert.equal(half, 0.5); // 1 of 2 explicit dims match
});

// ---------- engine integration ----------
function baseConfig(overrides = {}) {
  return {
    minGapDays: 5,
    branchCooldownMonths: 3,
    ratingMatrix: { 1: { 1: true, 2: true, 3: true }, 2: { 1: true, 2: true, 3: true }, 3: { 1: false, 2: true, 3: true } },
    dimensionMode: { area: "hard", day: "hard", week: "hard", time: "soft" },
    sewaCountStrict: false,
    rotationWeight: 1,
    scoringWeights: { preference: 3, locality: 2, rotation: 1, utilization: 2 },
    ...overrides,
  };
}

test("rating rule leaves a tier-1 satsang unfilled when only tier-3 pracharaks exist", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "Alpha", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 1, isActive: true }],
    pracharaks: [
      { id: "p1", name: "P1", sectorId: "S1", rating: 3, monthlyTarget: 5, isActive: true },
      { id: "p2", name: "P2", sectorId: "S1", rating: 3, monthlyTarget: 5, isActive: true },
    ],
    preferencesByPracharak: {}, history: [], config: baseConfig(), seed: 1,
  });
  assert.equal(res.stats.filled, 0);
  assert.ok(res.stats.unfilled >= 3);
  assert.ok(res.stats.ruleHits.rating > 0);
});

test("min-gap rule: adjacent-day satsang goes unfilled with a single pracharak", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [
      { id: "mon", name: "Monday Satsang", sectorId: "S1", dayOfWeek: 1, timeType: "M", rating: 2, isActive: true },
      { id: "tue", name: "Tuesday Satsang", sectorId: "S1", dayOfWeek: 2, timeType: "M", rating: 2, isActive: true },
    ],
    pracharaks: [{ id: "p1", name: "P1", sectorId: "S1", rating: 2, monthlyTarget: 99, isActive: true }],
    // Disable the branch cooldown so the min-gap rule is what's under test
    // (otherwise repeating the same satsang would be blocked by cooldown first).
    preferencesByPracharak: {}, history: [], config: baseConfig({ cooldownScope: "none" }), seed: 1,
  });
  const mondays = res.assignments.filter((a) => a.satsangId === "mon");
  const tuesdays = res.assignments.filter((a) => a.satsangId === "tue");
  assert.ok(mondays.every((a) => a.pracharakId === "p1"), "all Mondays filled by p1");
  assert.ok(tuesdays.every((a) => a.pracharakId === null), "all Tuesdays unfilled (within 1 day of a Monday)");
  assert.ok(res.stats.ruleHits.gap > 0);
});

test("sector-scoped cooldown: recent history on a sector blocks re-assignment", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "Alpha", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
    pracharaks: [{ id: "p1", name: "P1", sectorId: "S1", rating: 2, monthlyTarget: 5, isActive: true }],
    preferencesByPracharak: {},
    // p1 served a DIFFERENT satsang ("old") in the same sector S1 last month.
    history: [{ pracharakId: "p1", satsangId: "old", sectorId: "S1", date: "2025-12-07" }],
    config: baseConfig({ cooldownScope: "sector" }), seed: 1,
  });
  assert.equal(res.stats.filled, 0);
  assert.ok(res.stats.ruleHits.cooldown > 0);
});

test("satsang-scoped cooldown (default): same satsang in history blocks, different one does not", () => {
  // Default scope: serving the SAME satsang recently blocks a repeat.
  const blocked = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "Alpha", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
    pracharaks: [{ id: "p1", name: "P1", sectorId: "S1", rating: 2, monthlyTarget: 5, isActive: true }],
    preferencesByPracharak: {},
    history: [{ pracharakId: "p1", satsangId: "sat1", sectorId: "S1", date: "2025-12-07" }],
    config: baseConfig(), seed: 1,
  });
  assert.equal(blocked.stats.filled, 0);
  assert.ok(blocked.stats.ruleHits.cooldown > 0);

  // A different satsang in the same sector does NOT block under satsang scope.
  const allowed = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "Alpha", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
    pracharaks: [{ id: "p1", name: "P1", sectorId: "S1", rating: 2, monthlyTarget: 5, isActive: true }],
    preferencesByPracharak: {},
    history: [{ pracharakId: "p1", satsangId: "other", sectorId: "S1", date: "2025-12-07" }],
    config: baseConfig(), seed: 1,
  });
  assert.ok(allowed.stats.filled > 0, "different satsang in same sector should not block");
});

test("branch cooldown expires outside the window", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "Alpha", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
    pracharaks: [{ id: "p1", name: "P1", sectorId: "S1", rating: 2, monthlyTarget: 5, isActive: true }],
    preferencesByPracharak: {},
    // 5 months before Jan 2026 is Aug 2025 — outside a 3-month window.
    history: [{ pracharakId: "p1", satsangId: "sat1", sectorId: "S1", date: "2025-08-07" }],
    config: baseConfig({ cooldownScope: "sector" }), seed: 1,
  });
  assert.ok(res.stats.filled > 0, "old history should not block");
});

test("hard area preference excludes non-matching pracharaks", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "Alpha", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
    pracharaks: [{ id: "p1", name: "P1", sectorId: "S2", rating: 2, monthlyTarget: 5, isActive: true }],
    preferencesByPracharak: { p1: [{ sectorIds: ["S2"], days: [], weeks: [], times: [], isActive: true }] },
    history: [], config: baseConfig(), seed: 1,
  });
  assert.equal(res.stats.filled, 0);
  assert.ok(res.stats.ruleHits.preference > 0);
});

test("predefined local coverage bypasses the rating rule", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "Alpha", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 1, isActive: true, predefinedLocalPracharakId: "p1" }],
    pracharaks: [{ id: "p1", name: "Local P1", sectorId: "S1", rating: 3, monthlyTarget: 5, isActive: true }],
    preferencesByPracharak: {}, history: [], config: baseConfig(), seed: 1,
  });
  assert.ok(res.stats.filled >= 1);
  const local = res.assignments.find((a) => a.pracharakId === "p1");
  assert.equal(local.isLocal, true);
  assert.equal(local.localKind, "predefined");
  assert.equal(local.reasonCode, "predefined_local");
});

test("strict monthly target caps a pracharak's assignments", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    // Sundays are 7 days apart (clears the 5-day gap) and cooldown is disabled,
    // so the ONLY thing that can stop a repeat assignment is the strict target.
    satsangs: [{ id: "sat1", name: "Alpha", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
    pracharaks: [{ id: "p1", name: "P1", sectorId: "S1", rating: 2, monthlyTarget: 1, isActive: true }],
    preferencesByPracharak: {}, history: [],
    config: baseConfig({ sewaCountStrict: true, cooldownScope: "none" }), seed: 1,
  });
  const filledByP1 = res.assignments.filter((a) => a.pracharakId === "p1").length;
  assert.equal(filledByP1, 1);
  assert.ok(res.stats.ruleHits.target > 0);
});

test("determinism: same seed and inputs produce identical output", () => {
  const input = {
    year: 2026, month: 3,
    satsangs: Array.from({ length: 6 }, (_, i) => ({
      id: `sat${i}`, name: `Satsang ${i}`, sectorId: `S${i % 3}`,
      dayOfWeek: i % 7, timeType: i % 2 ? "E" : "M", rating: (i % 3) + 1, isActive: true,
    })),
    pracharaks: Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`, name: `P${i}`, sectorId: `S${i % 3}`, rating: (i % 3) + 1,
      monthlyTarget: 2 + (i % 2), isActive: true, awAd: i % 5 === 0,
    })),
    preferencesByPracharak: {}, history: [], config: baseConfig(), seed: 12345,
  };
  const a = generateDutyList(structuredClone(input));
  const b = generateDutyList(structuredClone(input));
  assert.deepEqual(a, b);
  // a different seed may reorder tie-broken picks but must keep the fill rate stable
  const c = generateDutyList({ ...structuredClone(input), seed: 999 });
  assert.equal(a.stats.totalSlots, c.stats.totalSlots);
});

test("same-sector pracharak is preferred (locality) over an equal out-of-sector one", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "Alpha", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
    pracharaks: [
      { id: "local", name: "Local", sectorId: "S1", rating: 2, monthlyTarget: 3, isActive: true },
      { id: "far", name: "Far", sectorId: "S9", rating: 2, monthlyTarget: 3, isActive: true },
    ],
    preferencesByPracharak: {}, history: [], config: baseConfig(), seed: 7,
  });
  const first = res.assignments.find((a) => a.pracharakId);
  assert.equal(first.pracharakId, "local");
});

test("specialization matching: pracharak without matching spec is excluded when branch requires one", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "Hindi Branch", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
    pracharaks: [
      { id: "p-hindi", name: "Hindi Expert", sectorId: "S1", rating: 2, monthlyTarget: 3, isActive: true, specializations: ["hindi"] },
      { id: "p-punjabi", name: "Punjabi Only", sectorId: "S1", rating: 2, monthlyTarget: 3, isActive: true, specializations: ["punjabi"] },
    ],
    branches: [{ id: "b1", sectorId: "S1", requiredSpecializations: ["hindi"] }],
    preferencesByPracharak: {}, history: [], config: baseConfig(), seed: 42,
  });
  const filled = res.assignments.filter((a) => a.pracharakId);
  assert.ok(filled.length > 0, "should have at least one filled slot");
  assert.equal(filled[0].pracharakId, "p-hindi", "only the hindi pracharak should be assigned");
});

test("specialization matching: pracharak with no specialization is excluded when branch requires one", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "Punjabi Branch", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
    pracharaks: [
      { id: "p-general", name: "General", sectorId: "S1", rating: 2, monthlyTarget: 3, isActive: true },
      { id: "p-punjabi", name: "Punjabi", sectorId: "S1", rating: 2, monthlyTarget: 3, isActive: true, specializations: ["punjabi"] },
    ],
    branches: [{ id: "b1", sectorId: "S1", requiredSpecializations: ["punjabi"] }],
    preferencesByPracharak: {}, history: [], config: baseConfig(), seed: 42,
  });
  const filled = res.assignments.filter((a) => a.pracharakId);
  assert.ok(filled.length > 0, "should have at least one filled slot");
  assert.equal(filled[0].pracharakId, "p-punjabi", "only the punjabi pracharak should be assigned");
});

test("specialization matching: branch with no required specializations allows all pracharaks", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "General Branch", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
    pracharaks: [
      { id: "p1", name: "P1", sectorId: "S1", rating: 2, monthlyTarget: 3, isActive: true, specializations: ["hindi"] },
      { id: "p2", name: "P2", sectorId: "S1", rating: 2, monthlyTarget: 3, isActive: true, specializations: ["punjabi"] },
    ],
    branches: [],
    preferencesByPracharak: {}, history: [], config: baseConfig(), seed: 42,
  });
  const filled = res.assignments.filter((a) => a.pracharakId);
  assert.ok(filled.length > 0, "should have at least one filled slot");
});

test("preferenceScore gives bonus for matching preferred dimensions", () => {
  const slot = { sectorId: "S1", dayOfWeek: 0, weekOfMonth: 2, timeType: "M" };
  // area and day are explicit: area matches but day does not. Base = 1/2 = 0.5
  const setsAvail = [{ sectorIds: ["S1"], days: [1], weeks: [], times: [] }];
  // Same, but preferredDays matches slot.dayOfWeek=0 → gives a 0.2 bonus
  const setsPref = [{ sectorIds: ["S1"], days: [1], weeks: [], times: [], preferredDays: [0] }];
  const scoreAvail = preferenceScore(slot, setsAvail, false);
  const scorePref = preferenceScore(slot, setsPref, false);
  assert.ok(scorePref > scoreAvail, `preferred (${scorePref}) should score higher than available-only (${scoreAvail})`);
});

test("preferenceScore: soft preferences that don't match don't reduce base score", () => {
  const slot = { sectorId: "S1", dayOfWeek: 0, weekOfMonth: 2, timeType: "M" };
  const setsMatch = [{ sectorIds: ["S1"], days: [0], weeks: [2], times: ["M"], preferredDays: [0], preferredWeeks: [2] }];
  const setsNoMatch = [{ sectorIds: ["S1"], days: [0], weeks: [2], times: ["M"], preferredDays: [6], preferredWeeks: [5] }];
  const scoreMatch = preferenceScore(slot, setsMatch, false);
  const scoreNoMatch = preferenceScore(slot, setsNoMatch, false);
  assert.ok(scoreMatch >= scoreNoMatch, "matching preferred should score >= non-matching");
  assert.ok(scoreNoMatch >= 0.5, "base score should still be at least 0.5");
});

test("generateDutyList accepts branches parameter without errors", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "Test", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
    pracharaks: [{ id: "p1", name: "P1", sectorId: "S1", rating: 2, monthlyTarget: 3, isActive: true }],
    branches: [{ id: "b1", sectorId: "S1", requiredSpecializations: [] }],
    preferencesByPracharak: {}, history: [], config: baseConfig(), seed: 1,
  });
  assert.ok(res.stats.totalSlots > 0, "should produce assignments");
  assert.ok(Array.isArray(res.assignments));
});

test("first Sunday of every month is Huzoor Discourse — no pracharak assigned", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [{ id: "sat1", name: "Alpha", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
    pracharaks: [{ id: "p1", name: "P1", sectorId: "S1", rating: 2, monthlyTarget: 5, isActive: true }],
    preferencesByPracharak: {}, history: [], config: baseConfig(), seed: 1,
  });
  const firstSun = res.assignments.find((a) => a.reasonCode === "huzoor_discourse");
  assert.ok(firstSun, "first Sunday should be marked as huzoor_discourse");
  assert.equal(firstSun.pracharakId, null);
  assert.equal(firstSun.weekOfMonth, 1);
  assert.equal(firstSun.dayOfWeek, 0);
  assert.ok(firstSun.explanation.includes("Huzoor Discourse"));
});

test("date-specific satsang: only appears on that exact date", () => {
  const res = generateDutyList({
    year: 2026, month: 1,
    satsangs: [
      { id: "sat1", name: "Weekly Alpha", sectorId: "S1", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true },
      { id: "sat2", name: "One-off Special", sectorId: "S1", dayOfWeek: 0, date: "2026-01-18", timeType: "E", rating: 2, isActive: true },
    ],
    pracharaks: [
      { id: "p1", name: "P1", sectorId: "S1", rating: 2, monthlyTarget: 5, isActive: true },
      { id: "p2", name: "P2", sectorId: "S1", rating: 2, monthlyTarget: 5, isActive: true },
    ],
    preferencesByPracharak: {}, history: [], config: baseConfig({ cooldownScope: "none" }), seed: 1,
  });
  const special = res.assignments.filter((a) => a.satsangName === "One-off Special");
  assert.equal(special.length, 1, "one-off should appear exactly once");
  assert.equal(special[0].date, "2026-01-18");
});

test("date-specific satsang in a different month produces no slots", () => {
  const res = generateDutyList({
    year: 2026, month: 2,
    satsangs: [
      { id: "sat1", name: "One-off January", sectorId: "S1", dayOfWeek: 0, date: "2026-01-18", timeType: "E", rating: 2, isActive: true },
    ],
    pracharaks: [{ id: "p1", name: "P1", sectorId: "S1", rating: 2, monthlyTarget: 5, isActive: true }],
    preferencesByPracharak: {}, history: [], config: baseConfig(), seed: 1,
  });
  assert.equal(res.stats.totalSlots, 0, "date-specific satsang from another month should not generate slots");
});
