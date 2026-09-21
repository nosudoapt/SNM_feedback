import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  can,
  ACTIONS,
  roleAtLeast,
  normalizeRole,
  isValidRole,
  rankOf,
} from "../lib/rbac.js";

test("super_admin can do everything", () => {
  for (const a of Object.values(ACTIONS)) {
    assert.equal(can(ROLES.SUPER_ADMIN, a), true, `super_admin should ${a}`);
  }
});

test("editor can manage forms + duty + view/export, but not users/settings", () => {
  assert.equal(can(ROLES.EDITOR, ACTIONS.MANAGE_FORMS), true);
  assert.equal(can(ROLES.EDITOR, ACTIONS.MANAGE_DUTY), true);
  assert.equal(can(ROLES.EDITOR, ACTIONS.VIEW_SUBMISSIONS), true);
  assert.equal(can(ROLES.EDITOR, ACTIONS.EXPORT_SUBMISSIONS), true);
  assert.equal(can(ROLES.EDITOR, ACTIONS.MANAGE_USERS), false);
  assert.equal(can(ROLES.EDITOR, ACTIONS.MANAGE_SETTINGS), false);
});

test("viewer is read/export only", () => {
  assert.equal(can(ROLES.VIEWER, ACTIONS.VIEW_SUBMISSIONS), true);
  assert.equal(can(ROLES.VIEWER, ACTIONS.EXPORT_SUBMISSIONS), true);
  assert.equal(can(ROLES.VIEWER, ACTIONS.MANAGE_FORMS), false);
  assert.equal(can(ROLES.VIEWER, ACTIONS.MANAGE_DUTY), false);
  assert.equal(can(ROLES.VIEWER, ACTIONS.MANAGE_USERS), false);
});

test("unknown actions are denied for everyone", () => {
  assert.equal(can(ROLES.SUPER_ADMIN, "delete_the_universe"), false);
});

test("roleAtLeast respects the hierarchy", () => {
  assert.equal(roleAtLeast(ROLES.EDITOR, ROLES.VIEWER), true);
  assert.equal(roleAtLeast(ROLES.SUPER_ADMIN, ROLES.EDITOR), true);
  assert.equal(roleAtLeast(ROLES.VIEWER, ROLES.EDITOR), false);
  assert.equal(roleAtLeast(ROLES.EDITOR, "nonsense"), false);
});

test("normalizeRole coerces unknown/missing to viewer", () => {
  assert.equal(normalizeRole("root"), ROLES.VIEWER);
  assert.equal(normalizeRole(undefined), ROLES.VIEWER);
  assert.equal(normalizeRole(ROLES.EDITOR), ROLES.EDITOR);
});

test("isValidRole + rankOf", () => {
  assert.equal(isValidRole("editor"), true);
  assert.equal(isValidRole("root"), false);
  assert.ok(rankOf(ROLES.SUPER_ADMIN) > rankOf(ROLES.EDITOR));
  assert.ok(rankOf(ROLES.EDITOR) > rankOf(ROLES.VIEWER));
});
