import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import { getSubmissions } from "../../../../lib/db";

function esc(value) {
  return String(value ?? "").replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getSubmissions("all", null);
  const data = rows.map((row) => ({
    id: row.id,
    code: String(row.id || "").replace(/-/g, "").slice(0, 8).toUpperCase(),
    name: row.name,
    phone: row.phone,
    category: row.category,
    zoneNo: row.zone_no,
    zoneName: row.zone_name,
    sectorName: row.sector_name,
    createdAt: row.created_at,
    attendedAt: row.attended_at,
  }));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
<title>Attendance — Offline</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; background: #f4f1ec; min-height: 100vh; }
  header { background: #1d3557; color: #fff; padding: 14px 16px; position: sticky; top: 0; z-index: 10; }
  header h1 { font-size: 17px; }
  .counts { display: flex; gap: 8px; margin-top: 8px; }
  .counts div { flex: 1; background: rgba(255,255,255,.12); border-radius: 10px; padding: 8px; text-align: center; }
  .counts b { display: block; font-size: 20px; }
  .counts span { font-size: 11px; opacity: .85; }
  main { padding: 14px 16px 90px; max-width: 640px; margin: 0 auto; }
  input[type="search"] { width: 100%; padding: 14px; font-size: 16px; border-radius: 12px; border: 1px solid #ccc; }
  .hint { font-size: 12px; color: #666; margin: 8px 2px 14px; }
  .card { background: #fff; border-radius: 14px; padding: 14px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .card.present { border-left: 5px solid #2a9d3f; }
  .card h3 { font-size: 16px; margin-bottom: 4px; }
  .meta { font-size: 13px; color: #555; line-height: 1.5; }
  .code { font-family: ui-monospace, monospace; background: #eee; border-radius: 6px; padding: 1px 7px; font-weight: 700; letter-spacing: 1px; }
  button.mark { margin-top: 10px; width: 100%; padding: 12px; font-size: 15px; font-weight: 700; border: 0; border-radius: 10px; cursor: pointer; }
  button.mark.yes { background: #2a9d3f; color: #fff; }
  button.mark.undo { background: #f4e3e1; color: #b02a2a; }
  .empty { text-align: center; color: #777; padding: 30px 0; }
  footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #ddd; padding: 10px 16px; display: flex; gap: 10px; }
  footer button, footer a.syncbtn { flex: 1; text-align: center; padding: 12px; font-size: 14px; font-weight: 700; border-radius: 10px; border: 0; cursor: pointer; text-decoration: none; }
  .btn-sync { background: #1d3557; color: #fff; }
  dialog { border: 0; border-radius: 14px; width: min(92vw, 480px); padding: 18px; }
  dialog::backdrop { background: rgba(0,0,0,.45); }
  textarea { width: 100%; height: 130px; font-size: 12px; font-family: ui-monospace, monospace; border: 1px solid #ccc; border-radius: 8px; padding: 8px; }
  .dlg-actions { display: flex; gap: 8px; margin-top: 12px; }
  .dlg-actions button { flex: 1; padding: 11px; font-size: 14px; font-weight: 700; border: 0; border-radius: 10px; cursor: pointer; }
  .toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: 84px; background: #222; color: #fff; padding: 10px 18px; border-radius: 20px; font-size: 13px; opacity: 0; transition: opacity .25s; pointer-events: none; }
  .toast.show { opacity: 1; }
</style>
</head>
<body>
<header>
  <h1>Attendance (Offline)</h1>
  <div class="counts">
    <div><b id="cPresent">0</b><span>Present</span></div>
    <div><b id="cAbsent">0</b><span>Not yet</span></div>
    <div><b id="cTotal">0</b><span>Total</span></div>
  </div>
</header>
<main>
  <input type="search" id="q" placeholder="Mobile number, code or name..." autocomplete="off" />
  <p class="hint">Search works with full mobile number, last few digits, the 8-character code, or the name.</p>
  <div id="list"></div>
</main>
<footer>
  <button class="btn-sync" id="openSync">Get sync code</button>
</footer>
<dialog id="syncDlg">
  <h3 style="margin-bottom:8px;font-size:16px;">Sync code</h3>
  <p style="font-size:13px;color:#555;margin-bottom:8px;">Copy this and send it to the admin (WhatsApp) after the event. It contains only who you marked present.</p>
  <textarea id="syncText" readonly></textarea>
  <div class="dlg-actions">
    <button class="btn-sync" id="copySync">Copy</button>
    <button style="background:#eee;" id="closeSync">Close</button>
  </div>
</dialog>
<div class="toast" id="toast"></div>
<script>
var DATA = ${JSON.stringify(data).replace(/</g, "\\u003c")};
var STORE_KEY = "snm_attendance_marks_v1";

function loadMarks() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
}
function saveMarks(marks) {
  localStorage.setItem(STORE_KEY, JSON.stringify(marks));
}
var marks = loadMarks();

function shortCode(id) {
  return String(id).replace(/-/g, "").slice(0, 8).toUpperCase();
}
function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function refreshCounts() {
  var present = DATA.filter(function (r) { return marks[r.id]; }).length;
  document.getElementById("cPresent").textContent = present;
  document.getElementById("cAbsent").textContent = DATA.length - present;
  document.getElementById("cTotal").textContent = DATA.length;
}

function cardHtml(r) {
  var isPresent = !!marks[r.id];
  var html = '<div class="card' + (isPresent ? " present" : "") + '">';
  html += '<h3>' + r.name + '</h3>';
  html += '<div class="meta"><span class="code">' + r.code + '</span> · ' + r.phone + '<br/>';
  html += (r.zoneNo || "") + " - " + (r.zoneName || "") + (r.sectorName ? " / Sector " + r.sectorName : "") + '<br/>';
  html += "Category: " + (r.category || "-") + "</div>";
  html += '<button class="mark ' + (isPresent ? "undo" : "yes") + '" data-id="' + r.id + '">';
  html += isPresent ? "&#10003; Marked present — tap to undo" : "Mark present";
  html += "</button></div>";
  return html;
}

function renderList(query) {
  var list = document.getElementById("list");
  var nq = norm(query);
  var results = DATA;
  if (nq) {
    results = DATA.filter(function (r) {
      return (
        norm(r.phone).indexOf(nq) !== -1 ||
        norm(r.code) === nq ||
        norm(r.code).indexOf(nq) === 0 && nq.length >= 4 ||
        norm(r.name).indexOf(nq) !== -1
      );
    });
  }
  results = results.slice(0, 60);
  if (!results.length) {
    list.innerHTML = '<div class="empty">No matching registrations.</div>';
    return;
  }
  list.innerHTML = results.map(cardHtml).join("");
}

document.getElementById("list").addEventListener("click", function (event) {
  var btn = event.target.closest("button.mark");
  if (!btn) return;
  var id = btn.getAttribute("data-id");
  if (marks[id]) {
    delete marks[id];
  } else {
    marks[id] = new Date().toISOString();
    showToast("Marked present");
  }
  saveMarks(marks);
  refreshCounts();
  renderList(document.getElementById("q").value);
});

document.getElementById("q").addEventListener("input", function (event) {
  renderList(event.target.value);
});

var dlg = document.getElementById("syncDlg");
document.getElementById("openSync").addEventListener("click", function () {
  var out = [];
  Object.keys(marks).forEach(function (id) {
    out.push({ id: id, at: marks[id] });
  });
  document.getElementById("syncText").value = JSON.stringify({ marks: out });
  dlg.showModal();
});
document.getElementById("closeSync").addEventListener("click", function () {
  dlg.close();
});
document.getElementById("copySync").addEventListener("click", function () {
  var ta = document.getElementById("syncText");
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  if (navigator.clipboard) { navigator.clipboard.writeText(ta.value); }
  showToast("Copied");
});

var toastTimer = null;
function showToast(msg) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1600);
}

refreshCounts();
renderList("");
</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": 'attachment; filename="attendance.html"',
      "Cache-Control": "no-store",
    },
  });
}
