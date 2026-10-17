// Simulate the GP attendance HTML in jsdom: boot, attempt offline login
// (fetch is absent in jsdom so tryLogin falls through to the baked-users path),
// then try marking a person. Prints where the flow stalls.
import { JSDOM } from "jsdom";
import fs from "fs";
import crypto from "crypto";

const html = fs.readFileSync(new URL("../../public/gp-attendance.html", import.meta.url), "utf8");
const expectedAdminHash = crypto.createHash("sha256").update("admin:admin123").digest("hex");

const virtualConsole = new (await import("jsdom")).VirtualConsole();
const errors = [];
virtualConsole.on("error", (...a) => errors.push(a.join(" ")));
virtualConsole.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));

const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost:3000/gp-attendance.html", virtualConsole });
const { window } = dom;
const { document } = window;

const state = () => ({
  loginHidden: document.getElementById("loginScreen").className.includes("hidden"),
  hdrVisible: !document.getElementById("hdr").className.includes("hidden"),
  mode: window.mode,
  session: window.session,
  badge: document.getElementById("modeBadge").textContent,
  counts: document.getElementById("cTotal").textContent,
});

console.log("boot state:", JSON.stringify(state()));
console.log("baked hash matches node?", JSON.parse(JSON.stringify(window.USERS))[0].p === expectedAdminHash);

// type credentials and click — admin first
document.getElementById("inUser").value = "admin";
document.getElementById("inPin").value = "admin123";
document.getElementById("loginBtn").click();
await new Promise((r) => setTimeout(r, 400));
console.log("after admin login:", JSON.stringify(state()));

// simulate marking: find first mark button
const btn = document.querySelector("button.mark");
if (btn) {
  btn.click();
  await new Promise((r) => setTimeout(r, 200));
  const present = document.querySelectorAll("button.mark.undo").length;
  console.log("after mark click: undo-buttons =", present, "| counts present =", document.getElementById("cPresent").textContent);
} else {
  console.log("NO mark buttons rendered — list empty?");
}
console.log("localStorage marks:", window.localStorage.getItem("gp_marks_v1"));
console.log("console errors:", errors.length ? errors.join("\n") : "none");

// recorder login path (same file, fresh session)
window.sessionStorage.clear();
document.getElementById("hdr").className = "hidden";
document.getElementById("ftr").className = "hidden";
document.getElementById("inUser").value = "recorder1";
document.getElementById("inPin").value = "recorder123";
document.getElementById("loginBtn").click();
await new Promise((r) => setTimeout(r, 400));
console.log("after recorder login:", JSON.stringify({ ...state(), adminTabHidden: document.getElementById("tabAdmin").className.includes("hidden"), excelHidden: document.getElementById("btnExcel").className.includes("hidden") }));
