// Deep debug of the SSO handoff in REAL Chrome: dump cookies, every network
// response on the gp page, and the app's own boot state.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const base = "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const net = [];
page.on("response", (r) => net.push(`${r.status()} ${r.url().replace(base, "")}`));
const cons = [];
page.on("console", (m) => cons.push(`${m.type()}: ${m.text().slice(0, 200)}`));

await page.goto(base + "/admin/login", { waitUntil: "networkidle2" });
const client = await page.createCDPSession();
await client.send("Network.clearBrowserCookies");
await page.evaluate(() => { try { sessionStorage.clear(); } catch {} });

await page.type("input[type=text]", "recorder1", { delay: 15 });
await page.type("input[type=password]", "recorder123", { delay: 15 });
await page.evaluate(() => document.querySelector("button[type=submit]")?.click());
await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));

const cookies = (await client.send("Network.getAllCookies")).cookies
  .filter((c) => c.name === "snm_admin_session")
  .map((c) => ({ path: c.path, size: (c.value || "").length, head: (c.value || "").slice(0, 24) }));

const inside = await page.evaluate(async () => {
  let me = null, marks = null, raw = null;
  try {
    const r = await fetch("/api/attendance/gp/me");
    me = r.status + "|" + (await r.text()).slice(0, 80);
  } catch (e) { me = "ERR " + e; }
  try {
    const r = await fetch("/api/attendance/gp");
    marks = r.status + "|" + (await r.text()).slice(0, 60);
  } catch (e) { marks = "ERR " + e; }
  const ls = sessionStorage.getItem("gp_session_v1");
  raw = ls ? JSON.parse(ls) : null;
  return {
    me, marks, storedSession: raw,
    liveSessionVar: window.eval("typeof session !== 'undefined' ? JSON.parse(JSON.stringify(session)) : 'undefined'"),
    funcs: window.eval("JSON.stringify({ssoProbe: typeof ssoProbe, bootProbe: typeof bootProbe, loadSession: typeof loadSession, enterApp: typeof enterApp, sha256: typeof sha256})"),
    badge: document.getElementById("modeBadge").textContent,
    loginShowing: !document.getElementById("loginScreen").classList.contains("hidden"),
  };
});

console.log(JSON.stringify({ cookies, inside }, null, 2));
console.log("CONSOLE:"); cons.forEach((n) => console.log("  " + n));
console.log("NETWORK:"); net.forEach((n) => console.log("  " + n));
await browser.close();
