// ONLINE-mode smoke harness for the GP attendance app.
// Runs the real public/gp-attendance.html inside jsdom, but proxied through a
// REAL HTTP server (dev on :3000) via a fetch shim + cookie jar, so the full
// browser-side online path is exercised: click Sign in → POST /login → cookie →
// live mode → GET marks → post a mark → wrong-PIN error message.
//
// Usage: node scripts/gp-attendance/harness-gp-online.mjs [baseUrl]

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] || "http://localhost:3000";
const html = readFileSync(join(here, "../../public/gp-attendance.html"), "utf8");

const dom = new JSDOM(html, {
  url: base + "/gp-attendance.html",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    if (!window.AbortController) window.AbortController = AbortController;
    // Log console errors instead of failing silently.
    window.addEventListener("error", (e) => console.error("page error:", e.message));
  },
});

const { window } = dom;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- fetch shim: jsdom scripts call window.fetch with relative paths. Proxy to
// the real server, maintaining a cookie jar across requests (login → Set-Cookie
// → later GETs with credentials:'same-origin').
const jar = new Map();
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url, base);
  const headers = new Headers(init.headers || {});
  if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
  const res = await fetch(url, {
    method: init.method || "GET",
    headers,
    body: init.body,
    redirect: "manual",
  });
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of setCookies) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return res;
};

function stateOf() {
  return {
    mode: window.eval("typeof mode !== 'undefined' ? mode : null"),
    session: window.eval("session ? JSON.parse(JSON.stringify(session)) : null"),
    badge: window.eval("document.getElementById('modeBadge').textContent"),
    loginErr: window.eval("document.getElementById('loginErr').textContent"),
    loginVisible: !window.document.getElementById("loginScreen").classList.contains("hidden"),
  };
}

function login(user, pin) {
  window.document.getElementById("inUser").value = user;
  window.document.getElementById("inPin").value = pin;
  window.document.getElementById("loginBtn").click();
  return true;
}

// Drive a fresh sign-in as recorder1 and assert the live path.
const out = {};
login("recorder1", "recorder123");

// Wait up to 45 s for the server round-trip + enterApp.
let final = null;
for (let i = 0; i < 90; i++) {
  await sleep(500);
  final = stateOf();
  if (!final.loginVisible && final.mode === "live") break;
}
out.afterLogin = final;

if (final.loginVisible || final.mode !== "live") {
  console.log(JSON.stringify([{ result: "FAIL", ...out.afterLogin }], null, 2));
  process.exit(1);
}

// Wrong PIN must show the strict message (server 401 → offline fallback fails).
const jar2 = new Map(); // fresh session: no cookie
window.document.getElementById("logoutBtn").click();
await sleep(300);
window.document.getElementById("inUser").value = "recorder1";
window.document.getElementById("inPin").value = "wrong-pin";
window.document.getElementById("loginBtn").click();
for (let i = 0; i < 60; i++) {
  await sleep(500);
  if (window.document.getElementById("loginErr").textContent.includes("Wrong username")) break;
}
out.wrongPin = stateOf().loginErr;

const ok = out.wrongPin.includes("Wrong username");
if (!ok) {
  console.log(JSON.stringify({ result: "FAIL", afterLogin: out.afterLogin, wrongPin: out.wrongPin }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ result: "PASS", wrongPinMessage: out.wrongPin }, null, 2));
process.exit(0);