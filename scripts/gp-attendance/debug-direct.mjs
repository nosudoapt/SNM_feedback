import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const base = "http://localhost:3000";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
const errs = [];
page.on("console", (m) => errs.push(m.type() + ": " + m.text().slice(0, 160)));
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message.slice(0, 200)));
await page.goto(base + "/gp-attendance.html", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 2500));
const probe = await page.evaluate(() => ({
  RAW: typeof RAW,
  USERS: typeof USERS,
  sha256: typeof sha256,
  ssoProbe: typeof ssoProbe,
  session: typeof session,
  credHint: (document.getElementById("credHint") || {}).textContent || "",
  loginShowing: !document.getElementById("loginScreen").classList.contains("hidden"),
  scriptCount: document.querySelectorAll("script").length,
}));
console.log(JSON.stringify(probe, null, 2));
console.log("CONSOLE/ERRORS:"); errs.forEach((e) => console.log("  " + e));
await browser.close().catch(() => process.exit(0));
