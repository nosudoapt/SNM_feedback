"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

const CATEGORY_LABELS = {
  mahila: "Mahila Samagam",
  bal: "Bal Samagam",
  ems: "EMS",
  "branch-incharge": "Branch Incharge",
  "gbm-ebm": "GBM / EBM Registration",
};

const VIEWS = [
  { id: "dashboard", label: "Dashboard", sub: "Overview of all feedback and registrations" },
  { id: "gbm-ebm", label: "GBM Registrations", sub: "Row-wise registration data, attendance and exports" },
  { id: "branch-incharge", label: "Branch Incharge", sub: "Review feedback and filter negative responses" },
  { id: "pracharak-mahatma", label: "Pracharak Mahatma", sub: "Review feedback and filter negative responses" },
];

const svgProps = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };

const NAV_ICONS = {
  dashboard: (
    <svg {...svgProps}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
  ),
  "gbm-ebm": (
    <svg {...svgProps}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
  ),
  "branch-incharge": (
    <svg {...svgProps}><path d="M3 21h18" /><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></svg>
  ),
  "pracharak-mahatma": (
    <svg {...svgProps}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></svg>
  ),
};

const IconLogout = (
  <svg {...svgProps}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
);

const IconCheck = (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
);

const IconSearch = (
  <svg {...svgProps}><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
);

const ICON_CLOCK = (
  <svg {...svgProps}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const ICON_CAL = (
  <svg {...svgProps}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
);
const ICON_ALL = (
  <svg {...svgProps}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
);
const ICON_EXPORT = (
  <svg {...svgProps}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></svg>
);

const NEGATIVE_FILTERS = {
  "pracharak-mahatma": [
    { id: "sound", label: "Sound needs improvement" },
    { id: "clarity-no", label: "Message clarity: No" },
    { id: "content-apt-no", label: "Content apt: No" },
    { id: "overall-negative", label: "Negative overall rating" },
    { id: "program-issues", label: "Program issues reported" },
  ],
  "branch-incharge": [
    { id: "arrival-late", label: "Arrived late" },
    { id: "conduct-not-good", label: "Conduct average/poor" },
  ],
  "gbm-ebm": [{ id: "not-available", label: "Not available for 79th Samagam" }],
};

const FIELD_LABELS = {
  balAge: "Age group(s) participated (Bal)",
  mahilaLocation: "Where was the Satsang arranged?",
  balLocation: "Where was the Satsang arranged?",
  emsLocation: "Where was the Satsang arranged?",
  mahilaSound: "Was the sound & mic quality good?",
  balSound: "Was the sound & mic quality good?",
  emsSound: "Was the sound & mic quality good?",
  mahilaBanner: "Was the particular banner/backdrop installed?",
  balBanner: "Was the particular banner/backdrop installed?",
  emsBanner: "Was the particular banner/backdrop installed?",
  mahilaScripture: "Was the content of the speakers strong?",
  balScripture: "Was the content of the speakers strong?",
  emsScripture: "Was the content of the speakers strong?",
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
  fullName: "Full name",
  mobile: "Mobile number",
  email: "Email",
  branch: "Branch",
  sewa: "Sewa / Category",
  available79thSamagam: "Available for attending the meeting in 79th Samagam",
  emsContent: "Ratio of English & Hindi in the Vichar (Branch)",
  balContent: "Used child-friendly (Bal) examples for kids",
  mahilaContent: "Used broader aspects & relevant women examples",
  emsContentRatio: "Ratio of English & Hindi in the Vichar (EMS)",
  emsMessageStrong: "Was the message of the Mission strong (prabhavshaali)?",
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
  "lack-of-clarity": "Was there a lack of clarity?",
  "lack-of-mission-ideology": "Was the mission ideology not clear?",
  "lack-of-authenticity": "Was there a lack of authenticity?",
  "speaker-list-exceeded": "Was the speaker list exceeded?",
  "more-than-2-incharges-vote-of-thanks": "Did more than 1 Mahatma give vote of thanks at the end?",
  "last-speech-over-10-min": "Did the last speaker take more than 10 min?",
  "program-started-late": "Did the program start late?",
  "overall-very-good": "Overall very good",
  "well-organised-coordinated": "Well organised & coordinated",
  "good-efforts": "Good efforts",
  "scope-of-improvement": "Could be even better",
  "no-zeal-in-satsang": "Efforts were not clearly visible",
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
  poor: "Needs improvement",
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
  const [attendanceSyncText, setAttendanceSyncText] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("dashboard");
  const [negFilters, setNegFilters] = useState([]);

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
      const effectiveCategory = view === "dashboard" ? category : view;
      const params = new URLSearchParams({
        q,
        category: effectiveCategory,
        zoneType,
        sort,
        order,
        page: String(page),
        limit: String(limit),
      });
      if (negFilters.length) params.set("neg", negFilters.join(","));
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
  }, [q, category, view, negFilters, zoneType, sort, order, page, limit, router]);

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
  }, [q, category, zoneType, limit, view, negFilters]);

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

  function handleAttendanceFile() {
    window.open("/api/attendance/file", "_blank");
  }

  function toggleNegFilter(id) {
    setNegFilters((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleAttendanceSync() {
    setSyncing(true);
    try {
      let marks = [];
      try {
        const parsed = JSON.parse(attendanceSyncText.trim());
        if (Array.isArray(parsed)) marks = parsed;
        else if (Array.isArray(parsed.marks)) marks = parsed.marks;
      } catch {
        showToast("Invalid sync code — paste the copied JSON as-is", "error");
        return;
      }
      if (!marks.length) {
        showToast("No marks found in the sync code", "error");
        return;
      }
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marks }),
      });
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Attendance sync failed", "error");
        return;
      }
      showToast(`${data.updated} attendance mark${data.updated === 1 ? "" : "s"} saved`);
      setAttendanceSyncText("");
      fetchStats();
      fetchRows();
    } finally {
      setSyncing(false);
    }
  }

  async function handleExport(typeOverride) {
    setExporting(true);
    const type = typeOverride || exportType;
    try {
      const res = await fetch(`/api/export?range=${exportRange}&type=${type}`);
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
      a.download = `submissions-${type}-${exportRange}-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const currentView = VIEWS.find((v) => v.id === view) || VIEWS[0];

  return (
    <div className="admin-shell" style={s.shell}>
      <aside className="admin-sidebar" style={s.sidebar}>
        <div style={s.sideBrand}>
          <img src="/logo/logo.webp" alt="Logo" style={s.logo} />
          <span className="side-brand-text" style={s.sideBrandText}>SNM Admin</span>
        </div>
        <nav style={s.nav}>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              title={v.label}
              className="admin-nav-item" style={{ ...s.navItem, ...(view === v.id ? s.navItemActive : {}) }}
            >
              <span style={s.navIcon}>{NAV_ICONS[v.id]}</span>
              <span className="nav-label">{v.label}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="admin-nav-item side-logout" onClick={handleLogout} style={{ ...(s.navItem), color: "#B91C1C" }}>
          <span style={s.navIcon}>{IconLogout}</span>
          <span className="nav-label">Logout</span>
        </button>
      </aside>

      <main className="admin-main" style={s.mainWrap}>
        <header style={s.topbar}>
          <div>
            <h1 style={s.title}>{currentView.label}</h1>
            <p style={s.topbarSub}>{currentView.sub}</p>
          </div>
        </header>

      <div style={s.wrap}>

        {statsLoading && <p style={s.muted}>Loading…</p>}
      {error && <p style={s.error}>{error}</p>}

      {view === "dashboard" && stats && (
        <>
          <div style={s.cards}>
            <StatCard label="Last 12 hours" value={stats.last12h} color="#2563EB" icon={ICON_CLOCK} />
            <StatCard label="Last 24 hours" value={stats.last24h} color="#0891B2" icon={ICON_CLOCK} />
            <StatCard label="Today" value={stats.today} color="#7C3AED" icon={ICON_CAL} />
            <StatCard label="All Submissions" value={stats.total} color="#1D4ED8" icon={ICON_ALL} />
            <StatCard
              label="Since Last Export"
              value={stats.sinceLastExport}
              color="#059669"
              icon={ICON_EXPORT}
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
              <option value="gbm-ebm">GBM / EBM Registration</option>
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
            <button onClick={handleAttendanceFile} style={s.exportBtn} title="Offline attendance file for volunteers' phones">
              Attendance file
            </button>
          </div>

          <div style={{ ...s.exportRow, alignItems: "flex-start" }}>
            <textarea
              placeholder="Paste a volunteer's attendance sync code here (JSON) and click Sync"
              value={attendanceSyncText}
              onChange={(e) => setAttendanceSyncText(e.target.value)}
              style={{ ...s.search, minHeight: 44, height: 44, paddingTop: 10, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
              aria-label="Attendance sync code"
            />
            <button onClick={handleAttendanceSync} disabled={syncing || !attendanceSyncText.trim()} style={s.exportBtn}>
              {syncing ? "Syncing…" : "Sync"}
            </button>
          </div>
        </>
      )}

      {view !== "dashboard" && (
        <>
          <h2 style={s.viewTitle}>{CATEGORY_LABELS[view] || view}</h2>

          {(NEGATIVE_FILTERS[view] || []).length > 0 && (
            <div style={s.chipRow}>
              <span style={s.chipRowLabel}>Show only negative:</span>
              {(NEGATIVE_FILTERS[view] || []).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggleNegFilter(f.id)}
                  className="admin-chip"
                  style={{ ...s.chip, ...(negFilters.includes(f.id) ? s.chipActive : {}) }}
                >
                  <span style={negFilters.includes(f.id) ? s.chipCheckOn : s.chipCheck}>
                    {negFilters.includes(f.id) ? IconCheck : null}
                  </span>
                  {f.label}
                </button>
              ))}
              {negFilters.length > 0 && (
                <button type="button" onClick={() => setNegFilters([])} style={s.chipClear}>
                  Clear ✕
                </button>
              )}
            </div>
          )}

          <div style={s.toolbar}>
            <div style={s.searchWrap}>
              <span style={s.searchIcon}>{IconSearch}</span>
              <input
                type="search"
                placeholder="Search name, phone, zone…"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                style={s.search}
                aria-label="Search submissions"
              />
            </div>
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

          {view === "gbm-ebm" ? (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Reg No</th>
                    <SortHeader col="name" label="Name" sort={sort} order={order} onSort={handleSort} />
                    <SortHeader col="phone" label="Phone" sort={sort} order={order} onSort={handleSort} />
                    <th style={s.th}>Branch</th>
                    <SortHeader col="zone_no" label="Zone" sort={sort} order={order} onSort={handleSort} />
                    <th style={s.th}>Sewa</th>
                    <th style={s.th}>79th Samagam</th>
                    <SortHeader col="created_at" label="Time" sort={sort} order={order} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {rowsLoading ? (
                    <tr><td colSpan={8} style={s.emptyCell}>Loading…</td></tr>
                  ) : rowsError ? (
                    <tr><td colSpan={8} style={s.emptyCell}><span style={s.error}>{rowsError}</span></td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={8} style={s.emptyCell}>No registrations match.</td></tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="admin-tr" style={s.tr} tabIndex={0}
                        onClick={() => setSelected(row)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(row); } }}
                      >
                        <td style={{ ...s.td, fontWeight: 800 }}>{row.reg_no || "—"}</td>
                        <td style={s.td}>{row.name}</td>
                        <td style={s.td}>{row.phone}</td>
                        <td style={s.td}>{(row.payload && row.payload.branch) || "—"}</td>
                        <td style={s.td}>{row.zone_no} — {row.zone_name}{row.sector_name ? ` / ${row.sector_name}` : ""}</td>
                        <td style={s.td}>{(row.payload && row.payload.sewa) || "—"}</td>
                        <td style={s.td}>
                          {(row.payload && row.payload.available79thSamagam) === "no" ? (
                            <span style={s.negBadge}>No</span>
                          ) : (
                            <span style={s.posBadge}>Yes</span>
                          )}
                        </td>
                        <td style={s.td}>{formatDate(row.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <SortHeader col="created_at" label="Time" sort={sort} order={order} onSort={handleSort} />
                    <SortHeader col="name" label="Name" sort={sort} order={order} onSort={handleSort} />
                    <SortHeader col="phone" label="Phone" sort={sort} order={order} onSort={handleSort} />
                    <SortHeader col="zone_no" label="Zone" sort={sort} order={order} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {rowsLoading ? (
                    <tr><td colSpan={4} style={s.emptyCell}>Loading…</td></tr>
                  ) : rowsError ? (
                    <tr><td colSpan={4} style={s.emptyCell}><span style={s.error}>{rowsError}</span></td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={4} style={s.emptyCell}>No submissions match.</td></tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="admin-tr" style={s.tr} tabIndex={0}
                        onClick={() => setSelected(row)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(row); } }}
                      >
                        <td style={s.td}>{formatDate(row.created_at)}</td>
                        <td style={s.td}>{row.name}</td>
                        <td style={s.td}>{row.phone}</td>
                        <td style={s.td}>{row.zone_no} — {row.zone_name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

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

      {view === "gbm-ebm" && (
            <div style={s.exportRow}>
              <button onClick={() => handleExport("gbm-ebm")} disabled={exporting} style={s.exportBtn}>
                {exporting ? "Downloading…" : "Download CSV"}
              </button>
              <button onClick={handleAttendanceFile} style={s.exportBtn} title="Offline attendance file for volunteers' phones">
                Attendance file
              </button>
              <textarea
                placeholder="Paste attendance sync code (JSON)"
                value={attendanceSyncText}
                onChange={(e) => setAttendanceSyncText(e.target.value)}
                style={{ ...s.search, height: 44, paddingTop: 10, resize: "vertical", fontFamily: "monospace", fontSize: 12, flex: "1 1 260px" }}
                aria-label="Attendance sync code"
              />
              <button onClick={handleAttendanceSync} disabled={syncing || !attendanceSyncText.trim()} style={s.exportBtn}>
                {syncing ? "Syncing…" : "Sync"}
              </button>
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

      {toast && (
        <div style={toast.type === "error" ? s.toastError : s.toast} role="status">
          {toast.msg}
        </div>
      )}
      </div>
    </main>
    </div>
  );
}

function StatCard({ label, value, color, icon, highlight }) {
  return (
    <div
      className="stat-card"
      style={{
        ...s.card,
        ...(highlight
          ? { borderColor: "rgba(47,158,126,0.5)", boxShadow: "0 6px 20px rgba(47,158,126,0.16)" }
          : {}),
      }}
    >
      <span style={{ ...s.cardIcon, background: `${color}14`, color }}>{icon}</span>
      <div>
        <div style={s.cardValue}>{value}</div>
        <div style={s.cardLabel}>{label}</div>
      </div>
    </div>
  );
}

const s = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: '"Inter", system-ui, sans-serif',
    color: "#1f2937",
    background: "#F8FAFC",
  },

  // ---------- Sidebar ----------
  sidebar: {
    width: 248,
    flexShrink: 0,
    position: "sticky",
    top: 0,
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#FFFFFF",
    borderRight: "1px solid #E5EAF1",
    padding: "20px 14px",
    gap: 6,
  },
  sideBrand: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "6px 10px 16px",
    borderBottom: "1px solid #EEF2F7",
    marginBottom: 14,
  },
  sideBrandText: {
    fontWeight: 800,
    fontSize: "0.98rem",
    color: "#0F172A",
    letterSpacing: "-0.01em",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  },
  logo: {
    height: 38,
    width: 38,
    objectFit: "contain",
    borderRadius: 10,
    background: "#F1F5F9",
    border: "1px solid #E5EAF1",
    padding: 3,
  },
  nav: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    border: 0,
    background: "transparent",
    color: "#475569",
    fontSize: "0.92rem",
    fontWeight: 600,
    fontFamily: "inherit",
    textAlign: "left",
    padding: "11px 14px",
    borderRadius: 12,
    cursor: "pointer",
    transition: "background 150ms ease, color 150ms ease",
    whiteSpace: "nowrap",
  },
  navItemActive: {
    background: "#EAF0FE",
    color: "#1D4ED8",
  },
  navIcon: { display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sideLogout: { color: "#B91C1C" },

  // ---------- Main ----------
  mainWrap: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
  topbar: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    background: "rgba(248,250,252,0.88)",
    backdropFilter: "blur(8px)",
    borderBottom: "1px solid #E5EAF1",
    padding: "16px 32px 14px",
  },
  title: { margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em" },
  topbarSub: { margin: "3px 0 0", fontSize: "0.85rem", color: "#64748B" },
  wrap: { maxWidth: 1180, width: "100%", margin: "0 auto", padding: "26px 32px 70px" },

  muted: { color: "#64748B" },
  error: { color: "#DC2626" },
  last: { marginTop: -6, marginBottom: 18, fontSize: "0.82rem", color: "#94A3B8" },

  // ---------- KPI cards ----------
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 22 },
  card: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "#FFFFFF",
    border: "1px solid #E5EAF1",
    borderRadius: 16,
    padding: "16px 18px",
    transition: "box-shadow 180ms ease, transform 180ms ease",
  },
  cardIcon: {
    width: 42,
    height: 42,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    fontWeight: 800,
    fontSize: "1rem",
  },
  cardValue: { fontSize: "1.55rem", fontWeight: 800, color: "#0F172A", lineHeight: 1.15, fontVariantNumeric: "tabular-nums" },
  cardLabel: { fontSize: "0.78rem", color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" },

  // ---------- Charts ----------
  charts: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 24 },
  chartCard: {
    background: "#FFFFFF",
    border: "1px solid #E5EAF1",
    borderRadius: 16,
    padding: "18px 20px",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    minWidth: 0,
  },
  sectionTitle: { margin: "0 0 14px", fontSize: "0.95rem", fontWeight: 700, color: "#334155" },
  bars: { display: "flex", alignItems: "flex-end", gap: 4, height: 140 },
  barCol: { flex: "1 1 0", minWidth: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, height: "100%" },
  barValue: { fontSize: "0.68rem", color: "#64748B", fontWeight: 700, lineHeight: 1 },
  barTrack: { width: "100%", maxWidth: 28, height: 96, background: "#EEF2F7", borderRadius: 7, display: "flex", alignItems: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", minHeight: 2, borderRadius: 7, background: "linear-gradient(180deg, #3B82F6, #1D4ED8)" },
  barLabel: { fontSize: "0.62rem", color: "#94A3B8", lineHeight: 1, whiteSpace: "nowrap" },
  hRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  hLabel: { width: 130, flexShrink: 0, fontSize: "0.83rem", color: "#334155", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 600 },
  hTrack: { flex: 1, height: 14, background: "#EEF2F7", borderRadius: 999, overflow: "hidden" },
  hFill: { height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #60A5FA, #2563EB)" },
  hCount: { width: 42, flexShrink: 0, textAlign: "right", fontWeight: 800, color: "#334155", fontSize: "0.86rem", fontVariantNumeric: "tabular-nums" },

  // ---------- Controls ----------
  exportRow: { display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" },
  toolbar: { display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" },
  searchWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    flex: "1 1 260px",
    minWidth: 220,
  },
  searchIcon: {
    position: "absolute",
    left: 13,
    display: "inline-flex",
    color: "#94A3B8",
    pointerEvents: "none",
  },
  search: {
    width: "100%",
    minHeight: 44,
    paddingLeft: 40,
    paddingRight: 14,
    border: "1px solid #DBE3EC",
    borderRadius: 12,
    background: "#FFFFFF",
    fontSize: "0.92rem",
    fontFamily: "inherit",
    color: "#1F2937",
    outline: "none",
    transition: "border-color 140ms ease, box-shadow 140ms ease",
  },
  select: {
    minHeight: 44,
    padding: "9px 13px",
    border: "1px solid #DBE3EC",
    borderRadius: 12,
    background: "#FFFFFF",
    fontSize: "0.92rem",
    fontFamily: "inherit",
    color: "#1F2937",
    cursor: "pointer",
  },
  resultCount: { marginLeft: "auto", color: "#64748B", fontSize: "0.86rem", fontWeight: 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  exportBtn: {
    minHeight: 44,
    padding: "0 20px",
    border: "1px solid transparent",
    borderRadius: 12,
    fontWeight: 700,
    cursor: "pointer",
    color: "#FFFFFF",
    background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
    boxShadow: "0 2px 8px rgba(29,78,216,0.28)",
    fontFamily: "inherit",
    fontSize: "0.9rem",
    transition: "filter 140ms ease, transform 140ms ease",
  },

  // ---------- Filter chips (Material-style) ----------
  viewTitle: { display: "none" },
  chipRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  chipRowLabel: { fontSize: "0.74rem", fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    border: "1px solid #D5DEE9",
    background: "#FFFFFF",
    color: "#3B4A5C",
    fontWeight: 600,
    fontSize: "0.86rem",
    padding: "8px 15px",
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 160ms ease",
    boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
  },
  chipActive: {
    background: "#1D4ED8",
    borderColor: "#1D4ED8",
    color: "#FFFFFF",
    fontWeight: 700,
    boxShadow: "0 3px 10px rgba(29,78,216,0.32)",
  },
  chipCheck: {
    display: "none",
  },
  chipCheckOn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 16,
    height: 16,
    borderRadius: 999,
    background: "rgba(255,255,255,0.25)",
    color: "#fff",
  },
  chipCheckOn: {},
  chipClear: {
    border: 0,
    background: "transparent",
    color: "#64748B",
    fontWeight: 700,
    fontSize: "0.82rem",
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: "inherit",
  },

  // ---------- Table ----------
  tableWrap: {
    overflowX: "auto",
    borderRadius: 16,
    border: "1px solid #E5EAF1",
    background: "#FFFFFF",
    boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" },
  th: {
    textAlign: "left",
    padding: "13px 16px",
    fontWeight: 700,
    fontSize: "0.72rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#64748B",
    background: "#F8FAFC",
    borderBottom: "1px solid #E5EAF1",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
  },
  sortBtn: {
    border: 0,
    background: "transparent",
    padding: 0,
    font: "inherit",
    color: "inherit",
    fontWeight: "inherit",
    letterSpacing: "inherit",
    textTransform: "inherit",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
  td: { padding: "13px 16px", borderBottom: "1px solid #F1F5F9", color: "#1F2937", verticalAlign: "middle" },
  tr: { cursor: "pointer", transition: "background 120ms ease" },
  emptyCell: { padding: "36px 18px", textAlign: "center", color: "#64748B" },
  negBadge: {
    display: "inline-block",
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#B91C1C",
    fontWeight: 700,
    fontSize: "0.76rem",
    padding: "3px 11px",
    borderRadius: 999,
  },
  posBadge: {
    display: "inline-block",
    background: "#F0FDF4",
    border: "1px solid #BBF7D0",
    color: "#15803D",
    fontWeight: 700,
    fontSize: "0.76rem",
    padding: "3px 11px",
    borderRadius: 999,
  },

  // ---------- Pager / toast / drawer ----------
  pager: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 18 },
  pageInfo: { color: "#64748B", fontSize: "0.88rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  pageBtn: {
    minHeight: 38,
    padding: "0 18px",
    border: "1px solid #DBE3EC",
    borderRadius: 10,
    background: "#FFFFFF",
    color: "#334155",
    fontWeight: 700,
    fontSize: "0.88rem",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 140ms ease",
  },
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#0F172A",
    color: "#fff",
    padding: "12px 22px",
    borderRadius: 12,
    fontSize: "0.9rem",
    fontWeight: 600,
    zIndex: 100,
    boxShadow: "0 10px 30px rgba(15,23,42,0.3)",
  },
  toastError: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#DC2626",
    color: "#fff",
    padding: "12px 22px",
    borderRadius: 12,
    fontSize: "0.9rem",
    fontWeight: 600,
    zIndex: 100,
    boxShadow: "0 10px 30px rgba(220,38,38,0.35)",
  },
  drawerWrap: { position: "fixed", inset: 0, zIndex: 90, display: "flex", justifyContent: "flex-end" },
  drawerBackdrop: { position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" },
  drawer: {
    position: "relative",
    width: "min(480px, 94vw)",
    height: "100%",
    background: "#FFFFFF",
    boxShadow: "-18px 0 50px rgba(15,23,42,0.18)",
    display: "flex",
    flexDirection: "column",
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    animation: "drawerIn 240ms cubic-bezier(0.22, 1, 0.36, 1)",
  },
  drawerHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 22px",
    borderBottom: "1px solid #EEF2F7",
  },
  drawerTitle: { margin: 0, fontSize: "1.12rem", fontWeight: 800, color: "#0F172A" },
  drawerClose: {
    width: 36,
    height: 36,
    border: 0,
    borderRadius: 999,
    background: "#F1F5F9",
    color: "#334155",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 140ms ease",
  },
  drawerBody: { overflowY: "auto", padding: "20px 22px", WebkitOverflowScrolling: "touch" },
  metaGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginBottom: 22 },
  metaItem: { display: "flex", flexDirection: "column", gap: 3 },
  metaLabel: { fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#94A3B8", fontWeight: 700 },
  metaValue: { fontSize: "0.93rem", color: "#1F2937", fontWeight: 600, wordBreak: "break-word" },
  answers: { borderTop: "1px solid #EEF2F7", paddingTop: 16 },
  answerRow: {
    display: "grid",
    gridTemplateColumns: "minmax(140px, 42%) 1fr",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid #F6F8FB",
    alignItems: "start",
  },
  answerLabel: { fontSize: "0.86rem", color: "#64748B", fontWeight: 600, lineHeight: 1.45 },
  answerValue: { fontSize: "0.93rem", color: "#0F172A", lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap" },
};


