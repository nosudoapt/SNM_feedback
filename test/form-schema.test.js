import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slugify,
  slugifyKey,
  validateFormDefinition,
  validateSubmission,
  FIELD_TYPES,
} from "../lib/form-schema.js";

test("slugify makes url-safe form slugs", () => {
  assert.equal(slugify("  Pracharak Mahatma Feedback! "), "pracharak-mahatma-feedback");
  assert.equal(slugify("GBM / EBM 2026"), "gbm-ebm-2026");
  assert.equal(slugify("---weird__name---"), "weird-name");
});

test("slugifyKey makes safe object keys that start with a letter", () => {
  assert.equal(slugifyKey("Full Name"), "full_name");
  assert.equal(slugifyKey("79th Samagam?"), "f_79th_samagam");
  assert.equal(slugifyKey("  "), "");
});

test("validateFormDefinition accepts a good form and normalizes fields", () => {
  const r = validateFormDefinition([
    { label: "Full Name", type: "text", required: true },
    { label: "Zone", type: "select", options: ["A", "B", "A", ""], required: true },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
  assert.equal(r.fields[0].key, "full_name");
  assert.equal(r.fields[1].options.length, 2); // deduped + blank removed
});

test("validateFormDefinition rejects duplicate keys, bad types, missing options", () => {
  const r = validateFormDefinition([
    { label: "Name", type: "text" },
    { label: "Name", type: "text" }, // duplicate key
    { label: "Age", type: "spinner" }, // bad type
    { label: "Choice", type: "select", options: [] }, // no options
  ]);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("duplicate key")));
  assert.ok(r.errors.some((e) => e.includes("unknown type")));
  assert.ok(r.errors.some((e) => e.includes("at least one option")));
});

test("validateFormDefinition rejects a non-array", () => {
  assert.equal(validateFormDefinition("nope").ok, false);
  assert.equal(validateFormDefinition(null).ok, false);
});

test("every declared FIELD_TYPE is accepted by the definition validator", () => {
  for (const type of FIELD_TYPES) {
    const field = { label: `A ${type}`, type };
    if (["select", "radio", "checkbox"].includes(type)) field.options = ["x"];
    const r = validateFormDefinition([field]);
    assert.equal(r.ok, true, `type ${type} should validate`);
  }
});

test("validateSubmission enforces required fields", () => {
  const fields = validateFormDefinition([
    { label: "Full Name", type: "text", required: true },
    { label: "Notes", type: "textarea", required: false },
  ]).fields;
  const r = validateSubmission(fields, { notes: "hi" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.full_name);
});

test("validateSubmission validates and coerces typed fields", () => {
  const fields = validateFormDefinition([
    { label: "Age", type: "number", required: true },
    { label: "Email", type: "email", required: true },
    { label: "Phone", type: "tel", required: true },
    { label: "When", type: "date", required: true },
  ]).fields;

  const good = validateSubmission(fields, {
    age: "42",
    email: "a@b.com",
    phone: "+1 (555) 123-4567",
    when: "2026-05-01",
  });
  assert.equal(good.ok, true);
  assert.equal(good.cleaned.age, 42);

  const bad = validateSubmission(fields, {
    age: "not-a-number",
    email: "nope",
    phone: "123",
    when: "May 1st",
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.age && bad.errors.email && bad.errors.phone && bad.errors.when);
});

test("validateSubmission enforces select/checkbox option membership", () => {
  const fields = validateFormDefinition([
    { label: "Zone", type: "select", options: ["North", "South"], required: true },
    { label: "Days", type: "checkbox", options: ["Mon", "Tue", "Wed"], required: false },
  ]).fields;

  const ok = validateSubmission(fields, { zone: "North", days: ["Mon", "Wed"] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.cleaned.days, ["Mon", "Wed"]);

  const bad = validateSubmission(fields, { zone: "East", days: ["Sun"] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.zone);
  assert.ok(bad.errors.days);
});

test("validateSubmission drops unknown keys (no arbitrary storage)", () => {
  const fields = validateFormDefinition([{ label: "Name", type: "text", required: true }]).fields;
  const r = validateSubmission(fields, { name: "Ravi", sneaky: "DROP TABLE", isAdmin: true });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.cleaned), ["name"]);
});
