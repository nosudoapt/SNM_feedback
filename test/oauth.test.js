import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeJwtPayload, validateGoogleClaims } from "../lib/oauth.js";

const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload) => ["header", enc(payload), "signature"].join(".");

const CLIENT = "client-123.apps.googleusercontent.com";
const NONCE = "nonce-abc";
const NOW = 1_000_000_000_000;
const good = {
  aud: CLIENT,
  iss: "https://accounts.google.com",
  exp: Math.floor(NOW / 1000) + 3600,
  nonce: NONCE,
  email_verified: true,
  email: "Person@Example.com",
};

test("decodeJwtPayload extracts the middle segment", () => {
  assert.deepEqual(decodeJwtPayload(jwt(good)), good);
});

test("decodeJwtPayload returns null on garbage", () => {
  assert.equal(decodeJwtPayload("garbage"), null);
  assert.equal(decodeJwtPayload("only-one-part"), null);
  assert.equal(decodeJwtPayload(null), null);
});

test("valid claims pass and email is lowercased", () => {
  const r = validateGoogleClaims(good, { clientId: CLIENT, nonce: NONCE, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.email, "person@example.com");
});

test("rejects wrong audience", () => {
  const r = validateGoogleClaims({ ...good, aud: "someone-else" }, { clientId: CLIENT, nonce: NONCE, now: NOW });
  assert.deepEqual(r, { ok: false, reason: "aud" });
});

test("rejects wrong issuer", () => {
  const r = validateGoogleClaims({ ...good, iss: "evil.com" }, { clientId: CLIENT, nonce: NONCE, now: NOW });
  assert.equal(r.reason, "iss");
});

test("rejects expired token", () => {
  const r = validateGoogleClaims({ ...good, exp: Math.floor(NOW / 1000) - 1 }, { clientId: CLIENT, nonce: NONCE, now: NOW });
  assert.equal(r.reason, "exp");
});

test("rejects nonce mismatch and missing nonce", () => {
  assert.equal(validateGoogleClaims(good, { clientId: CLIENT, nonce: "other", now: NOW }).reason, "nonce");
  assert.equal(validateGoogleClaims(good, { clientId: CLIENT, nonce: undefined, now: NOW }).reason, "nonce");
});

test("rejects unverified email", () => {
  const r = validateGoogleClaims({ ...good, email_verified: false }, { clientId: CLIENT, nonce: NONCE, now: NOW });
  assert.equal(r.reason, "email_verified");
});

test("accepts string 'true' email_verified", () => {
  const r = validateGoogleClaims({ ...good, email_verified: "true" }, { clientId: CLIENT, nonce: NONCE, now: NOW });
  assert.equal(r.ok, true);
});

test("rejects missing email", () => {
  const r = validateGoogleClaims({ ...good, email: "" }, { clientId: CLIENT, nonce: NONCE, now: NOW });
  assert.equal(r.reason, "email");
});
