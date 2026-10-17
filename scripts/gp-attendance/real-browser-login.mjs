// Real-browser E2E: drives local Chrome against the dev server and performs
// the whole unified login journey, screenshotting each step.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const base = process.argv[2] || "http://localhost:3000";
const [user, pass, expectUrlPart] = process.argv.slice(3);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-first-run", "--no-default-browser-check", "--window-size=1280,900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

try {
  await page.goto(base + "/admin/login", { waitUntil: "networkidle2", timeout: 60000 });

  // Citrus-fresh state: make sure no cookie/session leaks in.
  await page.evaluate(() => { try { sessionStorage.clear(); } catch {} });
  const client = await page.createCDPSession();
  await client.send("Network.clearBrowserCookies");

  await page.screenshot({ path: "/tmp/gp-1-login-page.png" });

  await page.waitForSelector("input[type=text]", { timeout: 20000 });
  await page.type("input[type=text]", user, { delay: 20 });
  await page.type("input[type=password]", pass, { delay: 20 });
  await page.screenshot({ path: "/tmp/gp-2-typed.png" });

  // Click the Sign In button.
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }).catch(() => {}),
    page.evaluate(() => document.querySelector("button[type=submit]")?.click()),
  ]);

  // Give the destination a moment to settle.
  await new Promise((r) => setTimeout(r, 4000));
  const finalUrl = page.url();
  await page.screenshot({ path: "/tmp/gp-3-after-login.png" });

  // Detect where we landed + what the page shows.
  const state = await page.evaluate(() => {
    const badge = document.getElementById("modeBadge");
    const loginScreen = document.getElementById("loginScreen");
    const h1 = document.querySelector("h1");
    return {
      h1: h1 ? h1.textContent.trim() : null,
      gpBadge: badge ? badge.textContent : null,
      gpLoginShowing: loginScreen ? !loginScreen.classList.contains("hidden") : null,
      gpSession: (window.sessionStorage.getItem && window.sessionStorage.getItem("gp_session_v1")) || null,
    };
  });
  console.log(JSON.stringify({ finalUrl, expectUrlPart, state, consoleErrors: errors }, null, 2));
  const ok = finalUrl.includes(expectUrlPart) &&
    errors.filter((e) => !e.includes("401")).length === 0;
  process.exit(ok ? 0 : 1);
} finally {
  await browser.close();
}
