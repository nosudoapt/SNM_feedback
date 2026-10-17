// ONLINE-mode smoke harness for the GP attendance app.
// Runs the real public/gp-attendance.html inside jsdom, but proxied through a
// REAL HTTP server (dev on :3000) via a fetch shim + cookie jar, so the full
// browser-side online path is exercised:
//   fresh state  -> click Sign in -> session cookie -> LIVE badge, marks sync
//   --sso        -> cookie obtained BEFORE page load (simulates arriving via
//                   the unified /admin/login door) -> app must enter with
//                   NO sign-in page shown at all (ssoProbe path)
//   wrong PIN    -> strict "Wrong username or PIN" message
//
// Usage: node scripts/gp-attendance/harness-gp-online.mjs [--sso] [baseUrl]

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const SSO = process.argv.includes("--sso");
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const base = positional[0] || "http://localhost:3000";
const html = readFileSync(join(here, "../../public/gp-attendance.html"), "utf8");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cookie jar: login responses here (outside any page) so the --sso run can
// start with the browser ALREADY authenticated, like the unified portal does.
const jar = new Map();
async function loginViaApi(user, password, endpoint, field) {
  const res = await fetch(new URL(endpoint, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, [field]: password }),
  });
  if (!res.ok) return null;
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return res.json();
}

// --- fetch shim: jsdom scripts call window.fetch with relative paths. Proxy to
// the real server, sharing the cookie jar (credentials:'same-origin').
function shim(url, init = {}) {
  const target = new URL(typeof url === "string" ? url : url.url, base);
  const headers = new Headers(init.headers || {});
  if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
  console.error("REQ:", init.method || "GET", target.pathname);
  return fetch(target, {
    method: init.method || "GET",
    headers,
    body: init.body,
    redirect: "manual",
  }).then((res) => {
    console.error("RES:", res.status, target.pathname);
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  }, (e) => { console.error("REJ:", target.pathname, String(e).slice(0, 120)); throw e; });
}

let window;
if (SSO) {
  // Pre-authenticate exactly like the unified login page would (recorder1).
  const who = await loginViaApi("recorder1", "recorder123", "/api/attendance/gp/login", "pin");
  if (!who?.user) {
    console.log(JSON.stringify({ result: "FAIL", stage: "pre-auth-login", who }, null, 2));
    process.exit(1);
  }
  window = makeDom();
  await settle();
  const entered = report();
  const pass = !entered.loginVisible && entered.mode === "live" &&
    entered.session && entered.session.username === "recorder1";
  console.log(JSON.stringify(pass ? { result: "PASS(sso)", ...entered } : { result: "FAIL(sso)", ...entered }, null, 2));
  process.exit(pass ? 0 : 1);
}

window = makeDom();

// Wrong PIN must show the strict message.
window.document.getElementById("inUser").value = "recorder1";
window.document.getElementById("inPin").value = "wrong-pin";
window.document.getElementById("loginBtn").click();
for (let i = 0; i < 60; i++) {
  await sleep(500);
  if (window.document.getElementById("loginErr").textContent.includes("Wrong username")) break;
}
const wrongPin = window.document.getElementById("loginErr").textContent;
if (!wrongPin.includes("Wrong username")) {
  console.log(JSON.stringify({ result: "FAIL", wrongPin }, null, 2));
  process.exit(1);
}

// Real sign-in: click and wait for portal entry.
window.document.getElementById("logoutBtn").click();
await settle();
window.document.getElementById("inUser").value = "recorder1";
window.document.getElementById("inPin").value = "recorder123";
window.document.getElementById("loginBtn").click();
await settle(90, (r) => !r.loginVisible && r.mode === "live" && r.session && r.session.username === "recorder1");
const final = report();
const pass = !final.loginVisible && final.mode === "live" && final.session?.username === "recorder1";
console.log(JSON.stringify(pass ? { result: "PASS", wrongPinMessage: wrongPin } : { result: "FAIL", ...final }, null, 2));
process.exit(pass ? 0 : 1);

/* ---------- helpers ---------- */
function makeDom() {
  const dom = new JSDOM(html, {
    url: base + "/gp-attendance.html",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(w) {
      if (!w.AbortController) w.AbortController = AbortController;
      w.fetch = (u, o) => shim(u, o);
      w.addEventListener("error", (e) => console.error("page error:", e.message));
    },
  });
  return dom.window;
}

// Wait until the app state is stable: up to `ticks` half-second steps.
async function settle(ticks = 12, done = (r) => !r.loginVisible && (r.mode === "live" || r.mode === "offline")) {
  for (let i = 0; i < ticks; i++) {
    await sleep(500);
    const r = report();
    try { if (done(r)) break; } catch { /* keep waiting */ }
  }
}

function report() {
  const w = window;
  return {
    mode: w.eval("typeof mode !== 'undefined' ? mode : null"),
    session: w.eval("session ? JSON.parse(JSON.stringify(session)) : null"),
    badge: w.document.getElementById("modeBadge").textContent,
    loginErr: w.document.getElementById("loginErr").textContent,
    loginVisible: !w.document.getElementById("loginScreen").classList.contains("hidden"),
  };
}
