import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDutySheets, monthLabel } from "../lib/duty-export.js";
import { buildXlsx, colLetter } from "../lib/xlsx-writer.js";

function fixture() {
  const list = {
    month: 9, year: 2026, version: 2, status: "committed",
    comparison_month: 9, comparison_year: 2025,
    payload: {
      generatedAt: "2026-08-20T10:00:00.000Z",
      stats: {
        totalSlots: 4, filled: 3, unfilled: 1, fillRatePct: 75,
        ruleHits: { rating: 2, gap: 1, cooldown: 3, preference: 0, target: 1 },
        perPracharak: { p1: { name: "Vol A", target: 3 }, p2: { name: "Vol B", target: 2 } },
      },
    },
  };
  const assignments = [
    { id: "a1", duty_date: "2026-09-06", satsang_name: "North", sector_name: "S1", satsang_time_type: "M", satsang_time_slot: "10:00", satsang_rating: 1, pracharak_id: "p1", pracharak_name: "Vol A", pracharak_contact: "1", is_local: true, reason_code: "predefined_local", overridden_by_user: false, payload: {} },
    { id: "a2", duty_date: "2026-09-13", satsang_name: "North", sector_name: "S1", satsang_time_type: "M", satsang_time_slot: "10:00", satsang_rating: 1, pracharak_id: "p2", pracharak_name: "Vol B", pracharak_contact: "2", is_local: false, reason_code: "scored", overridden_by_user: false, payload: {} },
    { id: "a3", duty_date: "2026-09-20", satsang_name: "West", sector_name: "S2", satsang_time_type: "E", satsang_time_slot: "18:00", satsang_rating: 3, pracharak_id: null, pracharak_name: null, pracharak_contact: null, is_local: false, reason_code: "unfilled", overridden_by_user: false, payload: {} },
    { id: "a4", duty_date: "2026-09-27", satsang_name: "West", sector_name: "S2", satsang_time_type: "M", satsang_time_slot: "09:30", satsang_rating: 3, pracharak_id: "p1", pracharak_name: "Vol A", pracharak_contact: "1", is_local: false, reason_code: "manual_override", overridden_by_user: true, payload: {} },
  ];
  return { list, assignments };
}

test("colLetter maps 1->A, 26->Z, 27->AA, 28->AB, 53->BA", () => {
  assert.equal(colLetter(1), "A");
  assert.equal(colLetter(26), "Z");
  assert.equal(colLetter(27), "AA");
  assert.equal(colLetter(28), "AB");
  assert.equal(colLetter(53), "BA");
});

test("monthLabel formats month/year", () => {
  assert.equal(monthLabel(9, 2026), "September 2026");
  assert.equal(monthLabel(1, 2025), "January 2025");
});

test("buildDutySheets returns three named sheets", () => {
  const sheets = buildDutySheets(fixture());
  assert.equal(sheets.length, 3);
  assert.deepEqual(sheets.map((s) => s.name), ["By Location", "By Pracharak", "Summary"]);
});

test("By Location includes every slot plus a bold header row", () => {
  const [loc] = buildDutySheets(fixture());
  assert.equal(loc.rows.length, 1 + 4); // header + 4 assignments (incl. unfilled)
  assert.ok(loc.rows[0].every((c) => c && c.bold === true), "header cells are bold");
  // unfilled slot is marked
  const flat = loc.rows.slice(1).map((r) => r[6]);
  assert.ok(flat.includes("— Unfilled —"));
});

test("By Pracharak excludes unfilled slots and sorts by name then date", () => {
  const [, prac] = buildDutySheets(fixture());
  const dataRows = prac.rows.slice(1);
  assert.equal(dataRows.length, 3); // only the 3 assigned
  assert.equal(dataRows[0][0], "Vol A");
  assert.equal(dataRows[0][2], "2026-09-06"); // Vol A's earliest date first
  assert.equal(dataRows[1][0], "Vol A");
  assert.equal(dataRows[1][2], "2026-09-27");
  assert.equal(dataRows[2][0], "Vol B");
});

test("Summary carries coverage numbers and an unfilled-slots section", () => {
  const [, , summary] = buildDutySheets(fixture());
  const asText = summary.rows.map((r) => r.map((c) => (c && typeof c === "object" ? c.v : c)));
  const find = (label) => asText.find((r) => r[0] === label);
  assert.deepEqual(find("Total slots").slice(0, 2), ["Total slots", 4]);
  assert.deepEqual(find("Filled").slice(0, 2), ["Filled", 3]);
  assert.deepEqual(find("Unfilled").slice(0, 2), ["Unfilled", 1]);
  assert.deepEqual(find("Fill rate %").slice(0, 2), ["Fill rate %", 75]);
  assert.ok(asText.some((r) => r[0] === "Unfilled slots"), "has unfilled slots section");
  // utilization row for Vol A: assigned 2, target 3
  const utilA = asText.find((r) => r[0] === "Vol A");
  assert.equal(utilA[1], 2);
  assert.equal(utilA[2], 3);
});

test("Summary omits the unfilled section when everything is covered", () => {
  const fx = fixture();
  fx.assignments = fx.assignments.filter((a) => a.pracharak_id); // drop the unfilled one
  const [, , summary] = buildDutySheets(fx);
  const asText = summary.rows.map((r) => r.map((c) => (c && typeof c === "object" ? c.v : c)));
  assert.ok(!asText.some((r) => r[0] === "Unfilled slots"));
});

test("buildXlsx emits a valid ZIP container with all expected parts", () => {
  const buf = buildXlsx(buildDutySheets(fixture()));
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.slice(0, 2).toString("latin1"), "PK"); // ZIP local-file signature
  assert.ok(buf.slice(-22, -18).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06])), "ends with EOCD record");
  const whole = buf.toString("latin1");
  for (const part of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml"]) {
    assert.ok(whole.includes(part), `contains ${part}`);
  }
  // sheet names surface in workbook.xml
  assert.ok(whole.includes("By Location") && whole.includes("By Pracharak") && whole.includes("Summary"));
});

test("buildXlsx escapes XML-special characters in cell text", () => {
  const buf = buildXlsx([{ name: "T", rows: [["a & b <tag> \"q\""]] }]);
  const whole = buf.toString("latin1");
  assert.ok(whole.includes("a &amp; b &lt;tag&gt; &quot;q&quot;"));
});
