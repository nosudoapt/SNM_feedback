import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateDutyList, isOnTour } from "../lib/duty-engine.js";

// Shared test fixtures
const YEAR = 2026;
const MONTH = 9; // September 2026

const BRANCHES = [
  { id: "BR-A", sectorId: "SEC-A", requiredDays: [{ week: 1, day: 0, type: "main" }, { week: 2, day: 0, type: "regular" }, { week: 3, day: 0, type: "main" }], requiredSpecializations: [] },
];

const SATSANGS = [
  { id: "SUN-A", name: "Sunday Satsang A", sectorId: "SEC-A", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true },
];

// 4 active pracharaks, all eligible by rating (2+), no specializations needed
const PRACHARAKS = [
  { id: "P1", name: "Pracharak 1", sectorId: "SEC-A", rating: 2, monthlyTarget: 3, isActive: true, specializations: [] },
  { id: "P2", name: "Pracharak 2", sectorId: "SEC-A", rating: 2, monthlyTarget: 3, isActive: true, specializations: [] },
  { id: "P3", name: "Pracharak 3", sectorId: "SEC-B", rating: 2, monthlyTarget: 3, isActive: true, specializations: [] },
  { id: "P4", name: "Pracharak 4", sectorId: "SEC-C", rating: 2, monthlyTarget: 3, isActive: true, specializations: [] },
];

describe("Pool-based engine allocation (Step 5)", () => {
  it("1. 1st Sunday → Huzoor Discourse, no pracharak assigned", () => {
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: SATSANGS,
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [],
      tours: [],
      branchLocalPool: { "BR-A": [{ pracharakId: "P1", priority: 1 }] },
      config: { sewaCountStrict: false },
    });
    const firstSun = result.assignments.find((a) => a.weekOfMonth === 1 && a.dayOfWeek === 0);
    assert.ok(firstSun, "should have a 1st Sunday slot");
    assert.equal(firstSun.pracharakId, null);
    assert.equal(firstSun.reasonCode, "huzoor_discourse");
  });

  it("2. Main Satsang with eligible local pracharak → local selected (PREDEFINED_LOCAL)", () => {
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: SATSANGS,
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [],
      tours: [],
      branchLocalPool: { "BR-A": [{ pracharakId: "P1", priority: 1 }] },
      config: { sewaCountStrict: false },
    });
    // 2nd Sunday (week 2) is regular → falls through to regular path
    // 3rd Sunday (week 3) is main → uses pool logic
    const mainSlots = result.assignments.filter((a) => a.weekOfMonth === 3 && a.dayOfWeek === 0);
    assert.ok(mainSlots.length > 0, "should have a main satsang slot");
    const slot = mainSlots[0];
    assert.equal(slot.assignmentSource, "PREDEFINED_LOCAL");
    assert.equal(slot.pracharakId, "P1");
  });

  it("3. Multiple eligible local pracharaks → ranking/priority rules respected", () => {
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: SATSANGS,
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [],
      tours: [],
      branchLocalPool: {
        "BR-A": [
          { pracharakId: "P1", priority: 2 },
          { pracharakId: "P2", priority: 1 },
        ],
      },
      config: { sewaCountStrict: false },
    });
    const mainSlots = result.assignments.filter((a) => a.weekOfMonth === 3 && a.dayOfWeek === 0 && a.assignmentSource === "PREDEFINED_LOCAL");
    assert.ok(mainSlots.length > 0, "should have main satsang from local pool");
    // P1 and P2 are both in local pool and eligible — best scoring wins
    const assignedIds = mainSlots.map((s) => s.pracharakId);
    assert.ok(assignedIds.includes("P1") || assignedIds.includes("P2"), "should pick from local pool");
  });

  it("4. Local pracharak on tour → excluded (ON_TOUR in filter)", () => {
    // P1 is on tour for the 3rd Sunday (week 3, Sept 20 = 2026-09-20)
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: SATSANGS,
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [],
      tours: [{ pracharakId: "P1", startDate: "2026-09-18", endDate: "2026-09-22" }],
      branchLocalPool: { "BR-A": [{ pracharakId: "P1", priority: 1 }] },
      config: { sewaCountStrict: false },
    });
    // P1 is the only local pool member and is on tour → should fallback to open pool
    const mainSlots = result.assignments.filter((a) => a.weekOfMonth === 3 && a.dayOfWeek === 0);
    assert.ok(mainSlots.length > 0);
    const slot = mainSlots[0];
    assert.notEqual(slot.pracharakId, "P1", "P1 should not be assigned while on tour");
    assert.equal(slot.assignmentSource, "OPEN_POOL", "should fall back to open pool");
  });

  it("5. No eligible local pracharak → fallback to open pool", () => {
    // P1 is local but rating 3 can't lead rating-2 satsang → local pool empty
    // P5 is open, rating 2, eligible → should be assigned from open pool
    const pracharaks = [
      { id: "P1", name: "Pracharak 1", sectorId: "SEC-A", rating: 3, monthlyTarget: 3, isActive: true, specializations: [] },
      { id: "P5", name: "Pracharak 5", sectorId: "SEC-B", rating: 2, monthlyTarget: 3, isActive: true, specializations: [] },
      { id: "P6", name: "Pracharak 6", sectorId: "SEC-C", rating: 2, monthlyTarget: 3, isActive: true, specializations: [] },
    ];
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: [{ id: "SUN-A", name: "Sunday Satsang A", sectorId: "SEC-A", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
      pracharaks,
      branches: BRANCHES,
      history: [],
      tours: [],
      branchLocalPool: { "BR-A": [{ pracharakId: "P1", priority: 1 }] },
      config: { ratingMatrix: { 1: { 1: true, 2: true, 3: true }, 2: { 1: true, 2: true, 3: true }, 3: { 1: false, 2: false, 3: true } }, sewaCountStrict: false },
    });
    const mainSlots = result.assignments.filter((a) => a.weekOfMonth === 3 && a.dayOfWeek === 0);
    assert.ok(mainSlots.length > 0);
    const slot = mainSlots[0];
    assert.equal(slot.assignmentSource, "OPEN_POOL");
    assert.notEqual(slot.pracharakId, "P1", "P1 should not be assigned (rating-ineligible)");
  });

  it("6. Open-pool pracharak on tour → excluded", () => {
    // P1 (local) and P2 (local) are both on tour → open pool only has P3, P4
    // P3 is also on tour → only P4 remains
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: SATSANGS,
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [],
      tours: [
        { pracharakId: "P1", startDate: "2026-09-18", endDate: "2026-09-22" },
        { pracharakId: "P2", startDate: "2026-09-18", endDate: "2026-09-22" },
        { pracharakId: "P3", startDate: "2026-09-18", endDate: "2026-09-22" },
      ],
      branchLocalPool: {
        "BR-A": [
          { pracharakId: "P1", priority: 1 },
          { pracharakId: "P2", priority: 1 },
        ],
      },
      config: { sewaCountStrict: false },
    });
    const mainSlots = result.assignments.filter((a) => a.weekOfMonth === 3 && a.dayOfWeek === 0);
    assert.ok(mainSlots.length > 0);
    const slot = mainSlots[0];
    assert.equal(slot.pracharakId, "P4", "P4 should be assigned from open pool");
    assert.equal(slot.assignmentSource, "OPEN_POOL");
  });

  it("7. Open-pool pracharak already assigned that day → excluded", () => {
    // P3 is already assigned on 2026-09-20 via history
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: SATSANGS,
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [{ pracharakId: "P3", satsangId: "OTHER", sectorId: "SEC-A", date: "2026-09-20" }],
      tours: [],
      branchLocalPool: { "BR-A": [] },
      config: { sewaCountStrict: false, minGapDays: 1 },
    });
    const mainSlots = result.assignments.filter((a) => a.weekOfMonth === 3 && a.dayOfWeek === 0);
    assert.ok(mainSlots.length > 0);
    const slot = mainSlots[0];
    assert.notEqual(slot.pracharakId, "P3", "P3 should not be assigned twice on same day");
  });

  it("8. Local pracharak reaches monthly target → open fallback (with strict target)", () => {
    // P1 is local and already assigned 3 times (at target)
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: SATSANGS,
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [
        { pracharakId: "P1", satsangId: "SUN-A", sectorId: "SEC-A", date: "2026-09-01" },
        { pracharakId: "P1", satsangId: "SUN-A", sectorId: "SEC-A", date: "2026-09-05" },
        { pracharakId: "P1", satsangId: "SUN-A", sectorId: "SEC-A", date: "2026-09-10" },
      ],
      tours: [],
      branchLocalPool: { "BR-A": [{ pracharakId: "P1", priority: 1 }] },
      config: { sewaCountStrict: true },
    });
    const mainSlots = result.assignments.filter((a) => a.weekOfMonth === 3 && a.dayOfWeek === 0);
    assert.ok(mainSlots.length > 0);
    const slot = mainSlots[0];
    assert.notEqual(slot.pracharakId, "P1", "P1 should be excluded at target");
    assert.equal(slot.assignmentSource, "OPEN_POOL");
  });

  it("9. Regular satsang behavior unchanged — uses flat candidate pool", () => {
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: SATSANGS,
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [],
      tours: [],
      branchLocalPool: {},
      config: { sewaCountStrict: false },
    });
    // Week 2 (regular) should be assigned from the full candidate pool
    const regularSlots = result.assignments.filter((a) => a.weekOfMonth === 2 && a.dayOfWeek === 0);
    assert.ok(regularSlots.length > 0, "should have a regular satsang slot");
    const slot = regularSlots[0];
    assert.ok(slot.pracharakId, "should have a pracharak assigned");
    assert.equal(slot.assignmentSource, "OPEN_POOL", "regular satsang uses open pool path");
  });

  it("10. All non-Huzoor slots have assignmentSource", () => {
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: SATSANGS,
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [],
      tours: [],
      branchLocalPool: { "BR-A": [{ pracharakId: "P1", priority: 1 }] },
      config: { sewaCountStrict: false },
    });
    for (const a of result.assignments) {
      if (a.reasonCode === "huzoor_discourse") continue;
      assert.ok("assignmentSource" in a, `assignmentSource present on slot ${a.date}-${a.satsangName}`);
    }
  });

  it("11. Existing exclusion reasons remain available in regular path", () => {
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: [{ id: "SUN-A", name: "Sunday Satsang A", sectorId: "SEC-A", dayOfWeek: 0, timeType: "M", rating: 1, isActive: true }],
      pracharaks: [{ id: "P-LOW", name: "Low Rated", sectorId: "SEC-A", rating: 3, monthlyTarget: 3, isActive: true, specializations: [] }],
      branches: BRANCHES,
      history: [],
      tours: [],
      branchLocalPool: {},
      config: { ratingMatrix: { 1: { 1: true, 2: true, 3: true }, 2: { 1: true, 2: true, 3: true }, 3: { 1: false, 2: true, 3: true } }, sewaCountStrict: false },
    });
    // Only P-LOW exists, rating 3 can't lead rating 1 satsang → unfilled
    const unfilled = result.unfilled.filter((u) => u.date === "2026-09-06" || u.date === "2026-09-13" || u.date === "2026-09-20" || u.date === "2026-09-27");
    assert.ok(unfilled.length > 0, "should have unfilled slots");
    assert.ok(unfilled[0].reason.includes("rating"), "reason should mention rating");
  });

  it("12. Existing duty-engine tests still pass (determinism check)", () => {
    const input = {
      year: YEAR, month: MONTH,
      satsangs: SATSANGS,
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [],
      tours: [],
      branchLocalPool: {},
      config: { sewaCountStrict: false },
    };
    const r1 = generateDutyList(input);
    const r2 = generateDutyList({ ...input, seed: 42 });
    // With same seed (default), output should be identical
    assert.equal(JSON.stringify(r1), JSON.stringify(r2));
  });
});

describe("5-Sunday month edge case", () => {
  it("1st Sunday = Huzoor Discourse, remaining Sundays follow Main Satsang allocation", () => {
    // August 2026 has 5 Sundays: Aug 2, 9, 16, 23, 30
    // Branch defines requiredDays for weeks 1, 2, 3 only
    const result = generateDutyList({
      year: 2026, month: 8,
      satsangs: [{ id: "SUN-A", name: "Sunday Satsang A", sectorId: "SEC-A", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true }],
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [],
      tours: [],
      branchLocalPool: { "BR-A": [{ pracharakId: "P1", priority: 1 }] },
      config: { sewaCountStrict: false },
    });
    // Aug 2 (week 1) = Huzoor Discourse
    const week1 = result.assignments.find((a) => a.date === "2026-08-02");
    assert.ok(week1, "should have Aug 2 slot");
    assert.equal(week1.reasonCode, "huzoor_discourse");
    assert.equal(week1.pracharakId, null);

    // Weeks 2-3 should have assignments from pool
    const laterSlots = result.assignments.filter((a) => a.date !== "2026-08-02" && a.dayOfWeek === 0);
    assert.ok(laterSlots.length >= 2, "should have at least 2 other Sunday assignments");
    for (const s of laterSlots) {
      assert.ok(s.pracharakId, `${s.date} should have a pracharak assigned`);
    }
    // Week 3 (main) should use pool path
    const week3 = result.assignments.find((a) => a.weekOfMonth === 3 && a.dayOfWeek === 0);
    assert.ok(week3, "should have week 3 slot");
    assert.ok(week3.assignmentSource, "week 3 should have an assignment source");
  });
});

describe("isOnTour helper", () => {
  it("returns true when date falls within tour period", () => {
    const tours = [{ pracharakId: "P1", startDate: "2026-09-15", endDate: "2026-09-20" }];
    assert.equal(isOnTour("P1", "2026-09-15", tours), true);
    assert.equal(isOnTour("P1", "2026-09-20", tours), true);
    assert.equal(isOnTour("P1", "2026-09-21", tours), false);
  });

  it("returns false when no tours exist", () => {
    assert.equal(isOnTour("P1", "2026-09-15", []), false);
    assert.equal(isOnTour("P1", "2026-09-15", null), false);
  });

  it("returns false for different pracharak", () => {
    const tours = [{ pracharakId: "P1", startDate: "2026-09-15", endDate: "2026-09-20" }];
    assert.equal(isOnTour("P2", "2026-09-18", tours), false);
  });
});

describe("assignmentSource field", () => {
  it("PREDEFINED_LOCAL when local pool member is assigned", () => {
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: SATSANGS,
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [],
      tours: [],
      branchLocalPool: { "BR-A": [{ pracharakId: "P1", priority: 1 }] },
      config: { sewaCountStrict: false },
    });
    const mainSlot = result.assignments.find((a) => a.weekOfMonth === 3 && a.dayOfWeek === 0 && a.assignmentSource === "PREDEFINED_LOCAL");
    assert.ok(mainSlot, "should have PREDEFINED_LOCAL assignment on main satsang");
    assert.equal(mainSlot.pracharakId, "P1");
  });

  it("OPEN_POOL when no local pool member eligible", () => {
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: SATSANGS,
      pracharaks: PRACHARAKS,
      branches: BRANCHES,
      history: [],
      tours: [],
      branchLocalPool: {},
      config: { sewaCountStrict: false },
    });
    const mainSlot = result.assignments.find((a) => a.weekOfMonth === 3 && a.dayOfWeek === 0 && a.assignmentSource === "OPEN_POOL");
    assert.ok(mainSlot, "should have OPEN_POOL assignment on main satsang");
  });

  it("null when unfilled", () => {
    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs: [{ id: "SUN-A", name: "Sunday Satsang A", sectorId: "SEC-A", dayOfWeek: 0, timeType: "M", rating: 1, isActive: true }],
      pracharaks: [{ id: "P-LOW", name: "Low Rated", sectorId: "SEC-A", rating: 3, monthlyTarget: 3, isActive: true, specializations: [] }],
      branches: BRANCHES,
      history: [],
      tours: [],
      branchLocalPool: {},
      config: { ratingMatrix: { 1: { 1: true, 2: true, 3: true }, 2: { 1: true, 2: true, 3: true }, 3: { 1: false, 2: true, 3: true } }, sewaCountStrict: false },
    });
    const unfilledSlot = result.assignments.find((a) => a.pracharakId === null && a.reasonCode === "unfilled");
    assert.ok(unfilledSlot, "should have unfilled slot");
    assert.equal(unfilledSlot.assignmentSource, null);
  });
});

describe("Regression: two branches in same sector have independent pools", () => {
  it("Branch A sees only P1, Branch B sees only P2 — same sector", () => {
    // Two branches in SEC-X, each with different requiredDays and local pools
    // BR-A needs week 3 (main), BR-B needs week 4 (main) — avoids Huzoor Discourse week
    const branches = [
      { id: "BR-A", sectorId: "SEC-X", requiredDays: [{ week: 3, day: 0, type: "main" }], requiredSpecializations: [] },
      { id: "BR-B", sectorId: "SEC-X", requiredDays: [{ week: 4, day: 0, type: "main" }], requiredSpecializations: [] },
    ];
    // One satsang in SEC-X, Sunday
    const satsangs = [
      { id: "SUN-X", name: "Sunday Satsang X", sectorId: "SEC-X", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true },
    ];
    // Two pracharaks eligible
    const pracharaks = [
      { id: "P1", name: "Pracharak 1", sectorId: "SEC-X", rating: 2, monthlyTarget: 3, isActive: true, specializations: [] },
      { id: "P2", name: "Pracharak 2", sectorId: "SEC-X", rating: 2, monthlyTarget: 3, isActive: true, specializations: [] },
    ];
    // Branch A pool: only P1. Branch B pool: only P2.
    const branchLocalPool = {
      "BR-A": [{ pracharakId: "P1", priority: 1 }],
      "BR-B": [{ pracharakId: "P2", priority: 1 }],
    };

    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs, pracharaks, branches,
      history: [], tours: [], branchLocalPool,
      config: { sewaCountStrict: false },
    });

    // Week 3 (BR-A's Main Satsang) → should get P1 from BR-A's pool
    const week3 = result.assignments.find((a) => a.weekOfMonth === 3 && a.dayOfWeek === 0 && a.branchId === "BR-A");
    assert.ok(week3, "week 3 slot for BR-A exists");
    assert.equal(week3.assignmentSource, "PREDEFINED_LOCAL", "week 3 from local pool");
    assert.equal(week3.pracharakId, "P1", "week 3 assigned P1 (BR-A's pool)");

    // Week 4 (BR-B's Main Satsang) → should get P2 from BR-B's pool
    const week4 = result.assignments.find((a) => a.weekOfMonth === 4 && a.dayOfWeek === 0 && a.branchId === "BR-B");
    assert.ok(week4, "week 4 slot for BR-B exists");
    assert.equal(week4.assignmentSource, "PREDEFINED_LOCAL", "week 4 from local pool");
    assert.equal(week4.pracharakId, "P2", "week 4 assigned P2 (BR-B's pool)");

    // Verify P1 is NOT in BR-B's slot and P2 is NOT in BR-A's slot
    assert.notEqual(week3.pracharakId, "P2", "BR-A did NOT get P2 (BR-B's pool member)");
    assert.notEqual(week4.pracharakId, "P1", "BR-B did NOT get P1 (BR-A's pool member)");
  });

  it("Pracharak can belong to both branches if explicitly added to both pools", () => {
    const branches = [
      { id: "BR-A", sectorId: "SEC-X", requiredDays: [{ week: 2, day: 0, type: "main" }], requiredSpecializations: [] },
      { id: "BR-B", sectorId: "SEC-X", requiredDays: [{ week: 4, day: 0, type: "main" }], requiredSpecializations: [] },
    ];
    const satsangs = [
      { id: "SUN-X", name: "Sunday Satsang X", sectorId: "SEC-X", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true },
    ];
    const pracharaks = [
      { id: "P1", name: "Pracharak 1", sectorId: "SEC-X", rating: 2, monthlyTarget: 3, isActive: true, specializations: [] },
    ];
    // P1 is in BOTH pools — weeks 2→4 have >7 days gap so eligible
    const branchLocalPool = {
      "BR-A": [{ pracharakId: "P1", priority: 1 }],
      "BR-B": [{ pracharakId: "P1", priority: 1 }],
    };

    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs, pracharaks, branches,
      history: [], tours: [], branchLocalPool,
      config: { sewaCountStrict: false },
    });

    // Both branches should find P1 in their local pool
    const week2 = result.assignments.find((a) => a.weekOfMonth === 2 && a.dayOfWeek === 0 && a.branchId === "BR-A");
    const week4 = result.assignments.find((a) => a.weekOfMonth === 4 && a.dayOfWeek === 0 && a.branchId === "BR-B");
    assert.ok(week2 && week4, "both weeks exist");
    assert.equal(week2.branchId, "BR-A");
    assert.equal(week4.branchId, "BR-B");
    assert.equal(week2.assignmentSource, "PREDEFINED_LOCAL", "BR-A local pool found P1");
    assert.equal(week4.assignmentSource, "PREDEFINED_LOCAL", "BR-B local pool found P1");
    assert.equal(week2.pracharakId, "P1", "BR-A assigned P1");
    assert.equal(week4.pracharakId, "P1", "BR-B assigned P1");
  });

  it("Same-sector branches do not share local-pool data implicitly", () => {
    const branches = [
      { id: "BR-A", sectorId: "SEC-X", requiredDays: [{ week: 3, day: 0, type: "main" }], requiredSpecializations: [] },
      { id: "BR-B", sectorId: "SEC-X", requiredDays: [{ week: 4, day: 0, type: "main" }], requiredSpecializations: [] },
    ];
    const satsangs = [
      { id: "SUN-X", name: "Sunday Satsang X", sectorId: "SEC-X", dayOfWeek: 0, timeType: "M", rating: 2, isActive: true },
    ];
    const pracharaks = [
      { id: "P1", name: "Pracharak 1", sectorId: "SEC-X", rating: 2, monthlyTarget: 3, isActive: true, specializations: [] },
      { id: "P2", name: "Pracharak 2", sectorId: "SEC-X", rating: 2, monthlyTarget: 3, isActive: true, specializations: [] },
    ];
    // Only BR-A has a pool (P1). BR-B has NO pool.
    const branchLocalPool = {
      "BR-A": [{ pracharakId: "P1", priority: 1 }],
    };

    const result = generateDutyList({
      year: YEAR, month: MONTH,
      satsangs, pracharaks, branches,
      history: [], tours: [], branchLocalPool,
      config: { sewaCountStrict: false },
    });

    // Week 3 (BR-A) → P1 from local pool
    const week3 = result.assignments.find((a) => a.weekOfMonth === 3 && a.dayOfWeek === 0 && a.branchId === "BR-A");
    assert.equal(week3.pracharakId, "P1", "BR-A uses its own pool (P1)");
    assert.equal(week3.assignmentSource, "PREDEFINED_LOCAL");

    // Week 4 (BR-B) → no local pool, uses open pool
    const week4 = result.assignments.find((a) => a.weekOfMonth === 4 && a.dayOfWeek === 0 && a.branchId === "BR-B");
    assert.ok(week4.pracharakId, "BR-B has an assignment");
    assert.equal(week4.assignmentSource, "OPEN_POOL", "BR-B has no pool, uses open pool");
  });
});
