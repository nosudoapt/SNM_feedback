import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { ensureFullDutySchema, createTour, updateTour, deleteTour, getToursPage, getActiveToursForMonth, getTourStatusForMonth, isValidTourStatus } from "../lib/duty-db.js";

let createdTourId;
const TEST_P1 = "test-tour-p1";
const TEST_P2 = "test-tour-p2";

describe("Tour CRUD", () => {
  before(async () => {
    await ensureFullDutySchema();
  });

  it("1. Create tour", async () => {
    const result = await createTour({
      pracharakId: TEST_P1, startDate: "2026-10-15", endDate: "2026-10-22",
      location: "Delhi", reason: "Samagam", status: "uploaded",
    });
    assert.ok(result.id);
    createdTourId = result.id;
  });

  it("2. Update tour", async () => {
    await updateTour(createdTourId, { location: "Mumbai", status: "reviewed" });
  });

  it("3. Delete/deactivate tour", async () => {
    await deleteTour(createdTourId);
  });

  it("4. Status validation", () => {
    assert.equal(isValidTourStatus("uploaded"), true);
    assert.equal(isValidTourStatus("reviewed"), true);
    assert.equal(isValidTourStatus("locked"), true);
    assert.equal(isValidTourStatus("not_uploaded"), true);
    assert.equal(isValidTourStatus("invalid"), false);
    assert.equal(isValidTourStatus(""), false);
  });

  it("5. Tour status for month (no tours = not_uploaded)", async () => {
    const status = await getTourStatusForMonth(2035, 1);
    assert.equal(status, "not_uploaded");
  });

  it("6. Filtering by pracharak", async () => {
    await createTour({ pracharakId: TEST_P1, startDate: "2026-11-01", endDate: "2026-11-05", status: "uploaded" });
    await createTour({ pracharakId: TEST_P2, startDate: "2026-11-01", endDate: "2026-11-05", status: "uploaded" });
    const result = await getToursPage({ pracharakId: TEST_P1 });
    assert.ok(result.rows.length >= 1);
    assert.ok(result.rows.every((r) => r.pracharak_id === TEST_P1));
  });

  it("7. Filtering by date range (month)", async () => {
    const result = await getToursPage({ month: "11", year: "2026" });
    assert.ok(result.rows.length >= 1);
  });

  it("8. Overlapping tour periods are allowed", async () => {
    const r1 = await createTour({ pracharakId: TEST_P1, startDate: "2026-12-01", endDate: "2026-12-10" });
    const r2 = await createTour({ pracharakId: TEST_P1, startDate: "2026-12-05", endDate: "2026-12-15" });
    assert.ok(r1.id);
    assert.ok(r2.id);
  });

  it("9. Inactive tour exclusion from active query", async () => {
    const r = await createTour({ pracharakId: TEST_P1, startDate: "2026-09-01", endDate: "2026-09-05", status: "uploaded" });
    const active = await getActiveToursForMonth(2026, 9);
    assert.ok(active.some((t) => t.id === r.id));
    await deleteTour(r.id);
    const afterDelete = await getActiveToursForMonth(2026, 9);
    assert.ok(!afterDelete.some((t) => t.id === r.id));
  });
});
