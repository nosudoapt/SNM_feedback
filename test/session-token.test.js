// Deterministic env for the token codec under test.
process.env.AUTH_SECRET = "unit-test-secret-please-ignore";
process.env.ADMIN_EMAIL = "owner@example.com";
delete process.env.NODE_ENV; // ensure we are not in "production" fail-closed mode

import crypto from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  readSessionToken,
  verifySessionToken,
  ownerEmail,
  SESSION_TTL_MS,
} from "../lib/session-token.js";
import { ROLES } from "../lib/rbac.js";

test("round-trips email (lowercased) + role + iat", () => {
  const t = createSessionToken("Owner@Example.COM", ROLES.EDITOR, 1000);
  const id = readSessionToken(t, 1000);
  assert.ok(id);
  assert.equal(id.email, "owner@example.com");
  assert.equal(id.role, ROLES.EDITOR);
  assert.equal(id.iat, 1000);
});

test("defaults to owner email + super_admin when omitted", () => {
  const t = createSessionToken();
  const id = readSessionToken(t);
  assert.equal(id.email, ownerEmail());
  assert.equal(id.email, "owner@example.com");
  assert.equal(id.role, ROLES.SUPER_ADMIN);
});

test("an invalid role in the token is normalized down to viewer", () => {
  const t = createSessionToken("x@y.com", "root");
  assert.equal(readSessionToken(t).role, ROLES.VIEWER);
});

test("rejects a tampered payload", () => {
  const t = createSessionToken("x@y.com", ROLES.EDITOR);
  const parts = t.split(".");
  // flip one char in the payload body
  const body = parts[1];
  const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
  const tampered = [parts[0], flipped, parts[2]].join(".");
  assert.equal(readSessionToken(tampered), null);
  assert.equal(verifySessionToken(tampered), false);
});

test("rejects a bad signature", () => {
  const t = createSessionToken("x@y.com", ROLES.EDITOR);
  const parts = t.split(".");
  const badSig = parts[2].slice(0, -1) + (parts[2].endsWith("0") ? "1" : "0");
  assert.equal(readSessionToken([parts[0], parts[1], badSig].join(".")), null);
});

test("rejects an expired token", () => {
  const iat = 10_000;
  const t = createSessionToken("x@y.com", ROLES.EDITOR, iat);
  // now is just past the TTL
  assert.equal(readSessionToken(t, iat + SESSION_TTL_MS + 1), null);
  // still valid one ms before expiry
  assert.ok(readSessionToken(t, iat + SESSION_TTL_MS - 1));
});

test("accepts a correctly-signed legacy v1 token as owner/super_admin", () => {
  const issuedAt = String(Date.now());
  const sig = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(issuedAt).digest("hex");
  const legacy = `${issuedAt}.${sig}`;
  const id = readSessionToken(legacy);
  assert.ok(id);
  assert.equal(id.email, ownerEmail());
  assert.equal(id.role, ROLES.SUPER_ADMIN);
});

test("rejects garbage and empty tokens", () => {
  assert.equal(readSessionToken(""), null);
  assert.equal(readSessionToken(null), null);
  assert.equal(readSessionToken("not-a-token"), null);
  assert.equal(readSessionToken("v2.only-two"), null);
});
