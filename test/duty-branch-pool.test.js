import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  ensureFullDutySchema, createBranch, createPracharak,
  getBranchLocalPool, addToBranchPool, updateBranchPoolEntry, removeFromBranchPool
} from "../lib/duty-db.js";

let branchId, p1Id, p2Id, p3Id, entry1Id, entry2Id;

describe("Branch-Pracharak Local Pool", () => {
  before(async () => {
    await ensureFullDutySchema();
    // Create test branch
    const b = await createBranch({ name: "Pool Test Branch", sectorId: "S-POOL-TEST", locationType: "urban", requiredDays: [{ week: 1, day: 0 }], requiredSpecializations: [], isActive: true });
    branchId = b.id;
    // Create test pracharaks
    const pr1 = await createPracharak({ name: "Pool Test P1", contact: "9000000001", sectorId: "S-POOL-TEST", rating: 2, monthlyTarget: 2, awAd: false, specializations: [], isActive: true });
    p1Id = pr1.id;
    const pr2 = await createPracharak({ name: "Pool Test P2", contact: "9000000002", sectorId: "S-POOL-TEST", rating: 2, monthlyTarget: 2, awAd: false, specializations: [], isActive: true });
    p2Id = pr2.id;
    const pr3 = await createPracharak({ name: "Pool Test P3", contact: "9000000003", sectorId: "S-POOL-TEST", rating: 2, monthlyTarget: 2, awAd: false, specializations: [], isActive: true });
    p3Id = pr3.id;
  });

  it("1. Add local pracharak to branch pool", async () => {
    const result = await addToBranchPool({ branchId, pracharakId: p1Id, priority: 1 });
    assert.ok(result.id);
    entry1Id = result.id;
    const pool = await getBranchLocalPool(branchId);
    assert.ok(pool.some((e) => e.pracharak_id === p1Id));
  });

  it("2. List branch local pool", async () => {
    const pool = await getBranchLocalPool(branchId);
    assert.ok(pool.length >= 1);
    assert.ok(pool[0].pracharak_name);
  });

  it("3. Multiple pracharaks for one branch", async () => {
    const r2 = await addToBranchPool({ branchId, pracharakId: p2Id, priority: 0 });
    entry2Id = r2.id;
    const pool = await getBranchLocalPool(branchId);
    assert.ok(pool.length >= 2);
    const ids = pool.map((e) => e.pracharak_id);
    assert.ok(ids.includes(p1Id));
    assert.ok(ids.includes(p2Id));
  });

  it("4. Same pracharak in multiple branches", async () => {
    const b2 = await createBranch({ name: "Pool Test Branch 2", sectorId: "S-POOL-TEST-2", locationType: "urban", requiredDays: [{ week: 1, day: 0 }], requiredSpecializations: [], isActive: true });
    await addToBranchPool({ branchId: b2.id, pracharakId: p1Id, priority: 2 });
    const pool1 = await getBranchLocalPool(branchId);
    const pool2 = await getBranchLocalPool(b2.id);
    assert.ok(pool1.some((e) => e.pracharak_id === p1Id));
    assert.ok(pool2.some((e) => e.pracharak_id === p1Id));
  });

  it("5. Duplicate active relationship prevention", async () => {
    await assert.rejects(
      () => addToBranchPool({ branchId, pracharakId: p1Id }),
      /already/i
    );
  });

  it("6. Update priority", async () => {
    await updateBranchPoolEntry(entry1Id, { priority: 5 });
    const pool = await getBranchLocalPool(branchId);
    const entry = pool.find((e) => e.id === entry1Id);
    assert.equal(entry.priority, 5);
  });

  it("7. Deactivate/remove relationship", async () => {
    await removeFromBranchPool(entry2Id);
    const pool = await getBranchLocalPool(branchId);
    const entry = pool.find((e) => e.id === entry2Id);
    assert.equal(entry.is_active, false);
  });

  it("8. Invalid branch/pracharak handling", async () => {
    await assert.rejects(
      () => addToBranchPool({ branchId: "nonexistent-branch", pracharakId: p1Id }),
      /not found/i
    );
    await assert.rejects(
      () => addToBranchPool({ branchId, pracharakId: "nonexistent-pracharak" }),
      /not found/i
    );
  });

  it("9. Inactive relationship behavior — not in active pool query", async () => {
    const r = await addToBranchPool({ branchId, pracharakId: p3Id, priority: 0 });
    await removeFromBranchPool(r.id);
    const pool = await getBranchLocalPool(branchId);
    const activeEntries = pool.filter((e) => e.is_active === true);
    assert.ok(!activeEntries.some((e) => e.id === r.id));
  });
});
