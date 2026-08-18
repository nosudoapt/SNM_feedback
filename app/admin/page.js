"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

const CATEGORY_LABELS = {
  mahila: "Mahila Samagam",
  bal: "Bal Samagam",
  ems: "EMS",
  "branch-incharge": "Branch Incharge",
};

const FIELD_LABELS = {
  mahilaAge: "Age group(s) participated",
  balAge: "Age group(s) participated",
  emsAge: "Age group(s) participated",
  mahilaLocation: "Where was the Satsang arranged?",
  balLocation: "Where was the Satsang arranged?",
  emsLocation: "Where was the Satsang arranged?",
  mahilaSound: "Was the sound & mic quality good?",
  balSound: "Was the sound & mic quality good?",
  emsSound: "Was the sound & mic quality good?",
  mahilaBanner: "Was the particular banner/backdrop installed?",
  balBanner: "Was the particular banner/backdrop installed?",
  emsBanner: "Was the particular banner/backdrop installed?",
  mahilaScripture: "Was any scripture used?",
  balScripture: "Was any scripture used?",
  emsScripture: "Was any scripture used?",
  mahilaSaints: "How many Saints were present?",
  balSaints: "How many Saints were present?",
  emsSaints: "How many Saints were present?",
  mahilaRatioGeet: "Ratio — Geet",
  mahilaRatioVichar: "Ratio — Vichar",
  mahilaRatioSkit: "Ratio — Skit",
  mahilaRatioDance: "Ratio — Dance",
  mahilaRatioKavita: "Ratio — Kavita",
  balRatioGeet: "Ratio — Geet",
  balRatioVichar: "Ratio — Vichar",
  balRatioSkit: "Ratio — Skit",
  balRatioDance: "Ratio — Dance",
  balRatioKavita: "Ratio — Kavita",
  emsRatioGeet: "Ratio — Geet",
  emsRatioVichar: "Ratio — Vichar",
  emsRatioSkit: "Ratio — Skit",
  emsRatioDance: "Ratio — Dance",
  emsRatioKavita: "Ratio — Kavita",
  mahilaMessageClarity: "Speakers put the divine message clearly?",
  balMessageClarity: "Speakers put the divine message clearly?",
  emsMessageClarity: "Speakers put the divine message clearly?",
  mahilaMessageClarityReasons: "Message clarity — if no, why",
  balMessageClarityReasons: "Message clarity — if no, why",
  emsMessageClarityReasons: "Message clarity — if no, why",
  mahilaContentApt: "Message/topic clear & appropriate as per samagam?",
  balContentApt: "Message/topic clear & appropriate as per samagam?",
  emsContentApt: "Message/topic clear & appropriate as per samagam?",
  mahilaContentAptReasons: "Content apt — if no, reason",
  balContentAptReasons: "Content apt — if no, reason",
  emsContentAptReasons: "Content apt — if no, reason",
  mahilaContentAptRemarks: "Content apt — remarks",
  balContentAptRemarks: "Content apt — remarks",
  emsContentAptRemarks: "Content apt — remarks",
  mahilaAnchoring: "Manch Sanchalan (Mahila/EMS)",
  balAnchoring: "Manch Sanchalan (roaming or settled)",
  emsAnchoring: "Manch Sanchalan (EMS)",
  mahilaTime: "Time allotted for discourse",
  balTime: "Time allotted for discourse",
  emsTime: "Time allotted for discourse",
  mahilaActualTime: "Actual time (min)",
  balActualTime: "Actual time (min)",
  emsActualTime: "Actual time (min)",
  mahilaSchedule: "Started & concluded on schedule?",
  balSchedule: "Started & concluded on schedule?",
  emsSchedule: "Started & concluded on schedule?",
  mahilaScheduleReason: "Reason (if no)",
  balScheduleReason: "Reason (if no)",
  emsScheduleReason: "Reason (if no)",
  emsLanguage: "Language(s) used",
  mahilaProgramIssues: "Program issues",
  balProgramIssues: "Program issues",
  emsProgramIssues: "Program issues",
  mahilaOverall: "Overall rating",
  balOverall: "Overall rating",
  emsOverall: "Overall rating",
  mahilaOverallRemarks: "Overall rating — remarks",
  balOverallRemarks: "Overall rating — remarks",
  emsOverallRemarks: "Overall rating — remarks",
  pracharakName: "Pracharak Mahatma Name who visited your sector",
  pracharakZoneNo: "Pracharak area/zone number",
  pracharakZoneName: "Pracharak area/zone name",
  samagamType: "Type of Samagam held at your branch",
  emsContent: "Ratio of English & Hindi in the Vichar (Branch)",
  balContent: "Used child-friendly (Bal) examples for kids",
  mahilaContent: "Used broader aspects & relevant women examples",
  emsContentRatio: "Ratio of English & Hindi in the Vichar (EMS)",
  arrivalTime: "Arrival time of Pracharak",
  arrivalTimeActual: "Actual arrival time (if late)",
  content: "Content of the Pracharak",
  conduct: "Conduct of the Pracharak",
  improvements: "Suggestions / improvements",
};

const VALUE_LABELS = {
  yes: "Yes",
  no: "No",
  other: "Other",
  indoor: "Indoor",
  outdoor: "Outdoor",
  "only-youth": "Only Youth",
  "only-kids": "Only Kids",
  "youth-kids": "Youth and Kids",
  "youth-adults": "Youth and Adults",
  mixed: "Mixed",
  "below-10": "Below 10 yrs",
  "above-10": "Above 10 yrs",
  baachiyaan: "Baachiyaan (Girls)",
  "yuva-behne": "Yuva Behne (Youth)",
  "keval-yuva-behne": "Keval Yuva Behne (Only Youth)",
  matured: "Matured",
  roaming: "Roaming",
  settled: "Settled down",
  "lack-of-clarity": "Lack of clarity",
  "lack-of-mission-ideology": "Lack of ideology of the mission",
  "lack-of-authenticity": "Lack of authenticity",
  "speaker-list-exceeded": "Speaker list was exceeded (performances were left)",
  "more-than-2-incharges-vote-of-thanks": "More than 2 incharges (Mukhi, Sanyojak) gave vote of thanks",
  "last-speech-over-10-min": "Last speech by ZI/Sanyojak took more than 10 min",
  "program-started-late": "The program started late",
  "overall-very-good": "Overall very good",
  "well-organised-coordinated": "Well organised & coordinated",
  "good-efforts": "Good efforts",
  "scope-of-improvement": "Scope of improvement",
  "no-zeal-in-satsang": "No zeal in satsang",
  lt20: "Less than 20 min",
  "30": "30 min",
  "25": "25 min",
  "20": "20 min",
  hindi: "Hindi",
  english: "English",
  general: "General",
  special: "Special",
  "70:30-english-hindi": "70:30 (English : Hindi)",
  "on-time": "On time",
  late: "Late",
  ems: "EMS",
  bal: "Bal",
  mahila: "Mahila",
  excellent: "Excellent",
  "very-good": "Very Good",
  good: "Good",
  average: "Average",
  poor: "Poor",
};

const META_KEYS = new Set([
  "name",
  "phone",
  "zoneNumber",
  "zoneNo",
  "zoneName",
  "zoneType",
  "sectorNo",
  "sectorName",
  "zonalInchargeName",
  "sectorInchargeName",
  "category",
]);

function prettyKey(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function formatValue(key, value) {
  if (Array.isArray(value)) {
    return value
      .map((v) => formatValue(key, v))
      .filter((v) => v !== "")
      .join(", ");
  }
  if (value === null || value === undefined) return "";
  const v = String(value).trim();
  if (!v) return "";
  return VALUE_LABELS[v] !== undefined ? VALUE_LABELS[v] : v;
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function buildDailySeries(daily) {
  const map = {};
  (daily || []).forEach((d) => {
    map[d.day] = d.count;
  });
  const out = [];
  const pad = (n) => String(n).padStart(2, "0");
  const today = new Date();
  for (let i = 13; i >= 0; i -= 1) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - i);
    const key = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    out.push({ key, count: map[key] || 0 });
  }
  return out;
}

function shortDay(key) {
  const d = new Date(`${key}T00:00:00`);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function buildDetailSections(payload, row) {
  const meta = [
    ["Name", row.name],
    ["Phone", row.phone],
    ["Created", formatDate(row.created_at)],
    ["Category", CATEGORY_LABELS[row.category] || row.category],
    ["Zone", `${row.zone_no} — ${row.zone_name}`],
    ["Zone type", row.zone_type === "special" ? "Special" : "General"],
  ];
  if (row.sector_no) meta.push(["Sector", `${row.sector_no} — ${row.sector_name || ""}`]);
  if (row.zonal_incharge_name) meta.push(["Zonal incharge", row.zonal_incharge_name]);
  if (row.sector_incharge_name) meta.push(["Sector incharge", row.sector_incharge_name]);
  meta.push(["ID", row.id]);

  const answers = Object.entries(payload || {})
    .filter(([k, v]) => !META_KEYS.has(k) && formatValue(k, v) !== "")
    .map(([k, v]) => [FIELD_LABELS[k] || prettyKey(k), formatValue(k, v)]);

  return { meta, answers };
}

function SortHeader({ col, label, sort, order, onSort }) {
  const active = sort === col;
  return (
    <th aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"} style={s.th}>
      <button type="button" onClick={() => onSort(col)} style={s.sortBtn}>
        {label}
        {active ? (order === "asc" ? " \u25B2" : " \u25BC") : ""}
      </button>
    </th>
  );
}

export default function AdminDashboard() {
  const router = useRouter();

  const [stats, setStats] = useState(null);
  const [chart, setChart] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState("");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [rowsError, setRowsError] = useState("");

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [zoneType, setZoneType] = useState("all");
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);

  const [exportRange, setExportRange] = useState("all");
  const [exportType, setExportType] = useState("all");
  const [exporting, setExporting] = useState(false);

  const toastTimer = useRef(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load");
        return;
      }
      setStats(data.stats);
      setChart(data.chart);
    } catch {
      setError("Network error");
    } finally {
      setStatsLoading(false);
    }
  }, [router]);

  const fetchRows = useCallback(async () => {
    setRowsLoading(true);
    setRowsError("");
    try {
      const params = new URLSearchParams({
        q,
        category,
        zoneType,
        sort,
        order,
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/admin/submissions?${params.toString()}`);
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setRowsError(data.error || "Failed to load submissions");
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch {
      setRowsError("Network error");
      setRows([]);
      setTotal(0);
    } finally {
      setRowsLoading(false);
    }
  }, [q, category, zoneType, sort, order, page, limit, router]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    setPage(1);
  }, [q, category, zoneType, limit]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [selected]);

  function handleSort(col) {
    if (sort === col) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(col);
      setOrder(col === "created_at" ? "desc" : "asc");
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/export?range=${exportRange}&type=${exportType}`);
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Export failed", "error");
        return;
      }
      const blob = await res.blob();
      const count = res.headers.get("X-Export-Count");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `submissions-${exportType}-${exportRange}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(count ? `${count} submission${count === "1" ? "" : "s"} exported` : "Export complete");
      fetchStats();
      fetchRows();
    } catch {
      showToast("Export failed", "error");
    } finally {
      setExporting(false);
    }
  }

  const daily = useMemo(() => buildDailySeries(chart?.daily || []), [chart]);
  const dailyMax = useMemo(() => Math.max(1, ...daily.map((d) => d.count)), [daily]);
  const categoryRows = useMemo(
    () => (chart?.byCategory || []).map((c) => ({ key: c.category, label: CATEGORY_LABELS[c.category] || c.category, count: c.count })),
    [chart]
  );
  const catTotal = useMemo(() => categoryRows.reduce((sum, c) => sum + c.count, 0) || 1, [categoryRows]);
  const topZones = useMemo(
    () => (chart?.topZones || []).map((z) => ({ ...z, zone_name: String(z.zone_name || "").replace(/\s+/g, " ").trim() })),
    [chart]
  );
  const topMax = useMemo(() => Math.max(1, ...topZones.map((z) => z.count)), [topZones]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const detail = selected ? buildDetailSections(selected.payload || {}, selected) : null;

  return (
    <>
      <header style={s.header}>
        <div style={s.brand}>
          <img src="/logo/logo.webp" alt="Logo" style={s.logo} />
        </div>
        <h1 style={s.title}>Admin Dashboard</h1>
        <button onClick={handleLogout} style={s.logoutBtn}>
          Logout
        </button>
      </header>

      <div style={s.wrap}>
        {statsLoading && <p style={s.muted}>Loading…</p>}
      {error && <p style={s.error}>{error}</p>}

      {stats && (
        <>
          <div style={s.cards}>
            <StatCard label="Last 12 hours" value={stats.last12h} color="#6ba2d6" />
            <StatCard label="Last 24 hours" value={stats.last24h} color="#7fb0dd" />
            <StatCard label="Today" value={stats.today} color="#79b8c9" />
            <StatCard label="All Submissions" value={stats.total} color="#45688f" />
            <StatCard
              label="Since Last Export"
              value={stats.sinceLastExport}
              color="#2f9e7e"
              highlight={stats.sinceLastExport > 0}
            />
          </div>

          {stats.lastExportAt && (
            <p style={s.last}>Last export: {new Date(stats.lastExportAt).toLocaleString()}</p>
          )}

          <div style={s.charts}>
            <div style={{ ...s.chartCard, gridColumn: "1 / -1" }}>
              <h3 style={s.sectionTitle}>Submissions — last 14 days</h3>
              <div style={s.bars}>
                {daily.map((d) => (
                  <div key={d.key} style={s.barCol} title={`${d.key}: ${d.count}`}>
                    <span style={s.barValue}>{d.count > 0 ? d.count : ""}</span>
                    <div style={s.barTrack}>
                      <div style={{ ...s.barFill, height: `${Math.round((d.count / dailyMax) * 100)}%` }} />
                    </div>
                    <span style={s.barLabel}>{shortDay(d.key)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={s.chartCard}>
              <h3 style={s.sectionTitle}>By category</h3>
              {categoryRows.map((c) => (
                <div key={c.key} style={s.hRow}>
                  <span style={s.hLabel} title={c.label}>
                    {c.label}
                  </span>
                  <div style={s.hTrack}>
                    <div style={{ ...s.hFill, width: `${Math.round((c.count / catTotal) * 100)}%` }} />
                  </div>
                  <span style={s.hCount}>{c.count}</span>
                </div>
              ))}
              {categoryRows.length === 0 && <p style={s.muted}>No data yet.</p>}
            </div>

            <div style={s.chartCard}>
              <h3 style={s.sectionTitle}>Top zones</h3>
              {topZones.map((z) => (
                <div key={`${z.zone_no}-${z.zone_name}`} style={s.hRow}>
                  <span style={s.hLabel} title={z.zone_name}>
                    {z.zone_no} — {z.zone_name}
                  </span>
                  <div style={s.hTrack}>
                    <div style={{ ...s.hFill, width: `${Math.round((z.count / topMax) * 100)}%` }} />
                  </div>
                  <span style={s.hCount}>{z.count}</span>
                </div>
              ))}
              {topZones.length === 0 && <p style={s.muted}>No data yet.</p>}
            </div>
          </div>

          <div style={s.exportRow}>
            <select value={exportType} onChange={(e) => setExportType(e.target.value)} style={s.select}>
              <option value="all">All feedback types</option>
              <option value="pracharak-mahatma">Pracharak Mahatma</option>
              <option value="branch-incharge">Branch Incharge</option>
            </select>
            <select value={exportRange} onChange={(e) => setExportRange(e.target.value)} style={s.select}>
              <option value="all">All submissions</option>
              <option value="12h">Last 12 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="today">Today</option>
              <option value="since_last_export">Since last export</option>
            </select>
            <button onClick={handleExport} disabled={exporting} style={s.exportBtn}>
              {exporting ? "Downloading…" : "Download CSV"}
            </button>
          </div>

          <div style={s.toolbar}>
            <input
              type="search"
              placeholder="Search name, phone, zone…"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              style={s.search}
              aria-label="Search submissions"
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={s.select} aria-label="Filter by category">
              <option value="all">All categories</option>
              <option value="mahila">Mahila Samagam</option>
              <option value="bal">Bal Samagam</option>
              <option value="ems">EMS</option>
              <option value="branch-incharge">Branch Incharge</option>
            </select>
            <select value={zoneType} onChange={(e) => setZoneType(e.target.value)} style={s.select} aria-label="Filter by zone type">
              <option value="all">All zone types</option>
              <option value="general">General</option>
              <option value="special">Special</option>
            </select>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={s.select} aria-label="Rows per page">
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <span style={s.resultCount}>
              {total} result{total === 1 ? "" : "s"}
            </span>
          </div>

          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <SortHeader col="created_at" label="Time" sort={sort} order={order} onSort={handleSort} />
                  <SortHeader col="name" label="Name" sort={sort} order={order} onSort={handleSort} />
                  <SortHeader col="phone" label="Phone" sort={sort} order={order} onSort={handleSort} />
                  <SortHeader col="zone_no" label="Zone" sort={sort} order={order} onSort={handleSort} />
                  <th style={s.th}>Category</th>
                </tr>
              </thead>
              <tbody>
                {rowsLoading ? (
                  <tr>
                    <td colSpan={5} style={s.emptyCell}>
                      Loading…
                    </td>
                  </tr>
                ) : rowsError ? (
                  <tr>
                    <td colSpan={5} style={s.emptyCell}>
                      <span style={s.error}>{rowsError}</span>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={s.emptyCell}>
                      No submissions match. Try clearing the filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className="admin-tr"
                      style={s.tr}
                      tabIndex={0}
                      onClick={() => setSelected(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(row);
                        }
                      }}
                    >
                      <td style={s.td}>{formatDate(row.created_at)}</td>
                      <td style={s.td}>{row.name}</td>
                      <td style={s.td}>{row.phone}</td>
                      <td style={s.td}>
                        {row.zone_no} — {row.zone_name}
                      </td>
                      <td style={s.td}>{CATEGORY_LABELS[row.category] || row.category}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!rowsLoading && !rowsError && rows.length > 0 && (
            <div style={s.pager}>
              <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} className="admin-page-btn" style={s.pageBtn}>
                ← Prev
              </button>
              <span style={s.pageInfo}>
                Page {page} of {totalPages}
              </span>
              <button type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="admin-page-btn" style={s.pageBtn}>
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {toast && (
        <div style={toast.type === "error" ? s.toastError : s.toast} role="status">
          {toast.msg}
        </div>
      )}

      {selected && detail && (
        <div style={s.drawerWrap} role="dialog" aria-modal="true" aria-label="Submission details">
          <div style={s.drawerBackdrop} onClick={() => setSelected(null)} />
          <div style={s.drawer}>
            <div style={s.drawerHead}>
              <h2 style={s.drawerTitle}>Submission details</h2>
              <button type="button" onClick={() => setSelected(null)} style={s.drawerClose} aria-label="Close">
                ✕
              </button>
            </div>
            <div style={s.drawerBody}>
              <div style={s.metaGrid}>
                {detail.meta.map(([label, value]) => (
                  <div key={label} style={s.metaItem}>
                    <span style={s.metaLabel}>{label}</span>
                    <span style={s.metaValue}>{value || "—"}</span>
                  </div>
                ))}
              </div>
              {detail.answers.length > 0 && (
                <div style={s.answers}>
                  <h3 style={s.sectionTitle}>Feedback answers</h3>
                  {detail.answers.map(([label, value]) => (
                    <div key={label} style={s.answerRow}>
                      <span style={s.answerLabel}>{label}</span>
                      <span style={s.answerValue}>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

function StatCard({ label, value, color, highlight }) {
  return (
    <div
      style={{
        ...s.card,
        background: `linear-gradient(135deg, ${color}E6, ${color}99)`,
        ...(highlight ? { boxShadow: "0 0 0 3px rgba(47,158,126,0.35), 0 8px 24px rgba(96,136,172,0.12)" } : {}),
      }}
    >
      <div style={s.cardValue}>{value}</div>
      <div style={s.cardLabel}>{label}</div>
    </div>
  );
}

const s = {
  wrap: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "0 24px 60px",
    fontFamily: '"Inter", system-ui, sans-serif',
    color: "#33485e",
    minHeight: "100vh",
  },
  header: {
    position: "relative",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "14px 24px",
    marginBottom: 26,
  },
  brand: { display: "flex", alignItems: "center", gap: 16, flex: 1 },
  logo: { height: 52, width: "auto", objectFit: "contain", flexShrink: 0 },
  title: {
    margin: 0,
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: "clamp(1.6rem, 3vw, 2.4rem)",
    color: "#33485e",
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    whiteSpace: "nowrap",
  },
  logoutBtn: {
    padding: "10px 20px",
    border: "1px solid #c7d8e8",
    borderRadius: 999,
    background: "white",
    color: "#33485e",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "0.92rem",
  },
  muted: { color: "#5f7892" },
  last: { color: "#5f7892", fontSize: "0.9rem", marginBottom: 16 },
  error: { color: "#b91c1c", fontWeight: 600 },
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 },
  card: {
    background: "white",
    borderRadius: 20,
    padding: "22px 18px",
    border: "1px solid rgba(255,255,255,0.7)",
    boxShadow: "0 8px 24px rgba(96,136,172,0.12)",
  },
  cardValue: { fontSize: "2.2rem", fontWeight: 800, lineHeight: 1.2, color: "#ffffff" },
  cardLabel: { fontSize: "0.88rem", color: "rgba(255,255,255,0.95)", marginTop: 6, fontWeight: 600 },
  charts: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 24 },
  chartCard: {
    background: "white",
    border: "1px solid #d9e5f1",
    borderRadius: 20,
    padding: "18px 20px",
    boxShadow: "0 8px 24px rgba(96,136,172,0.08)",
    minWidth: 0,
  },
  sectionTitle: { margin: "0 0 14px", fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.02rem", color: "#33485e" },
  bars: { display: "flex", alignItems: "flex-end", gap: 4, height: 150 },
  barCol: { flex: "1 1 0", minWidth: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, height: "100%" },
  barValue: { fontSize: "0.72rem", color: "#5f7892", fontWeight: 700, lineHeight: 1 },
  barTrack: { width: "100%", maxWidth: 30, height: 104, background: "rgba(107,162,214,0.12)", borderRadius: 8, display: "flex", alignItems: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", minHeight: 2, borderRadius: 8, background: "linear-gradient(180deg, #91c7e6, #6ba2d6)" },
  barLabel: { fontSize: "0.66rem", color: "#5f7892", lineHeight: 1, whiteSpace: "nowrap" },
  hRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  hLabel: { width: 130, flexShrink: 0, fontSize: "0.85rem", color: "#33485e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 600 },
  hTrack: { flex: 1, height: 16, background: "rgba(107,162,214,0.12)", borderRadius: 8, overflow: "hidden" },
  hFill: { height: "100%", borderRadius: 8, background: "linear-gradient(90deg, #91c7e6, #6ba2d6)" },
  hCount: { width: 42, flexShrink: 0, textAlign: "right", fontWeight: 800, color: "#33485e", fontSize: "0.9rem" },
  exportRow: { display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" },
  toolbar: { display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap", alignItems: "center" },
  search: {
    minHeight: 46,
    padding: "10px 14px",
    border: "1px solid #c7d8e8",
    borderRadius: 14,
    background: "white",
    fontSize: "0.95rem",
    fontFamily: "inherit",
    color: "#33485e",
    flex: "1 1 220px",
    minWidth: 200,
  },
  select: {
    minHeight: 46,
    padding: "10px 14px",
    border: "1px solid #c7d8e8",
    borderRadius: 14,
    background: "white",
    fontSize: "0.95rem",
    fontFamily: "inherit",
    color: "#33485e",
  },
  resultCount: { marginLeft: "auto", color: "#5f7892", fontSize: "0.9rem", fontWeight: 600, whiteSpace: "nowrap" },
  exportBtn: {
    minHeight: 46,
    padding: "0 24px",
    border: 0,
    borderRadius: 999,
    fontWeight: 800,
    cursor: "pointer",
    color: "white",
    background: "linear-gradient(135deg, #6ba2d6, #91c7e6)",
    boxShadow: "0 12px 24px rgba(107,162,214,0.22)",
    fontFamily: "inherit",
    fontSize: "0.95rem",
  },
  tableWrap: { overflowX: "auto", borderRadius: 20, border: "1px solid #d9e5f1", background: "white" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" },
  th: {
    textAlign: "left",
    padding: "14px 16px",
    fontWeight: 700,
    borderBottom: "1px solid #d9e5f1",
    color: "#33485e",
    whiteSpace: "nowrap",
  },
  sortBtn: {
    border: 0,
    background: "transparent",
    padding: 0,
    font: "inherit",
    fontWeight: 700,
    color: "inherit",
    cursor: "pointer",
    fontSize: "0.92rem",
  },
  tr: {
    borderBottom: "1px solid rgba(217,229,241,0.5)",
    cursor: "pointer",
    outline: "none",
  },
  td: { padding: "12px 16px", whiteSpace: "nowrap" },
  emptyCell: { padding: "28px 16px", textAlign: "center", color: "#5f7892" },
  pager: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 18 },
  pageBtn: {
    minHeight: 40,
    padding: "0 18px",
    border: "1px solid #c7d8e8",
    borderRadius: 999,
    background: "white",
    color: "#33485e",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "0.9rem",
  },
  pageInfo: { color: "#5f7892", fontSize: "0.92rem", fontWeight: 600 },
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#2f9e7e",
    color: "white",
    padding: "12px 20px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: "0.95rem",
    boxShadow: "0 12px 30px rgba(47,158,126,0.35)",
    zIndex: 90,
  },
  toastError: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#b91c1c",
    color: "white",
    padding: "12px 20px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: "0.95rem",
    boxShadow: "0 12px 30px rgba(185,28,28,0.35)",
    zIndex: 90,
  },
  drawerWrap: { position: "fixed", inset: 0, zIndex: 70, display: "flex", justifyContent: "flex-end" },
  drawerBackdrop: { position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)" },
  drawer: {
    position: "relative",
    width: "min(560px, 100%)",
    height: "100%",
    background: "#ffffff",
    boxShadow: "-18px 0 60px rgba(15,23,42,0.2)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  drawerHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "18px 20px",
    borderBottom: "1px solid #d9e5f1",
    flexShrink: 0,
  },
  drawerTitle: { margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.3rem", color: "#33485e" },
  drawerClose: {
    width: 38,
    height: 38,
    border: 0,
    borderRadius: 999,
    background: "rgba(107,162,214,0.12)",
    color: "#33485e",
    fontSize: "1.1rem",
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  },
  drawerBody: { overflowY: "auto", padding: "20px", WebkitOverflowScrolling: "touch" },
  metaGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginBottom: 22 },
  metaItem: { display: "flex", flexDirection: "column", gap: 3 },
  metaLabel: { fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "#5f7892", fontWeight: 700 },
  metaValue: { fontSize: "0.98rem", color: "#33485e", fontWeight: 600, wordBreak: "break-word" },
  answers: { borderTop: "1px solid #d9e5f1", paddingTop: 18 },
  answerRow: {
    display: "grid",
    gridTemplateColumns: "minmax(140px, 40%) 1fr",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid rgba(217,229,241,0.6)",
    alignItems: "start",
  },
  answerLabel: { fontSize: "0.9rem", color: "#5f7892", fontWeight: 600, lineHeight: 1.45 },
  answerValue: { fontSize: "0.98rem", color: "#1f2d3d", lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap" },
};
