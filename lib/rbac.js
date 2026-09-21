// lib/rbac.js
// Role-based access control — pure, dependency-free logic so it can be unit-tested
// with `node --test`. No database or request objects here on purpose.
//
// Three roles, hierarchical:
//   viewer      — read + export submissions
//   editor      — the above + build/manage forms + manage the duty roster
//   super_admin — the above + manage users/access (the allowlist) + settings
//
// Everything is expressed as a minimum rank per action, so a higher role can do
// everything a lower role can.

export const ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  EDITOR: "editor",
  VIEWER: "viewer",
});

export const ROLE_RANK = Object.freeze({
  [ROLES.VIEWER]: 1,
  [ROLES.EDITOR]: 2,
  [ROLES.SUPER_ADMIN]: 3,
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.SUPER_ADMIN]: "Super admin",
  [ROLES.EDITOR]: "Editor",
  [ROLES.VIEWER]: "Viewer",
});

// Actions used across the app. Value = the minimum role rank required.
export const ACTIONS = Object.freeze({
  VIEW_SUBMISSIONS: "view_submissions",
  EXPORT_SUBMISSIONS: "export_submissions",
  MANAGE_FORMS: "manage_forms",
  MANAGE_DUTY: "manage_duty",
  MANAGE_USERS: "manage_users",
  MANAGE_SETTINGS: "manage_settings",
});

const ACTION_MIN_RANK = Object.freeze({
  [ACTIONS.VIEW_SUBMISSIONS]: ROLE_RANK[ROLES.VIEWER],
  [ACTIONS.EXPORT_SUBMISSIONS]: ROLE_RANK[ROLES.VIEWER],
  [ACTIONS.MANAGE_FORMS]: ROLE_RANK[ROLES.EDITOR],
  [ACTIONS.MANAGE_DUTY]: ROLE_RANK[ROLES.EDITOR],
  [ACTIONS.MANAGE_USERS]: ROLE_RANK[ROLES.SUPER_ADMIN],
  [ACTIONS.MANAGE_SETTINGS]: ROLE_RANK[ROLES.SUPER_ADMIN],
});

export function isValidRole(role) {
  return typeof role === "string" && Object.prototype.hasOwnProperty.call(ROLE_RANK, role);
}

// Coerce anything unknown/missing down to the least-privileged role. Never throws.
export function normalizeRole(role) {
  return isValidRole(role) ? role : ROLES.VIEWER;
}

export function rankOf(role) {
  return ROLE_RANK[normalizeRole(role)];
}

// Is `role` at least as privileged as `minRole`?
export function roleAtLeast(role, minRole) {
  if (!isValidRole(minRole)) return false;
  return rankOf(role) >= ROLE_RANK[minRole];
}

// Can a user with `role` perform `action`?
export function can(role, action) {
  const need = ACTION_MIN_RANK[action];
  if (typeof need !== "number") return false; // unknown action -> deny
  return rankOf(role) >= need;
}
