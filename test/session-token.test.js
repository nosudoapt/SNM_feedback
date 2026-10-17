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

test("pre-v3 (audience-less) cookies are rejected outright", () => {
  // Forge a perfectly-valid-SIGNATURE v2 token, as the old gp/admin login did.
  const body = Buffer.from(
    JSON.stringify({ e: "old@gp.com", r: "super_admin", iat: Date.now() })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", "unit-test-secret-please-ignore")
    .update(body)
    .digest("hex");
  assert.equal(readSessionToken(`v2.${body}.${sig}`), null);
  assert.equal(verifySessionToken(`v2.${body}.${sig}`), false);
  // Also a hand-crafted legacy v1 token.
  const ts = String(Date.now());
  const sig1 = crypto
    .createHmac("sha256", "unit-test-secret-please-ignore")
    .update(ts)
    .digest("hex");
  assert.equal(readSessionToken(`${ts}.${sig1}`), null);
});

test("audience defaults to admin; attendance audience round-trips separately", () => {
  const adminTok = createSessionToken("a@b.com", ROLES.SUPER_ADMIN);
  assert.equal(readSessionToken(adminTok).aud, "admin");
  const attTok = createSessionToken("recorder1", ROLES.EDITOR, Date.now(), "attendance");
  const id = readSessionToken(attTok);
  assert.equal(id.aud, "attendance");
  assert.equal(id.role, ROLES.EDITOR);
  // an unknown audience is signed but reads back as admin — signature intact
  const weird = createSessionToken("a@b.com", ROLES.VIEWER, Date.now(), "banana");
  assert.equal(readSessionToken(weird).aud, "admin");
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

test("rejects even a correctly-signed legacy v1 token (v3 bump invalidates all old formats)", () => {
  const issuedAt = String(Date.now());
  const sig = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(issuedAt).digest("hex");
  const legacy = `${issuedAt}.${sig}`;
  assert.equal(readSessionToken(legacy), null);
});

test("rejects garbage and empty tokens", () => {
  assert.equal(readSessionToken(""), null);
  assert.equal(readSessionToken(null), null);
  assert.equal(readSessionToken("not-a-token"), null);
  assert.equal(readSessionToken("v2.only-two"), null);
});
