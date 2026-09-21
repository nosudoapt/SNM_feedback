"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKS = [1, 2, 3, 4, 5];
const TIME_TYPES = [{ value: "M", label: "Morning" }, { value: "E", label: "Evening" }];
const TIME_LABEL = { M: "Morning", E: "Evening" };

const RATING_META = {
  1: { label: "Tier 1", full: "Tier 1 · Senior", color: "#4338CA", bg: "#EEF2FF", border: "#C7D2FE" },
  2: { label: "Tier 2", full: "Tier 2 · Mid", color: "#0F766E", bg: "#F0FDFA", border: "#99F6E4" },
  3: { label: "Tier 3", full: "Tier 3 · Newer", color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
};

const DUTY_VIEWS = [
  { id: "lists", label: "Duty Lists", sub: "Generate a monthly duty list, review and adjust assignments, commit and export" },
  { id: "branches", label: "Branches", sub: "Branch master data — location, tier requirements, specialization needs, Sunday/Saturday requirements" },
  { id: "satsangs", label: "Satsang Master", sub: "Satsang locations, weekly schedule, ratings and predefined local pracharaks" },
  { id: "pracharaks", label: "Pracharak Master", sub: "Pracharaks, capability ratings, monthly targets and CSV bulk import" },
  { id: "preferences", label: "Preferences", sub: "Each pracharak's preferred areas, days, weeks of month and times" },
  { id: "validate", label: "Data Quality", sub: "Validate pracharak data, branch coverage, and find missing or duplicate records" },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const svgProps = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };

const NAV_ICONS = {
  lists: (
    <svg {...svgProps}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 16 2 2 4-4" /></svg>
  ),
  branches: (
    <svg {...svgProps}><path d="M3 21h18" /><path d="M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></svg>
  ),
  satsangs: (
    <svg {...svgProps}><path d="M3 21h18" /><path d="M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></svg>
  ),
  pracharaks: (
    <svg {...svgProps}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  preferences: (
    <svg {...svgProps}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" /></svg>
  ),
  validate: (
    <svg {...svgProps}><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 1 0 20" /></svg>
  ),
};

const IconBack = (<svg {...svgProps}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>);
const IconLogout = (<svg {...svgProps}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>);
const IconSearch = (<svg {...svgProps}><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>);
const IconPlus = (<svg {...svgProps}><path d="M12 5v14M5 12h14" /></svg>);
const IconUpload = (<svg {...svgProps}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></svg>);
const IconTrash = (<svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>);
const IconCopy = (<svg {...svgProps}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>);
const IconDownload = (<svg {...svgProps}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>);
const IconRefresh = (<svg {...svgProps}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>);
const IconCheck = (<svg {...svgProps}><path d="M20 6 9 17l-5-5" /></svg>);

function ratingBadge(r) {
  const m = RATING_META[r] || RATING_META[2];
  return (
    <span style={{ ...s.tag, background: m.bg, borderColor: m.border, color: m.color }}>{m.full}</span>
  );
}

function statusBadge(active) {
  return active ? (
    <span style={{ ...s.tag, background: "#F0FDF4", borderColor: "#BBF7D0", color: "#15803D" }}>Active</span>
  ) : (
    <span style={{ ...s.tag, background: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }}>Inactive</span>
  );
}

function toggleInArray(arr, value) {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

function SortHeader({ col, label, sort, order, onSort }) {
  const active = sort === col;
  return (
    <th aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"} style={s.th}>
      <button type="button" onClick={() => onSort(col)} style={s.sortBtn}>
        {label}
        {active ? (order === "asc" ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
}

// Reusable searchable pracharak picker (used by Preferences picker + copy source).
function PracharakSearchSelect({ placeholder, excludeId, onSelect, router }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/duty/pracharaks?q=${encodeURIComponent(q)}&limit=20&sort=name&order=asc`);
        if (res.status === 401) { router.push("/admin/login"); return; }
        const data = await res.json();
        setResults((data.rows || []).filter((r) => r.id !== excludeId));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, open, excludeId, router]);

  return (
    <div style={{ position: "relative" }}>
      <div style={s.searchWrap}>
        <span style={s.searchIcon}>{IconSearch}</span>
        <input
          type="search"
          placeholder={placeholder || "Search pracharak by name or contact…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          style={s.search}
        />
      </div>
      {open && (
        <div style={s.pickerResults}>
          {loading ? (
            <div style={s.pickerEmpty}>Searching…</div>
          ) : results.length === 0 ? (
            <div style={s.pickerEmpty}>No pracharaks found.</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                style={s.pickerItem}
                onClick={() => { onSelect(r); setOpen(false); setQ(""); }}
              >
                <span style={{ fontWeight: 700 }}>{r.name}</span>
                <span style={s.pickerMeta}>{r.contact || "—"} · {RATING_META[r.rating]?.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function DutyAdmin() {
  const router = useRouter();
  const [view, setView] = useState("lists");
  const [sectors, setSectors] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const loadSectors = useCallback(async () => {
    try {
      const res = await fetch("/api/duty/sectors");
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json();
      setSectors(data.sectors || []);
    } catch {
      showToast("Could not load sectors", "error");
    }
  }, [router, showToast]);

  useEffect(() => { loadSectors(); }, [loadSectors]);

  const sectorsById = useMemo(() => {
    const m = {};
    sectors.forEach((sec) => { m[sec.id] = sec; });
    return m;
  }, [sectors]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  const current = DUTY_VIEWS.find((v) => v.id === view) || DUTY_VIEWS[0];

  return (
    <div className="admin-shell" style={s.shell}>
      <aside className="admin-sidebar" style={s.sidebar}>
        <div style={s.sideBrand}>
          <img src="/logo/logo.webp" alt="Logo" style={s.logo} />
          <span className="side-brand-text" style={s.sideBrandText}>Duty Roster</span>
        </div>
        <nav style={s.nav}>
          {DUTY_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              title={v.label}
              className="admin-nav-item"
              style={{ ...s.navItem, ...(view === v.id ? s.navItemActive : {}) }}
            >
              <span style={s.navIcon}>{NAV_ICONS[v.id]}</span>
              <span className="nav-label">{v.label}</span>
            </button>
          ))}
        </nav>
        <a href="/admin" className="admin-nav-item" style={{ ...s.navItem, textDecoration: "none" }}>
          <span style={s.navIcon}>{IconBack}</span>
          <span className="nav-label">Back to Admin</span>
        </a>
        <button type="button" className="admin-nav-item" onClick={handleLogout} style={{ ...s.navItem, color: "#B91C1C" }}>
          <span style={s.navIcon}>{IconLogout}</span>
          <span className="nav-label">Logout</span>
        </button>
      </aside>

      <main className="admin-main" style={s.mainWrap}>
        <header style={s.topbar}>
          <div>
            <h1 style={s.title}>{current.label}</h1>
            <p style={s.topbarSub}>{current.sub}</p>
          </div>
        </header>

        <div style={s.wrap}>
          {view === "lists" && (
            <DutyLists sectors={sectors} sectorsById={sectorsById} showToast={showToast} router={router} />
          )}
          {view === "branches" && (
            <BranchMaster sectors={sectors} sectorsById={sectorsById} showToast={showToast} router={router} />
          )}
          {view === "satsangs" && (
            <SatsangMaster sectors={sectors} sectorsById={sectorsById} showToast={showToast} router={router} />
          )}
          {view === "pracharaks" && (
            <PracharakMaster sectors={sectors} sectorsById={sectorsById} showToast={showToast} router={router} />
          )}
          {view === "preferences" && (
            <PreferencesManager sectors={sectors} sectorsById={sectorsById} showToast={showToast} router={router} />
          )}
          {view === "validate" && (
            <DataQuality showToast={showToast} router={router} />
          )}
        </div>
      </main>

      {toast && (
        <div style={toast.type === "error" ? s.toastError : s.toast} role="status">{toast.msg}</div>
      )}
    </div>
  );
}

/* ============================ DUTY LISTS ============================ */
const REASON_META = {
  predefined_local: { label: "Predefined local", color: "#0F766E", bg: "#F0FDFA", border: "#99F6E4" },
  scored: { label: "Auto-assigned", color: "#4338CA", bg: "#EEF2FF", border: "#C7D2FE" },
  manual_override: { label: "Manual pick", color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  manual_clear: { label: "Cleared", color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
  huzoor_discourse: { label: "Huzoor Discourse", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  unfilled: { label: "Unfilled", color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
};

function monthLabel(m, y) {
  const name = MONTHS[(Number(m) || 1) - 1] || "";
  return `${name} ${y}`;
}

function fmtDutyDate(d) {
  if (!d) return "—";
  const str = typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const [y, m, day] = str.split("-").map(Number);
  if (!y || !m || !day) return str;
  const dt = new Date(Date.UTC(y, m - 1, day));
  return `${DAY_SHORT[dt.getUTCDay()]} ${day} ${MONTHS[m - 1].slice(0, 3)}`;
}

function fmtShortDate(d) {
  if (!d) return "—";
  const str = typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const [y, m, day] = str.split("-").map(Number);
  if (!y || !m || !day) return str;
  return `${day} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

function daysSince(d) {
  if (!d) return Infinity;
  const str = typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const [y, m, day] = str.split("-").map(Number);
  if (!y || !m || !day) return Infinity;
  const then = Date.UTC(y, m - 1, day);
  const now = Date.now();
  return Math.floor((now - then) / (24 * 60 * 60 * 1000));
}

function reasonPill(code) {
  const meta = REASON_META[code] || { label: code || "—", color: "#475569", bg: "#F1F5F9", border: "#E2E8F0" };
  return <span style={{ ...s.tag, background: meta.bg, borderColor: meta.border, color: meta.color }}>{meta.label}</span>;
}

function listStatusBadge(status) {
  return status === "committed" ? (
    <span style={{ ...s.tag, background: "#F0FDF4", borderColor: "#BBF7D0", color: "#15803D" }}>Committed</span>
  ) : (
    <span style={{ ...s.tag, background: "#FFF7ED", borderColor: "#FED7AA", color: "#C2410C" }}>Draft</span>
  );
}

function DutyLists({ sectors, sectorsById, showToast, router }) {
  const firstOfNext = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }, []);
  const nowYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const arr = [];
    for (let y = nowYear - 1; y <= nowYear + 2; y += 1) arr.push(y);
    return arr;
  }, [nowYear]);

  const [lists, setLists] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [listsError, setListsError] = useState("");

  const [genMonth, setGenMonth] = useState(firstOfNext.getMonth() + 1);
  const [genYear, setGenYear] = useState(firstOfNext.getFullYear());
  const [useComparison, setUseComparison] = useState(false);
  const [cmpMonth, setCmpMonth] = useState(firstOfNext.getMonth() + 1);
  const [cmpYear, setCmpYear] = useState(firstOfNext.getFullYear() - 1);
  const [generating, setGenerating] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState(false);
  const [slotDrawer, setSlotDrawer] = useState(null); // assignment row being reassigned
  const [onlyUnfilled, setOnlyUnfilled] = useState(false);
  const [showWorkload, setShowWorkload] = useState(false);

  const loadLists = useCallback(async () => {
    setLoadingLists(true); setListsError("");
    try {
      const res = await fetch("/api/duty/lists");
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setListsError(data.error || "Failed to load"); setLists([]); return; }
      setLists(data.lists || []);
    } catch {
      setListsError("Network error"); setLists([]);
    } finally {
      setLoadingLists(false);
    }
  }, [router]);

  const loadDetail = useCallback(async (id, silent) => {
    if (!silent) { setLoadingDetail(true); setDetailError(""); }
    try {
      const res = await fetch(`/api/duty/lists/${id}`);
      if (res.status === 401) { router.push("/admin/login"); return null; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setDetailError(data.error || "Failed to load list"); setDetail(null); return null; }
      setDetail(data);
      return data;
    } catch {
      setDetailError("Network error"); setDetail(null); return null;
    } finally {
      if (!silent) setLoadingDetail(false);
    }
  }, [router]);

  useEffect(() => { loadLists(); }, [loadLists]);

  const openList = useCallback((id) => {
    setSelectedId(id);
    setOnlyUnfilled(false);
    setShowWorkload(false);
    loadDetail(id);
  }, [loadDetail]);

  function closeList() {
    setSelectedId(null); setDetail(null); setSlotDrawer(null); setDetailError("");
  }

  async function generate() {
    setGenerating(true);
    try {
      const body = { month: genMonth, year: genYear };
      if (useComparison) { body.comparisonMonth = cmpMonth; body.comparisonYear = cmpYear; }
      const res = await fetch("/api/duty/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Generation failed", "error"); return; }
      showToast(`Draft generated · ${data.stats.filled}/${data.stats.totalSlots} slots filled`);
      await loadLists();
      openList(data.id);
    } catch {
      showToast("Generation failed", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function commit() {
    if (!selectedId) return;
    if (!window.confirm("Commit this list? Once committed it becomes the official record and can no longer be edited.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/duty/lists/${selectedId}/commit`, { method: "POST" });
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Commit failed", "error"); return; }
      showToast("List committed");
      await loadLists();
      await loadDetail(selectedId);
    } catch {
      showToast("Commit failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!selectedId) return;
    if (!window.confirm("Regenerate this draft? All current assignments — including any manual edits — will be replaced.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/duty/lists/${selectedId}/regenerate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Regeneration failed", "error"); return; }
      showToast(`Draft regenerated · ${data.stats.filled}/${data.stats.totalSlots} slots filled`);
      await loadDetail(selectedId);
      await loadLists();
    } catch {
      showToast("Regeneration failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft() {
    if (!selectedId) return;
    if (!window.confirm("Delete this draft list? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/duty/lists/${selectedId}`, { method: "DELETE" });
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Delete failed", "error"); return; }
      showToast("Draft deleted");
      closeList();
      await loadLists();
    } catch {
      showToast("Delete failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reassignSlot(pracharak) {
    if (!slotDrawer) return;
    const warnings = [];
    if (pracharak) {
      if (slotDrawer.satsang_rating && pracharak.rating && pracharak.rating > slotDrawer.satsang_rating) {
        warnings.push(`Rating mismatch: ${pracharak.name} is Tier ${pracharak.rating} but this satsang requires Tier ${slotDrawer.satsang_rating}`);
      }
      const pracSpecs = pracharak.specializations || [];
      const branchSpecs = slotDrawer.required_specializations || [];
      if (branchSpecs.length > 0 && pracSpecs.length > 0 && !branchSpecs.some((s) => pracSpecs.includes(s))) {
        warnings.push(`Specialization mismatch: required [${branchSpecs.join(", ")}] but pracharak has [${pracSpecs.join(", ")}]`);
      }
    }
    const actionLabel = pracharak ? `assign to ${pracharak.name}` : "clear";
    const warningText = warnings.length > 0 ? "\n\nWarnings:\n- " + warnings.join("\n- ") : "";
    if (!confirm(`You are about to ${actionLabel} this slot manually. This bypasses all engine rules (rating, cooldown, preferences, specialization). Continue?${warningText}`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/duty/assignments/${slotDrawer.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pracharakId: pracharak ? pracharak.id : null }),
      });
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Reassign failed", "error"); return; }
      showToast(pracharak ? `Assigned to ${pracharak.name}` : "Slot cleared");
      const fresh = await loadDetail(selectedId, true);
      if (fresh) {
        const updated = fresh.assignments.find((a) => a.id === slotDrawer.id);
        setSlotDrawer(updated || null);
      }
    } catch {
      showToast("Reassign failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const list = detail?.list || null;
  const assignments = detail?.assignments || [];
  const isDraft = list?.status === "draft";

  const liveStats = useMemo(() => {
    const total = assignments.length;
    const filled = assignments.filter((a) => a.pracharak_id).length;
    const overrides = assignments.filter((a) => a.overridden_by_user).length;
    return { total, filled, unfilled: total - filled, fillRatePct: total ? Math.round((filled / total) * 100) : 0, overrides };
  }, [assignments]);

  const ruleHits = list?.payload?.stats?.ruleHits || null;

  const workload = useMemo(() => {
    const stored = list?.payload?.stats?.perPracharak || {};
    const counts = {};
    for (const a of assignments) {
      if (!a.pracharak_id) continue;
      if (!counts[a.pracharak_id]) counts[a.pracharak_id] = { id: a.pracharak_id, name: a.pracharak_name || stored[a.pracharak_id]?.name || "Pracharak", assigned: 0 };
      counts[a.pracharak_id].assigned += 1;
    }
    const rows = Object.values(counts).map((r) => {
      const target = stored[r.id]?.target ?? null;
      return { ...r, target, utilizationPct: target > 0 ? Math.round((r.assigned / target) * 100) : null };
    });
    rows.sort((a, b) => b.assigned - a.assigned || a.name.localeCompare(b.name));
    return rows;
  }, [assignments, list]);

  const visibleRows = onlyUnfilled ? assignments.filter((a) => !a.pracharak_id) : assignments;

  /* ---------- Review screen ---------- */
  if (selectedId) {
    return (
      <>
        <div style={s.reviewHead}>
          <button type="button" onClick={closeList} style={s.linkBtn}>{IconBack} All lists</button>
          {list && (
            <div style={s.reviewActions}>
              <a href={`/api/duty/lists/${selectedId}/export`} style={s.btnGhostSolid}>{IconDownload} Export Excel</a>
              {isDraft && <button type="button" onClick={regenerate} disabled={busy} style={s.btnGhost}>{IconRefresh} Regenerate</button>}
              {isDraft && <button type="button" onClick={deleteDraft} disabled={busy} style={s.btnDanger}>{IconTrash} Delete draft</button>}
              {isDraft && <button type="button" onClick={commit} disabled={busy || liveStats.total === 0} style={s.btnPrimary}>{IconCheck} Commit list</button>}
            </div>
          )}
        </div>

        {loadingDetail ? (
          <p style={s.muted}>Loading list…</p>
        ) : detailError ? (
          <div style={s.emptyBox}><span style={s.error}>{detailError}</span></div>
        ) : !list ? (
          <div style={s.emptyBox}>List not found.</div>
        ) : (
          <>
            <div style={s.reviewTitleRow}>
              <h2 style={s.reviewTitle}>{monthLabel(list.month, list.year)}</h2>
              {listStatusBadge(list.status)}
              <span style={s.versionTag}>v{list.version}</span>
              {list.comparison_month ? <span style={s.metaInline}>Compared to {monthLabel(list.comparison_month, list.comparison_year)}</span> : null}
            </div>

            <div style={s.statGrid}>
              <div className="stat-card" style={s.stat}><span style={s.statValue}>{liveStats.fillRatePct}%</span><span style={s.statLabel}>Fill rate</span></div>
              <div className="stat-card" style={s.stat}><span style={s.statValue}>{liveStats.filled}<span style={s.statTotal}>/{liveStats.total}</span></span><span style={s.statLabel}>Slots filled</span></div>
              <div className="stat-card" style={s.stat}><span style={{ ...s.statValue, color: liveStats.unfilled ? "#C2410C" : "#15803D" }}>{liveStats.unfilled}</span><span style={s.statLabel}>Unfilled</span></div>
              <div className="stat-card" style={s.stat}><span style={s.statValue}>{liveStats.overrides}</span><span style={s.statLabel}>Manual edits</span></div>
            </div>

            {ruleHits && (
              <p style={s.ruleHitLine}>
                <span style={s.sectionLabel}>Rule blocks at generation</span>
                Rating {ruleHits.rating} · Gap {ruleHits.gap} · Cooldown {ruleHits.cooldown} · Preference {ruleHits.preference} · At target {ruleHits.target}
              </p>
            )}

            <div style={s.reviewToolbar}>
              <label style={{ ...s.checkRow, margin: 0 }}>
                <input type="checkbox" checked={onlyUnfilled} onChange={(e) => setOnlyUnfilled(e.target.checked)} />
                <span>Show unfilled only ({liveStats.unfilled})</span>
              </label>
              <button type="button" onClick={() => setShowWorkload((v) => !v)} style={s.miniBtn}>
                {showWorkload ? "Hide" : "Show"} workload ({workload.length})
              </button>
            </div>

            {showWorkload && (
              <div style={s.workloadCard}>
                <span style={s.sectionLabel}>Pracharak workload (live)</span>
                {workload.length === 0 ? (
                  <p style={s.muted}>No pracharaks assigned yet.</p>
                ) : (
                  workload.map((w) => (
                    <div key={w.id} style={s.workloadRow}>
                      <span style={s.workloadName}>{w.name}</span>
                      <div style={s.workloadBar}>
                        <div style={{ ...s.workloadFill, width: `${Math.min(100, w.utilizationPct ?? (w.assigned ? 100 : 0))}%`, background: (w.utilizationPct ?? 0) > 100 ? "#DC2626" : "#2563EB" }} />
                      </div>
                      <span style={s.workloadCount}>{w.assigned}{w.target ? ` / ${w.target}` : ""}{w.utilizationPct != null ? ` · ${w.utilizationPct}%` : ""}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {isDraft && <p style={s.hint}>Click any row to reassign or clear the slot. Manual picks bypass the engine&apos;s rules, so double-check rating and availability. Committed lists are read-only.</p>}

            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Satsang</th>
                    <th style={s.th}>Time</th>
                    <th style={s.th}>Rating</th>
                    <th style={s.th}>Assigned pracharak</th>
                    <th style={s.th}>How</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr><td colSpan={6} style={s.emptyCell}>{onlyUnfilled ? "No unfilled slots — every duty is covered." : "No slots in this list."}</td></tr>
                  ) : (
                    visibleRows.map((r) => (
                      <tr key={r.id} className="admin-tr" style={s.tr} tabIndex={0}
                        onClick={() => setSlotDrawer(r)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSlotDrawer(r); } }}>
                        <td style={{ ...s.td, whiteSpace: "nowrap", fontWeight: 600 }}>{fmtDutyDate(r.duty_date)}</td>
                        <td style={s.td}>
                          <div style={{ fontWeight: 700 }}>{r.satsang_name || r.payload?.satsangName || "—"}</div>
                          <div style={s.pickerMeta}>{r.sector_name || sectorsById[r.satsang_sector_id]?.name || "—"}</div>
                        </td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}>{TIME_LABEL[r.satsang_time_type] || r.payload?.timeType || "—"}{r.satsang_time_slot ? ` · ${r.satsang_time_slot}` : ""}</td>
                        <td style={s.td}>{ratingBadge(r.satsang_rating ?? r.payload?.satsangRating ?? 2)}</td>
                        <td style={s.td}>
                          {r.pracharak_id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 600 }}>{r.pracharak_name || r.payload?.pracharakName || "Assigned"}</span>
                                {r.is_local && <span style={s.localTag}>Local</span>}
                              </div>
                              {r.last_called_date && (
                                <span style={{ fontSize: "0.7rem", color: daysSince(r.last_called_date) > 168 ? "#DC2626" : "#94A3B8" }}>
                                  Last called: {fmtShortDate(r.last_called_date)}{daysSince(r.last_called_date) > 168 ? " (6mo+)" : ""}
                                </span>
                              )}
                              {!r.last_called_date && (
                                <span style={{ fontSize: "0.7rem", color: "#94A3B8" }}>Never called</span>
                              )}
                            </div>
                          ) : (
                            <span style={s.unfilledTag}>Unfilled</span>
                          )}
                        </td>
                        <td style={s.td}>{reasonPill(r.reason_code)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {slotDrawer && (
          <div style={s.drawerWrap} role="dialog" aria-modal="true">
            <div style={s.drawerBackdrop} onClick={() => setSlotDrawer(null)} />
            <div style={s.drawer}>
              <div style={s.drawerHead}>
                <h2 style={s.drawerTitle}>Slot detail</h2>
                <button type="button" onClick={() => setSlotDrawer(null)} style={s.drawerClose} aria-label="Close">✕</button>
              </div>
              <div style={s.drawerBody}>
                <SummaryLine label="Satsang" value={slotDrawer.satsang_name || slotDrawer.payload?.satsangName || "—"} />
                <SummaryLine label="Sector" value={slotDrawer.sector_name || sectorsById[slotDrawer.satsang_sector_id]?.name || "—"} />
                <SummaryLine label="Date" value={fmtDutyDate(slotDrawer.duty_date)} />
                <SummaryLine label="Time" value={`${TIME_LABEL[slotDrawer.satsang_time_type] || slotDrawer.payload?.timeType || "—"}${slotDrawer.satsang_time_slot ? ` · ${slotDrawer.satsang_time_slot}` : ""}`} />
                <SummaryLine label="Rating" value={RATING_META[slotDrawer.satsang_rating ?? slotDrawer.payload?.satsangRating ?? 2]?.full || "—"} />
                <SummaryLine label="Assigned" value={slotDrawer.pracharak_id ? (slotDrawer.pracharak_name || slotDrawer.payload?.pracharakName || "—") : "Unfilled"} />
                <SummaryLine label="Status" value={REASON_META[slotDrawer.reason_code]?.label || slotDrawer.reason_code || "—"} />

                {slotDrawer.payload?.explanation && (
                  <div style={s.explainBox}>
                    <span style={s.sectionLabel}>Why the engine chose this</span>
                    <p style={s.explainText}>{slotDrawer.payload.explanation}</p>
                    {slotDrawer.payload.candidatesConsidered != null && (
                      <p style={s.hint}>{slotDrawer.payload.candidatesConsidered} candidate{slotDrawer.payload.candidatesConsidered === 1 ? "" : "s"} considered{slotDrawer.payload.score != null ? ` · score ${slotDrawer.payload.score}` : ""}.</p>
                    )}
                  </div>
                )}

                {isDraft ? (
                  <div style={{ marginTop: 16 }}>
                    <span style={s.sectionLabel}>Reassign this slot</span>
                    <PracharakSearchSelect placeholder="Search a pracharak to assign…" onSelect={(p) => reassignSlot(p)} router={router} />
                    <p style={s.hint}>Picking a pracharak here overrides the engine and flags this slot as a manual edit.</p>
                  </div>
                ) : (
                  <div style={s.infoBox}>This list is committed and can no longer be edited.</div>
                )}
              </div>
              <div style={s.drawerFooter}>
                {isDraft && slotDrawer.pracharak_id ? (
                  <button type="button" onClick={() => reassignSlot(null)} disabled={busy} style={s.btnDangerGhost}>Clear assignment</button>
                ) : <span />}
                <button type="button" onClick={() => setSlotDrawer(null)} style={s.btnGhost}>Close</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  /* ---------- Index screen (generate + history) ---------- */
  return (
    <>
      <div style={s.prefPickerCard}>
        <span style={s.sectionLabel}>Generate a monthly duty list</span>
        <div style={s.genGrid}>
          <Field label="Month">
            <select style={s.input} value={genMonth} onChange={(e) => setGenMonth(Number(e.target.value))}>
              {MONTHS.map((mm, i) => <option key={mm} value={i + 1}>{mm}</option>)}
            </select>
          </Field>
          <Field label="Year">
            <select style={s.input} value={genYear} onChange={(e) => setGenYear(Number(e.target.value))}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <div style={s.genBtnWrap}>
            <button type="button" onClick={generate} disabled={generating} style={s.btnPrimary}>
              {generating ? "Generating…" : "Generate draft"}
            </button>
          </div>
        </div>
        <label style={{ ...s.checkRow, marginBottom: 6 }}>
          <input type="checkbox" checked={useComparison} onChange={(e) => setUseComparison(e.target.checked)} />
          <span>Record a comparison month (rotation reference)</span>
        </label>
        {useComparison && (
          <div style={s.genGrid}>
            <Field label="Compare to month">
              <select style={s.input} value={cmpMonth} onChange={(e) => setCmpMonth(Number(e.target.value))}>
                {MONTHS.map((mm, i) => <option key={mm} value={i + 1}>{mm}</option>)}
              </select>
            </Field>
            <Field label="Compare to year">
              <select style={s.input} value={cmpYear} onChange={(e) => setCmpYear(Number(e.target.value))}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <div />
          </div>
        )}
        <p style={s.hint}>Active satsangs and pracharaks are pulled in automatically. The engine reads recent committed lists to enforce branch cooldown and rotation.</p>
      </div>

      <span style={s.sectionLabel}>List history</span>
      {loadingLists ? (
        <p style={s.muted}>Loading…</p>
      ) : listsError ? (
        <div style={s.emptyBox}><span style={s.error}>{listsError}</span></div>
      ) : lists.length === 0 ? (
        <div style={s.emptyBox}>No duty lists yet — generate your first monthly draft above.</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Month</th>
                <th style={s.th}>Version</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Fill rate</th>
                <th style={s.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {lists.map((l) => {
                const st = l.payload?.stats;
                return (
                  <tr key={l.id} className="admin-tr" style={s.tr} tabIndex={0}
                    onClick={() => openList(l.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openList(l.id); } }}>
                    <td style={{ ...s.td, fontWeight: 700 }}>{monthLabel(l.month, l.year)}</td>
                    <td style={s.td}>v{l.version}</td>
                    <td style={s.td}>{listStatusBadge(l.status)}</td>
                    <td style={s.td}>{st ? `${st.fillRatePct}% (${st.filled}/${st.totalSlots})` : "—"}</td>
                    <td style={s.td}>{l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ============================ BRANCH MASTER ============================ */
const SPEC_META = {
  hindi: { label: "Hindi", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  punjabi: { label: "Punjabi", color: "#DB2777", bg: "#FDF2F8", border: "#FBCFE8" },
  ramcharitmanas: { label: "Ramcharitmanas", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  bhagavad_gita: { label: "Bhagavad Gita", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  psychology: { label: "Psychology", color: "#0891B2", bg: "#ECFEFF", border: "#A5F3FC" },
  general: { label: "General", color: "#475569", bg: "#F1F5F9", border: "#E2E8F0" },
};
const LOCATION_TYPE_LABELS = { urban: "Urban", semi_urban: "Semi-urban", rural: "Rural", village: "Village/Kheda" };

function BranchMaster({ sectors, sectorsById, showToast, router }) {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [city, setCity] = useState("");
  const [active, setActive] = useState("");
  const [sort, setSort] = useState("name");
  const [order, setOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [drawer, setDrawer] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ q, sectorId, city, active, sort, order, page: String(page), limit: String(limit) });
      const res = await fetch(`/api/duty/branches?${params.toString()}`);
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load"); setRows([]); setTotal(0); return; }
      setRows(data.rows || []); setTotal(data.total || 0);
    } catch {
      setError("Network error"); setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, sectorId, city, active, sort, order, page, limit, router]);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 350); return () => clearTimeout(t); }, [qInput]);
  useEffect(() => { setPage(1); }, [q, sectorId, city, active, limit]);

  function handleSort(col) {
    if (sort === col) setOrder(order === "asc" ? "desc" : "asc");
    else { setSort(col); setOrder(col === "created_at" ? "desc" : "asc"); }
  }

  function openNew() {
    setForm({
      name: "", branchCode: "", sectorId: "", city: "", area: "", address: "",
      contactPerson: "", contactPhone: "", locationType: "urban",
      requiredSpecializations: [], requiredDays: [{ week: 1, day: 1 }, { week: 2, day: 1 }],
      isActive: true,
    });
    setDrawer({ mode: "new" });
  }

  function openEdit(row) {
    setForm({
      name: row.name || "", branchCode: row.branch_code || "", sectorId: row.sector_id || "",
      city: row.city || "", area: row.area || "", address: row.address || "",
      contactPerson: row.contact_person || "", contactPhone: row.contact_phone || "",
      locationType: row.location_type || "urban",
      requiredSpecializations: row.required_specializations || [],
      requiredDays: row.required_days || [{ week: 1, day: 1 }, { week: 2, day: 1 }],
      isActive: row.is_active,
    });
    setDrawer({ mode: "edit", id: row.id });
  }

  async function save() {
    if (!form.name.trim()) { showToast("Name is required", "error"); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name, branchCode: form.branchCode, sectorId: form.sectorId || null,
        city: form.city, area: form.area, address: form.address,
        contactPerson: form.contactPerson, contactPhone: form.contactPhone,
        locationType: form.locationType,
        requiredSpecializations: form.requiredSpecializations,
        requiredDays: form.requiredDays,
      };
      if (drawer.mode === "edit") body.isActive = form.isActive;
      const url = drawer.mode === "edit" ? `/api/duty/branches/${drawer.id}` : "/api/duty/branches";
      const method = drawer.mode === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Save failed", "error"); return; }
      showToast(drawer.mode === "edit" ? "Branch updated" : "Branch added");
      setDrawer(null); setForm(null); fetchRows();
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!drawer?.id) return;
    if (!window.confirm("Delete this branch? This cannot be undone.")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/duty/branches/${drawer.id}`, { method: "DELETE" });
      if (res.status === 401) { router.push("/admin/login"); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(d.error || "Delete failed", "error"); return; }
      showToast("Branch deleted");
      setDrawer(null); setForm(null); fetchRows();
    } catch {
      showToast("Delete failed", "error");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <div style={s.toolbar}>
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>{IconSearch}</span>
          <input type="search" placeholder="Search name, city, area, code..." value={qInput} onChange={(e) => setQInput(e.target.value)} style={s.search} />
        </div>
        <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} style={s.select} aria-label="Filter by sector">
          <option value="">All sectors</option>
          {sectors.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
        </select>
        <input type="search" placeholder="City..." value={city} onChange={(e) => setCity(e.target.value)} style={{ ...s.select, minWidth: 120 }} />
        <select value={active} onChange={(e) => setActive(e.target.value)} style={s.select} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={s.select} aria-label="Rows per page">
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
        <button type="button" onClick={openNew} style={s.btnPrimary}>{IconPlus} New Branch</button>
      </div>

      <div style={s.metaLine}>{total} branch{total === 1 ? "" : "es"}</div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <SortHeader col="name" label="Name" sort={sort} order={order} onSort={handleSort} />
              <th style={s.th}>Code</th>
              <th style={s.th}>Sector</th>
              <SortHeader col="city" label="City" sort={sort} order={order} onSort={handleSort} />
              <th style={s.th}>Specializations</th>
              <th style={s.th}>Required Days</th>
              <th style={s.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={s.emptyCell}>Loading...</td></tr>
            ) : error ? (
              <tr><td colSpan={7} style={s.emptyCell}><span style={s.error}>{error}</span></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={s.emptyCell}>No branches match.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="admin-tr" style={s.tr} tabIndex={0}
                  onClick={() => openEdit(row)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(row); } }}>
                  <td style={{ ...s.td, fontWeight: 700 }}>{row.name}</td>
                  <td style={s.td}>{row.branch_code || "---"}</td>
                  <td style={s.td}>{sectorsById[row.sector_id]?.name || "---"}</td>
                  <td style={s.td}>{row.city || "---"}</td>
                  <td style={s.td}>
                    {(row.required_specializations || []).length > 0
                      ? row.required_specializations.map((sp) => (
                        <span key={sp} style={{ ...s.tag, ...(SPEC_META[sp] || SPEC_META.general), fontSize: "0.7rem", marginLeft: 4 }}>
                          {SPEC_META[sp]?.label || sp}
                        </span>
                      ))
                      : <span style={{ color: "#94A3B8" }}>Any</span>
                    }
                  </td>
                  <td style={s.td}>{(row.required_days || []).map((r) => `${r.week === 1 ? "1st" : r.week === 2 ? "2nd" : r.week === 3 ? "3rd" : r.week === 4 ? "4th" : "5th"} ${DAY_SHORT[r.day] || "?"}`).join(", ") || "---"}</td>
                  <td style={s.td}>{statusBadge(row.is_active)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && !error && rows.length > 0 && (
        <div style={s.pager}>
          <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} className="admin-page-btn" style={s.pageBtn}>Prev</button>
          <span style={s.pageInfo}>Page {page} of {totalPages}</span>
          <button type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="admin-page-btn" style={s.pageBtn}>Next</button>
        </div>
      )}

      {drawer && form && (
        <div style={s.drawerWrap} role="dialog" aria-modal="true">
          <div style={s.drawerBackdrop} onClick={() => { setDrawer(null); setForm(null); }} />
          <div style={s.drawer}>
            <div style={s.drawerHead}>
              <h2 style={s.drawerTitle}>{drawer.mode === "edit" ? "Edit branch" : "New branch"}</h2>
              <button type="button" onClick={() => { setDrawer(null); setForm(null); }} style={s.drawerClose} aria-label="Close">x</button>
            </div>
            <div style={s.drawerBody}>
              <Field label="Branch Name">
                <input style={s.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </Field>
              <div style={s.formRow}>
                <Field label="Branch Code">
                  <input style={s.input} value={form.branchCode} placeholder="e.g. BR-001" onChange={(e) => setForm({ ...form, branchCode: e.target.value })} />
                </Field>
                <Field label="Sector">
                  <select style={s.input} value={form.sectorId} onChange={(e) => setForm({ ...form, sectorId: e.target.value })}>
                    <option value="">-- No sector --</option>
                    {sectors.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
                  </select>
                </Field>
              </div>
              <div style={s.formRow}>
                <Field label="City">
                  <input style={s.input} value={form.city} placeholder="e.g. Ghaziabad" onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </Field>
                <Field label="Area/Locality">
                  <input style={s.input} value={form.area} placeholder="e.g. Indirapuram" onChange={(e) => setForm({ ...form, area: e.target.value })} />
                </Field>
              </div>
              <Field label="Address">
                <input style={s.input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Field>
              <div style={s.formRow}>
                <Field label="Contact Person">
                  <input style={s.input} value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
                </Field>
                <Field label="Contact Phone">
                  <input style={s.input} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
                </Field>
              </div>
              <div style={s.formRow}>
                <Field label="Location Type">
                  <select style={s.input} value={form.locationType} onChange={(e) => setForm({ ...form, locationType: e.target.value })}>
                    {Object.entries(LOCATION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
              </div>

              <span style={s.sectionLabel}>Required Specializations</span>
              <div style={s.chipWrap}>
                {Object.entries(SPEC_META).map(([key, meta]) => {
                  const on = form.requiredSpecializations.includes(key);
                  return (
                    <button key={key} type="button" onClick={() => setForm({ ...form, requiredSpecializations: on ? form.requiredSpecializations.filter((sp) => sp !== key) : [...form.requiredSpecializations, key] })}
                      style={{ ...s.chipSm, ...(on ? { background: meta.color, borderColor: meta.color, color: "#FFFFFF" } : {}) }}>{meta.label}</button>
                  );
                })}
              </div>
              <span style={s.hint}>Leave empty = any specialization accepted. Select specific ones if this branch requires them.</span>

              <span style={s.sectionLabel}>Required Schedule</span>
              <span style={s.hint}>Specify which weeks and days this branch needs duty. 1st Sunday is always Huzoor Discourse.</span>
              <div style={{ marginTop: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...s.th, textAlign: "left", width: "40%" }}>Week</th>
                      <th style={{ ...s.th, textAlign: "left", width: "50%" }}>Day</th>
                      <th style={{ ...s.th, width: "10%" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(form.requiredDays || []).map((entry, idx) => {
                      const isHuzoor = entry.week === 1 && entry.day === 0;
                      return (
                        <tr key={idx} style={{ background: isHuzoor ? "#F5F3FF" : "transparent" }}>
                          <td style={{ ...s.td, padding: "4px 6px" }}>
                            <select
                              style={{ ...s.input, margin: 0 }}
                              value={entry.week}
                              disabled={isHuzoor}
                              onChange={(e) => {
                                const updated = [...form.requiredDays];
                                updated[idx] = { ...updated[idx], week: Number(e.target.value) };
                                setForm({ ...form, requiredDays: updated });
                              }}
                            >
                              <option value={1}>1st</option>
                              <option value={2}>2nd</option>
                              <option value={3}>3rd</option>
                              <option value={4}>4th</option>
                              <option value={5}>5th</option>
                            </select>
                          </td>
                          <td style={{ ...s.td, padding: "4px 6px" }}>
                            {isHuzoor ? (
                              <span style={{ fontWeight: 600, color: "#7C3AED" }}>Sunday — Huzoor Discourse</span>
                            ) : (
                              <select
                                style={{ ...s.input, margin: 0 }}
                                value={entry.day}
                                onChange={(e) => {
                                  const updated = [...form.requiredDays];
                                  updated[idx] = { ...updated[idx], day: Number(e.target.value) };
                                  setForm({ ...form, requiredDays: updated });
                                }}
                              >
                                {DAY_SHORT.map((d, i) => <option key={i} value={i}>{d}</option>)}
                              </select>
                            )}
                          </td>
                          <td style={{ ...s.td, padding: "4px 6px", textAlign: "center" }}>
                            {!isHuzoor && (
                              <button type="button" onClick={() => {
                                setForm({ ...form, requiredDays: form.requiredDays.filter((_, i) => i !== idx) });
                              }} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: "1rem" }} title="Remove">✕</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button type="button" onClick={() => {
                  setForm({ ...form, requiredDays: [...(form.requiredDays || []), { week: 1, day: 1 }] });
                }} style={{ ...s.btnGhost, marginTop: 6, fontSize: "0.8rem" }}>+ Add Row</button>
              </div>

              {drawer.mode === "edit" && (
                <label style={s.checkRow}>
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  <span>Active</span>
                </label>
              )}
            </div>
            <div style={s.drawerFooter}>
              {drawer.mode === "edit" ? (
                <button type="button" onClick={remove} disabled={saving} style={s.btnDanger}>{IconTrash} Delete</button>
              ) : <span />}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => { setDrawer(null); setForm(null); }} style={s.btnGhost}>Cancel</button>
                <button type="button" onClick={save} disabled={saving} style={s.btnPrimary}>{saving ? "Saving..." : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================ DATA QUALITY ============================ */
function DataQuality({ showToast, router }) {
  const [issues, setIssues] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  async function runValidation() {
    setLoading(true);
    try {
      const res = await fetch("/api/duty/validate");
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");
      setIssues(data.issues || []);
      setSummary(data.summary || null);
    } catch (err) {
      showToast("Validation failed: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runValidation(); }, []);

  const colorMap = { error: { bg: "#FEF2F2", border: "#FECACA", text: "#B91C1C" }, warning: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E" }, info: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF" } };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>Data Quality Checks</h3>
        <button onClick={runValidation} disabled={loading} style={s.btnSecondary}>{loading ? "Checking..." : "Re-check"}</button>
      </div>
      {summary && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { label: "Total Issues", val: summary.total, bg: "#F1F5F9" },
            { label: "Errors", val: summary.errors, bg: "#FEF2F2" },
            { label: "Warnings", val: summary.warnings, bg: "#FFFBEB" },
            { label: "Info", val: summary.info, bg: "#EFF6FF" },
          ].map((item) => (
            <div key={item.label} style={{ background: item.bg, border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 18px", minWidth: 110, textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: "1.3rem" }}>{item.val}</div>
              <div style={{ fontSize: 0.75, fontWeight: 700, color: "#64748B" }}>{item.label}</div>
            </div>
          ))}
        </div>
      )}
      {issues.length === 0 && !loading && <p style={{ color: "#64748B", fontStyle: "italic" }}>No issues found — all checks passed.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {issues.map((issue, i) => {
          const c = colorMap[issue.type] || colorMap.info;
          return (
            <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 12px", color: c.text, fontSize: 0.88, fontWeight: 600 }}>
              <span style={{ fontSize: 0.72, fontWeight: 800, textTransform: "uppercase", opacity: 0.7, marginRight: 6 }}>{issue.category}</span>
              {issue.message}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ SATSANG MASTER ============================ */
function SatsangMaster({ sectors, sectorsById, showToast, router }) {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [day, setDay] = useState("");
  const [active, setActive] = useState("");
  const [sort, setSort] = useState("name");
  const [order, setOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [drawer, setDrawer] = useState(null); // {mode:"new"|"edit", id?}
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [localOptions, setLocalOptions] = useState([]);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ q, sectorId, day, active, sort, order, page: String(page), limit: String(limit) });
      const res = await fetch(`/api/duty/satsangs?${params.toString()}`);
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load"); setRows([]); setTotal(0); return; }
      setRows(data.rows || []); setTotal(data.total || 0);
    } catch {
      setError("Network error"); setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, sectorId, day, active, sort, order, page, limit, router]);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 350); return () => clearTimeout(t); }, [qInput]);
  useEffect(() => { setPage(1); }, [q, sectorId, day, active, limit]);

  // Load pracharaks of the chosen sector for the predefined-local dropdown.
  useEffect(() => {
    if (!drawer) return undefined;
    let cancelled = false;
    (async () => {
      if (!form?.sectorId) { setLocalOptions([]); return; }
      try {
        const res = await fetch(`/api/duty/pracharaks?sectorId=${encodeURIComponent(form.sectorId)}&limit=100&sort=name&order=asc`);
        if (res.status === 401) { router.push("/admin/login"); return; }
        const data = await res.json();
        if (!cancelled) setLocalOptions(data.rows || []);
      } catch {
        if (!cancelled) setLocalOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [drawer, form?.sectorId, router]);

  function handleSort(col) {
    if (sort === col) setOrder(order === "asc" ? "desc" : "asc");
    else { setSort(col); setOrder(col === "created_at" ? "desc" : "asc"); }
  }

  function openNew() {
    setForm({ name: "", sectorId: "", address: "", contact: "", dayOfWeek: 0, date: "", timeType: "M", timeSlot: "10:00", rating: 2, predefinedLocalId: "", isActive: true });
    setDrawer({ mode: "new" });
  }

  function openEdit(row) {
    setForm({
      name: row.name || "",
      sectorId: row.sector_id || "",
      address: row.address || "",
      contact: row.contact || "",
      dayOfWeek: row.day_of_week ?? 0,
      date: row.date || "",
      timeType: row.time_type || "M",
      timeSlot: row.time_slot || "10:00",
      rating: row.rating ?? 2,
      predefinedLocalId: row.predefined_local_pracharak_id || "",
      isActive: row.is_active,
    });
    setDrawer({ mode: "edit", id: row.id });
  }

  async function save() {
    if (!form.name.trim()) { showToast("Name is required", "error"); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name, sectorId: form.sectorId || null, address: form.address, contact: form.contact,
        dayOfWeek: form.dayOfWeek, date: form.date || null, timeType: form.timeType, timeSlot: form.timeSlot, rating: form.rating,
        predefinedLocalId: form.predefinedLocalId || null,
      };
      if (drawer.mode === "edit") body.isActive = form.isActive;
      const url = drawer.mode === "edit" ? `/api/duty/satsangs/${drawer.id}` : "/api/duty/satsangs";
      const method = drawer.mode === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Save failed", "error"); return; }
      showToast(drawer.mode === "edit" ? "Satsang updated" : "Satsang added");
      setDrawer(null); setForm(null); fetchRows();
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!drawer?.id) return;
    if (!window.confirm("Delete this satsang? This cannot be undone.")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/duty/satsangs/${drawer.id}`, { method: "DELETE" });
      if (res.status === 401) { router.push("/admin/login"); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(d.error || "Delete failed", "error"); return; }
      showToast("Satsang deleted");
      setDrawer(null); setForm(null); fetchRows();
    } catch {
      showToast("Delete failed", "error");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <div style={s.toolbar}>
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>{IconSearch}</span>
          <input type="search" placeholder="Search name or address…" value={qInput} onChange={(e) => setQInput(e.target.value)} style={s.search} />
        </div>
        <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} style={s.select} aria-label="Filter by sector">
          <option value="">All sectors</option>
          {sectors.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
        </select>
        <select value={day} onChange={(e) => setDay(e.target.value)} style={s.select} aria-label="Filter by day">
          <option value="">All days</option>
          {DAYS.map((d, i) => <option key={d} value={String(i)}>{d}</option>)}
        </select>
        <select value={active} onChange={(e) => setActive(e.target.value)} style={s.select} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={s.select} aria-label="Rows per page">
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
        <button type="button" onClick={openNew} style={s.btnPrimary}>{IconPlus} New Satsang</button>
      </div>

      <div style={s.metaLine}>{total} satsang{total === 1 ? "" : "s"}</div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <SortHeader col="name" label="Name" sort={sort} order={order} onSort={handleSort} />
              <th style={s.th}>Sector</th>
              <th style={s.th}>Date / Day</th>
              <SortHeader col="day_of_week" label="Day" sort={sort} order={order} onSort={handleSort} />
              <th style={s.th}>Time</th>
              <SortHeader col="rating" label="Rating" sort={sort} order={order} onSort={handleSort} />
              <th style={s.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={s.emptyCell}>Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={7} style={s.emptyCell}><span style={s.error}>{error}</span></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={s.emptyCell}>No satsangs match.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="admin-tr" style={s.tr} tabIndex={0}
                  onClick={() => openEdit(row)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(row); } }}>
                  <td style={{ ...s.td, fontWeight: 700 }}>{row.name}</td>
                  <td style={s.td}>{sectorsById[row.sector_id]?.name || "—"}</td>
                  <td style={s.td}>{row.date ? new Date(row.date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                  <td style={s.td}>{DAY_SHORT[row.day_of_week] ?? "—"}</td>
                  <td style={s.td}>{TIME_LABEL[row.time_type] || row.time_type} · {row.time_slot}</td>
                  <td style={s.td}>{ratingBadge(row.rating)}</td>
                  <td style={s.td}>{statusBadge(row.is_active)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && !error && rows.length > 0 && (
        <div style={s.pager}>
          <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} className="admin-page-btn" style={s.pageBtn}>← Prev</button>
          <span style={s.pageInfo}>Page {page} of {totalPages}</span>
          <button type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="admin-page-btn" style={s.pageBtn}>Next →</button>
        </div>
      )}

      {drawer && form && (
        <div style={s.drawerWrap} role="dialog" aria-modal="true">
          <div style={s.drawerBackdrop} onClick={() => { setDrawer(null); setForm(null); }} />
          <div style={s.drawer}>
            <div style={s.drawerHead}>
              <h2 style={s.drawerTitle}>{drawer.mode === "edit" ? "Edit satsang" : "New satsang"}</h2>
              <button type="button" onClick={() => { setDrawer(null); setForm(null); }} style={s.drawerClose} aria-label="Close">✕</button>
            </div>
            <div style={s.drawerBody}>
              <Field label="Name">
                <input style={s.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </Field>
              <Field label="Sector">
                <select style={s.input} value={form.sectorId} onChange={(e) => setForm({ ...form, sectorId: e.target.value, predefinedLocalId: "" })}>
                  <option value="">— No sector —</option>
                  {sectors.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
                </select>
              </Field>
              <Field label="Address">
                <input style={s.input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Field>
              <Field label="Contact">
                <input style={s.input} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              </Field>
              <div style={s.formRow}>
                <Field label="Day of week">
                  <select style={s.input} value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })} disabled={!!form.date}>
                    {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </Field>
                <Field label="Time">
                  <select style={s.input} value={form.timeType} onChange={(e) => setForm({ ...form, timeType: e.target.value })}>
                    {TIME_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Specific date (optional)">
                <input type="date" style={s.input} value={form.date || ""} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                <span style={s.hint}>Set for a one-off satsang. Leave empty to repeat weekly.</span>
              </Field>
              <div style={s.formRow}>
                <Field label="Time slot">
                  <input style={s.input} value={form.timeSlot} placeholder="10:00" onChange={(e) => setForm({ ...form, timeSlot: e.target.value })} />
                </Field>
                <Field label="Rating">
                  <select style={s.input} value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}>
                    <option value={1}>{RATING_META[1].full}</option>
                    <option value={2}>{RATING_META[2].full}</option>
                    <option value={3}>{RATING_META[3].full}</option>
                  </select>
                </Field>
              </div>
              <Field label="Predefined local pracharak (optional)">
                <select style={s.input} value={form.predefinedLocalId} onChange={(e) => setForm({ ...form, predefinedLocalId: e.target.value })} disabled={!form.sectorId}>
                  <option value="">— None —</option>
                  {localOptions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.contact ? ` · ${p.contact}` : ""}</option>)}
                </select>
                {!form.sectorId && <span style={s.hint}>Choose a sector first to pick a local pracharak.</span>}
              </Field>
              {drawer.mode === "edit" && (
                <label style={s.checkRow}>
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  <span>Active</span>
                </label>
              )}
            </div>
            <div style={s.drawerFooter}>
              {drawer.mode === "edit" ? (
                <button type="button" onClick={remove} disabled={saving} style={s.btnDanger}>{IconTrash} Delete</button>
              ) : <span />}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => { setDrawer(null); setForm(null); }} style={s.btnGhost}>Cancel</button>
                <button type="button" onClick={save} disabled={saving} style={s.btnPrimary}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================ PRACHARAK MASTER ============================ */
function PracharakMaster({ sectors, sectorsById, showToast, router }) {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [rating, setRating] = useState("");
  const [active, setActive] = useState("");
  const [sort, setSort] = useState("name");
  const [order, setOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [drawer, setDrawer] = useState(null); // {mode, id?}
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState(null); // {lifetimeSewaCount, history}

  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ q, sectorId, rating, active, sort, order, page: String(page), limit: String(limit) });
      const res = await fetch(`/api/duty/pracharaks?${params.toString()}`);
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load"); setRows([]); setTotal(0); return; }
      setRows(data.rows || []); setTotal(data.total || 0);
    } catch {
      setError("Network error"); setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, sectorId, rating, active, sort, order, page, limit, router]);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 350); return () => clearTimeout(t); }, [qInput]);
  useEffect(() => { setPage(1); }, [q, sectorId, rating, active, limit]);

  function handleSort(col) {
    if (sort === col) setOrder(order === "asc" ? "desc" : "asc");
    else { setSort(col); setOrder(col === "created_at" ? "desc" : "asc"); }
  }

  function openNew() {
    setForm({ name: "", contact: "", sectorId: "", rating: 2, monthlyTarget: 2, awAd: false, isActive: true, specializations: [], city: "", isOutstation: false, homeCity: "" });
    setHistory(null);
    setDrawer({ mode: "new" });
  }

  async function openEdit(row) {
    setForm({
      name: row.name || "", contact: row.contact || "", sectorId: row.sector_id || "",
      rating: row.rating ?? 2, monthlyTarget: row.monthly_target ?? 2, awAd: !!row.aw_ad, isActive: row.is_active,
      specializations: Array.isArray(row.specializations) ? row.specializations : [],
      city: row.city || "", isOutstation: !!row.is_outstation, homeCity: row.home_city || "",
    });
    setHistory(null);
    setDrawer({ mode: "edit", id: row.id });
    try {
      const res = await fetch(`/api/duty/pracharaks/${row.id}`);
      if (res.status === 401) { router.push("/admin/login"); return; }
      if (res.ok) { const data = await res.json(); setHistory({ lifetimeSewaCount: data.lifetimeSewaCount || 0, history: data.history || [] }); }
    } catch { /* history is best-effort */ }
  }

  async function save() {
    if (!form.name.trim()) { showToast("Name is required", "error"); return; }
    setSaving(true);
    try {
      const body = { name: form.name, contact: form.contact, sectorId: form.sectorId || null, rating: form.rating, monthlyTarget: form.monthlyTarget, awAd: form.awAd, specializations: form.specializations || [], city: form.city || null, isOutstation: form.isOutstation, homeCity: form.homeCity || null };
      if (drawer.mode === "edit") body.isActive = form.isActive;
      const url = drawer.mode === "edit" ? `/api/duty/pracharaks/${drawer.id}` : "/api/duty/pracharaks";
      const method = drawer.mode === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Save failed", "error"); return; }
      showToast(drawer.mode === "edit" ? "Pracharak updated" : "Pracharak added");
      setDrawer(null); setForm(null); fetchRows();
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!drawer?.id) return;
    if (!window.confirm("Delete this pracharak? This cannot be undone.")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/duty/pracharaks/${drawer.id}`, { method: "DELETE" });
      if (res.status === 401) { router.push("/admin/login"); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(d.error || "Delete failed", "error"); return; }
      showToast("Pracharak deleted");
      setDrawer(null); setForm(null); fetchRows();
    } catch {
      showToast("Delete failed", "error");
    } finally {
      setSaving(false);
    }
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.readAsText(file);
  }

  async function runImport() {
    if (!csvText.trim()) { showToast("Paste CSV or choose a file first", "error"); return; }
    setImporting(true); setImportResult(null);
    try {
      const res = await fetch("/api/duty/pracharaks/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: csvText }) });
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Import failed", "error"); return; }
      setImportResult(data);
      showToast(`${data.created} imported${data.skipped ? `, ${data.skipped} skipped` : ""}`);
      fetchRows();
    } catch {
      showToast("Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent("name,contact,sector,rating,target,aw_ad,specializations,city,is_outstation,home_city\nRamesh Ji Delhi,9876543210,Sector name here,2,2,no,hindi,Delhi,no,\n")}`;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <div style={s.toolbar}>
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>{IconSearch}</span>
          <input type="search" placeholder="Search name or contact…" value={qInput} onChange={(e) => setQInput(e.target.value)} style={s.search} />
        </div>
        <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} style={s.select} aria-label="Filter by sector">
          <option value="">All sectors</option>
          {sectors.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
        </select>
        <select value={rating} onChange={(e) => setRating(e.target.value)} style={s.select} aria-label="Filter by rating">
          <option value="">All ratings</option>
          <option value="1">{RATING_META[1].full}</option>
          <option value="2">{RATING_META[2].full}</option>
          <option value="3">{RATING_META[3].full}</option>
        </select>
        <select value={active} onChange={(e) => setActive(e.target.value)} style={s.select} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={s.select} aria-label="Rows per page">
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
        <button type="button" onClick={() => { setImportOpen(true); setImportResult(null); }} style={s.btnGhostSolid}>{IconUpload} Import CSV</button>
        <button type="button" onClick={openNew} style={s.btnPrimary}>{IconPlus} New Pracharak</button>
      </div>

      <div style={s.metaLine}>{total} pracharak{total === 1 ? "" : "s"}</div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <SortHeader col="name" label="Name" sort={sort} order={order} onSort={handleSort} />
              <th style={s.th}>Contact</th>
              <th style={s.th}>Sector</th>
              <SortHeader col="rating" label="Rating" sort={sort} order={order} onSort={handleSort} />
              <SortHeader col="monthly_target" label="Target" sort={sort} order={order} onSort={handleSort} />
              <th style={s.th}>Specializations</th>
              <th style={s.th}>City</th>
              <th style={s.th}>AW-AD</th>
              <th style={s.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={s.emptyCell}>Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={9} style={s.emptyCell}><span style={s.error}>{error}</span></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} style={s.emptyCell}>No pracharaks match.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="admin-tr" style={s.tr} tabIndex={0}
                  onClick={() => openEdit(row)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(row); } }}>
                  <td style={{ ...s.td, fontWeight: 700 }}>{row.name}</td>
                  <td style={s.td}>{row.contact || "—"}</td>
                  <td style={s.td}>{sectorsById[row.sector_id]?.name || "—"}</td>
                  <td style={s.td}>{ratingBadge(row.rating)}</td>
                  <td style={{ ...s.td, fontVariantNumeric: "tabular-nums" }}>{row.monthly_target}</td>
                  <td style={s.td}>{(Array.isArray(row.specializations) && row.specializations.length > 0) ? row.specializations.map((sp) => (typeof sp === "string" ? sp.charAt(0).toUpperCase() + sp.slice(1).replace(/_/g, " ") : sp)).join(", ") : "—"}</td>
                  <td style={s.td}>{row.city || (row.is_outstation ? "Outstation" : "—")}</td>
                  <td style={s.td}>{row.aw_ad ? <span style={{ ...s.tag, background: "#EFF6FF", borderColor: "#BFDBFE", color: "#1D4ED8" }}>AW-AD</span> : "—"}</td>
                  <td style={s.td}>{statusBadge(row.is_active)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && !error && rows.length > 0 && (
        <div style={s.pager}>
          <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} className="admin-page-btn" style={s.pageBtn}>← Prev</button>
          <span style={s.pageInfo}>Page {page} of {totalPages}</span>
          <button type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="admin-page-btn" style={s.pageBtn}>Next →</button>
        </div>
      )}

      {drawer && form && (
        <div style={s.drawerWrap} role="dialog" aria-modal="true">
          <div style={s.drawerBackdrop} onClick={() => { setDrawer(null); setForm(null); }} />
          <div style={s.drawer}>
            <div style={s.drawerHead}>
              <h2 style={s.drawerTitle}>{drawer.mode === "edit" ? "Edit pracharak" : "New pracharak"}</h2>
              <button type="button" onClick={() => { setDrawer(null); setForm(null); }} style={s.drawerClose} aria-label="Close">✕</button>
            </div>
            <div style={s.drawerBody}>
              <Field label="Name">
                <input style={s.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
              </Field>
              <Field label="Contact">
                <input style={s.input} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              </Field>
              <Field label="Sector">
                <select style={s.input} value={form.sectorId} onChange={(e) => setForm({ ...form, sectorId: e.target.value })}>
                  <option value="">— No sector —</option>
                  {sectors.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
                </select>
              </Field>
              <div style={s.formRow}>
                <Field label="Rating">
                  <select style={s.input} value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}>
                    <option value={1}>{RATING_META[1].full}</option>
                    <option value={2}>{RATING_META[2].full}</option>
                    <option value={3}>{RATING_META[3].full}</option>
                  </select>
                </Field>
                <Field label="Monthly target (sewa count)">
                  <input type="number" min={0} max={31} style={s.input} value={form.monthlyTarget} onChange={(e) => setForm({ ...form, monthlyTarget: Number(e.target.value) })} />
                </Field>
              </div>
              <label style={s.checkRow}>
                <input type="checkbox" checked={form.awAd} onChange={(e) => setForm({ ...form, awAd: e.target.checked })} />
                <span>AW-AD (available whole week / all day)</span>
              </label>
              <Field label="City">
                <input style={s.input} value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Ghaziabad" />
              </Field>
              <label style={s.checkRow}>
                <input type="checkbox" checked={form.isOutstation || false} onChange={(e) => setForm({ ...form, isOutstation: e.target.checked })} />
                <span>Outstation (outside Delhi-NCR)</span>
              </label>
              {form.isOutstation && (
                <Field label="Home City">
                  <input style={s.input} value={form.homeCity || ""} onChange={(e) => setForm({ ...form, homeCity: e.target.value })} placeholder="e.g. Lucknow" />
                </Field>
              )}
              <Field label="Specializations">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["hindi", "punjabi", "ramcharitmanas", "bhagavad_gita", "psychology", "general"].map((sp) => {
                    const active = (form.specializations || []).includes(sp);
                    const label = sp === "bhagavad_gita" ? "Bhagavad Gita" : sp === "ramcharitmanas" ? "Ramcharitmanas" : sp.charAt(0).toUpperCase() + sp.slice(1);
                    return (
                      <button key={sp} type="button"
                        style={{ border: "1px solid " + (active ? "#2563EB" : "#D5DEE9"), background: active ? "#2563EB" : "#fff", color: active ? "#fff" : "#3B4A5C", fontWeight: 600, fontSize: "0.82rem", padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit" }}
                        onClick={() => {
                          const current = form.specializations || [];
                          setForm({ ...form, specializations: active ? current.filter((s) => s !== sp) : [...current, sp] });
                        }}
                      >{label}</button>
                    );
                  })}
                </div>
                <p style={{ fontSize: "0.78rem", color: "#94A3B8", marginTop: 4 }}>Select all that apply</p>
              </Field>
              {drawer.mode === "edit" && (
                <label style={s.checkRow}>
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  <span>Active</span>
                </label>
              )}

              {drawer.mode === "edit" && (
                <div style={s.historyBox}>
                  <div style={s.historyHead}>
                    <span style={s.sectionLabel}>Lifetime sewa</span>
                    <span style={s.historyCount}>{history ? history.lifetimeSewaCount : "…"}</span>
                  </div>
                  {history && history.history.length > 0 ? (
                    <div style={{ maxHeight: 180, overflowY: "auto" }}>
                      {history.history.slice(0, 20).map((h) => (
                        <div key={h.id} style={s.historyRow}>
                          <span style={{ fontWeight: 600 }}>{h.satsang_name}</span>
                          <span style={s.pickerMeta}>{h.duty_date ? new Date(h.duty_date).toLocaleDateString() : ""}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={s.hint}>{history ? "No past duties recorded yet." : "Loading history…"}</p>
                  )}
                </div>
              )}
            </div>
            <div style={s.drawerFooter}>
              {drawer.mode === "edit" ? (
                <button type="button" onClick={remove} disabled={saving} style={s.btnDanger}>{IconTrash} Delete</button>
              ) : <span />}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => { setDrawer(null); setForm(null); }} style={s.btnGhost}>Cancel</button>
                <button type="button" onClick={save} disabled={saving} style={s.btnPrimary}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div style={s.modalWrap} role="dialog" aria-modal="true">
          <div style={s.drawerBackdrop} onClick={() => setImportOpen(false)} />
          <div style={s.modal}>
            <div style={s.drawerHead}>
              <h2 style={s.drawerTitle}>Import pracharaks (CSV)</h2>
              <button type="button" onClick={() => setImportOpen(false)} style={s.drawerClose} aria-label="Close">✕</button>
            </div>
            <div style={s.drawerBody}>
              <p style={s.hint}>
                Columns: <b>name</b> (required), contact, sector (name or number), rating (1-3), target, aw_ad (yes/no),
                specializations (comma-separated: hindi, punjabi, ramcharitmanas, bhagavad_gita, psychology, general),
                city, is_outstation (yes/no), home_city.
                Sectors are matched by name or number; unknown sectors import with no sector assigned.
              </p>
              <div style={{ margin: "6px 0 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <a href={templateHref} download="pracharaks-template.csv" style={s.linkBtn}>Download template</a>
                <label style={s.linkBtn}>
                  Choose CSV file
                  <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
                </label>
              </div>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={"name,contact,sector,rating,target,aw_ad,specializations,city,is_outstation,home_city\nRamesh Ji Delhi,9876543210,Some Sector,2,2,no,hindi,Delhi,no,"}
                style={s.textareaMono}
              />
              {importResult && (
                <div style={s.importResult}>
                  <div><b>{importResult.created}</b> created · <b>{importResult.skipped}</b> skipped · {importResult.total} rows read</div>
                  {importResult.errors && importResult.errors.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <span style={s.sectionLabel}>Notes</span>
                      <ul style={s.errorList}>
                        {importResult.errors.map((er, i) => <li key={i}>Line {er.line}: {er.message}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={s.drawerFooter}>
              <span />
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => setImportOpen(false)} style={s.btnGhost}>Close</button>
                <button type="button" onClick={runImport} disabled={importing || !csvText.trim()} style={s.btnPrimary}>{importing ? "Importing…" : "Import"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================ PREFERENCES ============================ */
function PreferencesManager({ sectors, sectorsById, showToast, router }) {
  const [selected, setSelected] = useState(null); // pracharak row
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // {mode, id?}
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const loadSets = useCallback(async (pracharakId) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/duty/preferences?pracharakId=${encodeURIComponent(pracharakId)}`);
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json();
      setSets(data.sets || []);
    } catch {
      showToast("Could not load preferences", "error");
    } finally {
      setLoading(false);
    }
  }, [router, showToast]);

  function pick(row) { setSelected(row); loadSets(row.id); }

  async function toggleAwAd() {
    if (!selected) return;
    const next = !selected.aw_ad;
    try {
      const res = await fetch(`/api/duty/pracharaks/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ awAd: next }) });
      if (res.status === 401) { router.push("/admin/login"); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(d.error || "Update failed", "error"); return; }
      setSelected({ ...selected, aw_ad: next });
      showToast(next ? "Marked AW-AD" : "AW-AD removed");
    } catch {
      showToast("Update failed", "error");
    }
  }

  function openNew() {
    setForm({ setName: "", isActive: true, sectorIds: [], days: [], weeks: [], times: [], note: "" });
    setEditing({ mode: "new" });
  }

  function openEdit(set) {
    const p = set.payload || {};
    setForm({
      setName: set.set_name || "Default",
      isActive: set.is_active,
      sectorIds: Array.isArray(p.sectorIds) ? p.sectorIds : [],
      days: Array.isArray(p.days) ? p.days : [],
      weeks: Array.isArray(p.weeks) ? p.weeks : [],
      times: Array.isArray(p.times) ? p.times : [],
      note: p.note || "",
    });
    setEditing({ mode: "edit", id: set.id });
  }

  async function saveSet() {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = { sectorIds: form.sectorIds, days: form.days, weeks: form.weeks, times: form.times, note: form.note };
      const body = { setName: form.setName || "Default", isActive: form.isActive, payload };
      let res;
      if (editing.mode === "edit") {
        res = await fetch(`/api/duty/preferences/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        res = await fetch("/api/duty/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pracharakId: selected.id, ...body }) });
      }
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Save failed", "error"); return; }
      showToast(editing.mode === "edit" ? "Preference set updated" : "Preference set added");
      setEditing(null); setForm(null); loadSets(selected.id);
    } catch {
      showToast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeSet(id) {
    if (!window.confirm("Delete this preference set?")) return;
    try {
      const res = await fetch(`/api/duty/preferences/${id}`, { method: "DELETE" });
      if (res.status === 401) { router.push("/admin/login"); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(d.error || "Delete failed", "error"); return; }
      showToast("Preference set deleted");
      loadSets(selected.id);
    } catch {
      showToast("Delete failed", "error");
    }
  }

  async function deleteAll() {
    if (!selected) return;
    if (!window.confirm(`Delete ALL preference sets for ${selected.name}?`)) return;
    try {
      const res = await fetch(`/api/duty/preferences?pracharakId=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      if (res.status === 401) { router.push("/admin/login"); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(d.error || "Delete failed", "error"); return; }
      showToast("All preference sets deleted");
      loadSets(selected.id);
    } catch {
      showToast("Delete failed", "error");
    }
  }

  async function copyFrom(sourceRow) {
    if (!selected) return;
    try {
      const res = await fetch("/api/duty/preferences/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromPracharakId: sourceRow.id, toPracharakId: selected.id }) });
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || "Copy failed", "error"); return; }
      showToast(`Copied ${data.copied} set${data.copied === 1 ? "" : "s"} from ${sourceRow.name}`);
      setCopyOpen(false); loadSets(selected.id);
    } catch {
      showToast("Copy failed", "error");
    }
  }

  function combosFor(p) {
    const a = (p.sectorIds?.length || sectors.length || 1);
    const d = (p.days?.length || 7);
    const w = (p.weeks?.length || 5);
    const t = (p.times?.length || 2);
    return a * d * w * t;
  }

  const formCombos = form ? combosFor(form) : 0;
  const tooNarrow = form && formCombos > 0 && formCombos < 3;

  return (
    <>
      <div style={s.prefPickerCard}>
        <span style={s.sectionLabel}>Pracharak</span>
        {selected ? (
          <div style={s.selectedRow}>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.02rem", color: "#0F172A" }}>{selected.name}</div>
              <div style={s.pickerMeta}>
                {sectorsById[selected.sector_id]?.name || "No sector"} · {RATING_META[selected.rating]?.full} · {selected.contact || "no contact"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ ...s.checkRow, margin: 0 }}>
                <input type="checkbox" checked={!!selected.aw_ad} onChange={toggleAwAd} />
                <span>AW-AD</span>
              </label>
              <button type="button" style={s.btnGhost} onClick={() => { setSelected(null); setSets([]); }}>Change</button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            <PracharakSearchSelect onSelect={pick} router={router} />
          </div>
        )}
      </div>

      {selected && (
        <>
          <div style={s.prefToolbar}>
            <button type="button" onClick={openNew} style={s.btnPrimary}>{IconPlus} New set</button>
            <button type="button" onClick={() => setCopyOpen(true)} style={s.btnGhostSolid}>{IconCopy} Copy from…</button>
            {sets.length > 0 && <button type="button" onClick={deleteAll} style={s.btnDangerGhost}>{IconTrash} Delete all</button>}
          </div>

          {loading ? (
            <p style={s.muted}>Loading…</p>
          ) : sets.length === 0 ? (
            <div style={s.emptyBox}>No preference sets yet. Add one so the engine knows where this pracharak can serve.</div>
          ) : (
            <div style={s.setGrid}>
              {sets.map((set) => {
                const p = set.payload || {};
                const combos = combosFor(p);
                return (
                  <div key={set.id} style={s.setCard}>
                    <div style={s.setCardHead}>
                      <span style={{ fontWeight: 800, color: "#0F172A" }}>{set.set_name}</span>
                      {statusBadge(set.is_active)}
                    </div>
                    <div style={s.setSummary}>
                      <SummaryLine label="Areas" value={p.sectorIds?.length ? p.sectorIds.map((id) => sectorsById[id]?.name || "—").join(", ") : "Any sector"} />
                      <SummaryLine label="Days" value={p.days?.length ? p.days.map((d) => DAY_SHORT[d]).join(", ") : "Any day"} />
                      <SummaryLine label="Weeks" value={p.weeks?.length ? p.weeks.map((w) => `W${w}`).join(", ") : "Any week"} />
                      <SummaryLine label="Times" value={p.times?.length ? p.times.map((t) => TIME_LABEL[t]).join(", ") : "Any time"} />
                    </div>
                    <div style={s.setFoot}>
                      <span style={combos < 3 ? s.narrowPill : s.combosPill}>{combos < 3 ? "Very narrow" : `~${combos} slot combos`}</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" style={s.miniBtn} onClick={() => openEdit(set)}>Edit</button>
                        <button type="button" style={s.miniBtnDanger} onClick={() => removeSet(set.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {editing && form && (
        <div style={s.drawerWrap} role="dialog" aria-modal="true">
          <div style={s.drawerBackdrop} onClick={() => { setEditing(null); setForm(null); }} />
          <div style={s.drawer}>
            <div style={s.drawerHead}>
              <h2 style={s.drawerTitle}>{editing.mode === "edit" ? "Edit preference set" : "New preference set"}</h2>
              <button type="button" onClick={() => { setEditing(null); setForm(null); }} style={s.drawerClose} aria-label="Close">✕</button>
            </div>
            <div style={s.drawerBody}>
              <Field label="Set name">
                <input style={s.input} value={form.setName} placeholder="e.g. Weekday mornings" onChange={(e) => setForm({ ...form, setName: e.target.value })} autoFocus />
              </Field>

              <span style={s.sectionLabel}>Areas (sectors)</span>
              <div style={s.chipWrap}>
                {sectors.map((sec) => {
                  const on = form.sectorIds.includes(sec.id);
                  return (
                    <button key={sec.id} type="button" onClick={() => setForm({ ...form, sectorIds: toggleInArray(form.sectorIds, sec.id) })}
                      style={{ ...s.chipSm, ...(on ? s.chipSmActive : {}) }}>{sec.name}</button>
                  );
                })}
                {sectors.length === 0 && <span style={s.hint}>No sectors loaded.</span>}
              </div>

              <span style={s.sectionLabel}>Days</span>
              <div style={s.chipWrap}>
                {DAYS.map((d, i) => {
                  const on = form.days.includes(i);
                  return (
                    <button key={d} type="button" onClick={() => setForm({ ...form, days: toggleInArray(form.days, i) })}
                      style={{ ...s.chipSm, ...(on ? s.chipSmActive : {}) }}>{DAY_SHORT[i]}</button>
                  );
                })}
              </div>

              <span style={s.sectionLabel}>Weeks of month</span>
              <div style={s.chipWrap}>
                {WEEKS.map((w) => {
                  const on = form.weeks.includes(w);
                  return (
                    <button key={w} type="button" onClick={() => setForm({ ...form, weeks: toggleInArray(form.weeks, w) })}
                      style={{ ...s.chipSm, ...(on ? s.chipSmActive : {}) }}>Week {w}</button>
                  );
                })}
              </div>

              <span style={s.sectionLabel}>Times</span>
              <div style={s.chipWrap}>
                {TIME_TYPES.map((t) => {
                  const on = form.times.includes(t.value);
                  return (
                    <button key={t.value} type="button" onClick={() => setForm({ ...form, times: toggleInArray(form.times, t.value) })}
                      style={{ ...s.chipSm, ...(on ? s.chipSmActive : {}) }}>{t.label}</button>
                  );
                })}
              </div>

              <Field label="Note (optional)">
                <textarea style={{ ...s.input, minHeight: 60, resize: "vertical" }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </Field>

              <label style={s.checkRow}>
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                <span>Active set</span>
              </label>

              <div style={tooNarrow ? s.warnBox : s.infoBox}>
                {tooNarrow
                  ? "This set is very narrow — the pracharak may rarely match a satsang. Leave a dimension empty to mean “any”."
                  : `Empty dimensions mean “any”. Approx. ${formCombos} slot combinations covered.`}
              </div>
            </div>
            <div style={s.drawerFooter}>
              <span />
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => { setEditing(null); setForm(null); }} style={s.btnGhost}>Cancel</button>
                <button type="button" onClick={saveSet} disabled={saving} style={s.btnPrimary}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {copyOpen && (
        <div style={s.modalWrap} role="dialog" aria-modal="true">
          <div style={s.drawerBackdrop} onClick={() => setCopyOpen(false)} />
          <div style={s.modal}>
            <div style={s.drawerHead}>
              <h2 style={s.drawerTitle}>Copy preferences from another pracharak</h2>
              <button type="button" onClick={() => setCopyOpen(false)} style={s.drawerClose} aria-label="Close">✕</button>
            </div>
            <div style={s.drawerBody}>
              <p style={s.hint}>Pick a source pracharak. All of their preference sets will be copied onto <b>{selected?.name}</b>.</p>
              <PracharakSearchSelect placeholder="Search source pracharak…" excludeId={selected?.id} onSelect={copyFrom} router={router} />
            </div>
            <div style={s.drawerFooter}>
              <span />
              <button type="button" onClick={() => setCopyOpen(false)} style={s.btnGhost}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SummaryLine({ label, value }) {
  return (
    <div style={s.summaryLine}>
      <span style={s.summaryLabel}>{label}</span>
      <span style={s.summaryValue}>{value}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={s.field}>
      <span style={s.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

const s = {
  shell: { display: "flex", minHeight: "100vh", fontFamily: '"Inter", system-ui, sans-serif', color: "#1f2937", background: "#F8FAFC" },
  sidebar: { width: 248, flexShrink: 0, position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column", background: "#FFFFFF", borderRight: "1px solid #E5EAF1", padding: "20px 14px", gap: 6 },
  sideBrand: { display: "flex", alignItems: "center", gap: 11, padding: "6px 10px 16px", borderBottom: "1px solid #EEF2F7", marginBottom: 14 },
  sideBrandText: { fontWeight: 800, fontSize: "0.98rem", color: "#0F172A", letterSpacing: "-0.01em", lineHeight: 1.2, whiteSpace: "nowrap" },
  logo: { height: 38, width: 38, objectFit: "contain", borderRadius: 10, background: "#F1F5F9", border: "1px solid #E5EAF1", padding: 3 },
  nav: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  navItem: { display: "flex", alignItems: "center", gap: 12, border: 0, background: "transparent", color: "#475569", fontSize: "0.92rem", fontWeight: 600, fontFamily: "inherit", textAlign: "left", padding: "11px 14px", borderRadius: 12, cursor: "pointer", transition: "background 150ms ease, color 150ms ease", whiteSpace: "nowrap" },
  navItemActive: { background: "#EAF0FE", color: "#1D4ED8" },
  navIcon: { display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },

  mainWrap: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
  topbar: { position: "sticky", top: 0, zIndex: 20, background: "rgba(248,250,252,0.88)", backdropFilter: "blur(8px)", borderBottom: "1px solid #E5EAF1", padding: "16px 32px 14px" },
  title: { margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em" },
  topbarSub: { margin: "3px 0 0", fontSize: "0.85rem", color: "#64748B" },
  wrap: { maxWidth: 1180, width: "100%", margin: "0 auto", padding: "26px 32px 70px" },

  muted: { color: "#64748B" },
  error: { color: "#DC2626" },
  metaLine: { color: "#64748B", fontSize: "0.84rem", fontWeight: 600, margin: "0 0 12px", fontVariantNumeric: "tabular-nums" },

  toolbar: { display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" },
  searchWrap: { position: "relative", display: "flex", alignItems: "center", flex: "1 1 240px", minWidth: 200 },
  searchIcon: { position: "absolute", left: 13, display: "inline-flex", color: "#94A3B8", pointerEvents: "none" },
  search: { width: "100%", minHeight: 44, paddingLeft: 40, paddingRight: 14, border: "1px solid #DBE3EC", borderRadius: 12, background: "#FFFFFF", fontSize: "0.92rem", fontFamily: "inherit", color: "#1F2937", outline: "none" },
  select: { minHeight: 44, padding: "9px 13px", border: "1px solid #DBE3EC", borderRadius: 12, background: "#FFFFFF", fontSize: "0.92rem", fontFamily: "inherit", color: "#1F2937", cursor: "pointer" },

  btnPrimary: { display: "inline-flex", alignItems: "center", gap: 7, minHeight: 44, padding: "0 18px", border: "1px solid transparent", borderRadius: 12, fontWeight: 700, cursor: "pointer", color: "#FFFFFF", background: "linear-gradient(135deg, #2563EB, #1D4ED8)", boxShadow: "0 2px 8px rgba(29,78,216,0.28)", fontFamily: "inherit", fontSize: "0.9rem" },
  btnGhost: { display: "inline-flex", alignItems: "center", gap: 7, minHeight: 44, padding: "0 16px", border: "1px solid #DBE3EC", borderRadius: 12, background: "#FFFFFF", color: "#334155", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit" },
  btnGhostSolid: { display: "inline-flex", alignItems: "center", gap: 7, minHeight: 44, padding: "0 16px", border: "1px solid #C7D2FE", borderRadius: 12, background: "#EEF2FF", color: "#3730A3", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit" },
  btnDanger: { display: "inline-flex", alignItems: "center", gap: 7, minHeight: 44, padding: "0 16px", border: "1px solid #FECACA", borderRadius: 12, background: "#FEF2F2", color: "#B91C1C", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit" },
  btnDangerGhost: { display: "inline-flex", alignItems: "center", gap: 7, minHeight: 44, padding: "0 14px", border: "1px solid transparent", borderRadius: 12, background: "transparent", color: "#B91C1C", fontWeight: 700, fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit" },
  linkBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1px solid #DBE3EC", borderRadius: 10, background: "#FFFFFF", color: "#1D4ED8", fontWeight: 700, fontSize: "0.86rem", cursor: "pointer", fontFamily: "inherit", textDecoration: "none" },

  tableWrap: { overflowX: "auto", borderRadius: 16, border: "1px solid #E5EAF1", background: "#FFFFFF", boxShadow: "0 1px 3px rgba(15,23,42,0.05)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" },
  th: { textAlign: "left", padding: "13px 16px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748B", background: "#F8FAFC", borderBottom: "1px solid #E5EAF1", whiteSpace: "nowrap", position: "sticky", top: 0 },
  sortBtn: { border: 0, background: "transparent", padding: 0, font: "inherit", color: "inherit", fontWeight: "inherit", letterSpacing: "inherit", textTransform: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 },
  td: { padding: "13px 16px", borderBottom: "1px solid #F1F5F9", color: "#1F2937", verticalAlign: "middle" },
  tr: { cursor: "pointer", transition: "background 120ms ease" },
  emptyCell: { padding: "36px 18px", textAlign: "center", color: "#64748B" },
  tag: { display: "inline-block", border: "1px solid", fontWeight: 700, fontSize: "0.74rem", padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" },

  pager: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 18 },
  pageInfo: { color: "#64748B", fontSize: "0.88rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  pageBtn: { minHeight: 38, padding: "0 18px", border: "1px solid #DBE3EC", borderRadius: 10, background: "#FFFFFF", color: "#334155", fontWeight: 700, fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit" },

  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#0F172A", color: "#fff", padding: "12px 22px", borderRadius: 12, fontSize: "0.9rem", fontWeight: 600, zIndex: 120, boxShadow: "0 10px 30px rgba(15,23,42,0.3)" },
  toastError: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#DC2626", color: "#fff", padding: "12px 22px", borderRadius: 12, fontSize: "0.9rem", fontWeight: 600, zIndex: 120, boxShadow: "0 10px 30px rgba(220,38,38,0.35)" },

  drawerWrap: { position: "fixed", inset: 0, zIndex: 90, display: "flex", justifyContent: "flex-end" },
  drawerBackdrop: { position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" },
  drawer: { position: "relative", width: "min(520px, 96vw)", height: "100%", background: "#FFFFFF", boxShadow: "-18px 0 50px rgba(15,23,42,0.18)", display: "flex", flexDirection: "column", borderTopLeftRadius: 20, borderBottomLeftRadius: 20, animation: "drawerIn 240ms cubic-bezier(0.22, 1, 0.36, 1)" },
  drawerHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid #EEF2F7", flexShrink: 0 },
  drawerTitle: { margin: 0, fontSize: "1.12rem", fontWeight: 800, color: "#0F172A" },
  drawerClose: { width: 36, height: 36, border: 0, borderRadius: 999, background: "#F1F5F9", color: "#334155", fontSize: "1rem", fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  drawerBody: { overflowY: "auto", padding: "18px 22px", flex: 1, WebkitOverflowScrolling: "touch" },
  drawerFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 22px", borderTop: "1px solid #EEF2F7", flexShrink: 0 },

  field: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  fieldLabel: { fontSize: "0.78rem", fontWeight: 700, color: "#475569" },
  input: { width: "100%", minHeight: 42, padding: "9px 12px", border: "1px solid #DBE3EC", borderRadius: 10, background: "#FFFFFF", fontSize: "0.92rem", fontFamily: "inherit", color: "#1F2937", outline: "none" },
  formRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  checkRow: { display: "flex", alignItems: "center", gap: 9, margin: "6px 0 12px", fontSize: "0.9rem", fontWeight: 600, color: "#334155", cursor: "pointer" },
  hint: { fontSize: "0.8rem", color: "#94A3B8", marginTop: 6, display: "block", lineHeight: 1.5 },
  sectionLabel: { display: "block", fontSize: "0.72rem", fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", margin: "6px 0 8px" },

  chipWrap: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chipSm: { border: "1px solid #D5DEE9", background: "#FFFFFF", color: "#3B4A5C", fontWeight: 600, fontSize: "0.82rem", padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit" },
  chipSmActive: { background: "#1D4ED8", borderColor: "#1D4ED8", color: "#FFFFFF", fontWeight: 700 },

  historyBox: { marginTop: 8, border: "1px solid #EEF2F7", borderRadius: 12, padding: "12px 14px", background: "#FBFCFE" },
  historyHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  historyCount: { fontWeight: 800, fontSize: "1.2rem", color: "#1D4ED8", fontVariantNumeric: "tabular-nums" },
  historyRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px solid #F1F5F9", fontSize: "0.86rem" },
  pickerMeta: { fontSize: "0.8rem", color: "#94A3B8" },

  pickerResults: { position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#FFFFFF", border: "1px solid #E5EAF1", borderRadius: 12, boxShadow: "0 12px 30px rgba(15,23,42,0.12)", zIndex: 50, maxHeight: 280, overflowY: "auto", padding: 6 },
  pickerItem: { display: "flex", flexDirection: "column", gap: 2, width: "100%", textAlign: "left", border: 0, background: "transparent", padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: "0.9rem", color: "#1F2937" },
  pickerEmpty: { padding: "14px 12px", color: "#94A3B8", fontSize: "0.86rem" },

  prefPickerCard: { background: "#FFFFFF", border: "1px solid #E5EAF1", borderRadius: 16, padding: "16px 18px", marginBottom: 16, boxShadow: "0 1px 3px rgba(15,23,42,0.05)" },
  selectedRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 8 },
  prefToolbar: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" },
  emptyBox: { background: "#FFFFFF", border: "1px dashed #CBD5E1", borderRadius: 14, padding: "28px 20px", textAlign: "center", color: "#64748B", fontSize: "0.92rem" },
  setGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 },
  setCard: { background: "#FFFFFF", border: "1px solid #E5EAF1", borderRadius: 16, padding: "16px 18px", boxShadow: "0 1px 3px rgba(15,23,42,0.05)", display: "flex", flexDirection: "column", gap: 10 },
  setCardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  setSummary: { display: "flex", flexDirection: "column", gap: 6 },
  summaryLine: { display: "grid", gridTemplateColumns: "62px 1fr", gap: 8, alignItems: "start" },
  summaryLabel: { fontSize: "0.72rem", fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.04em", paddingTop: 2 },
  summaryValue: { fontSize: "0.86rem", color: "#334155", fontWeight: 600, lineHeight: 1.4 },
  setFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2, paddingTop: 10, borderTop: "1px solid #F1F5F9" },
  combosPill: { fontSize: "0.74rem", fontWeight: 700, color: "#0F766E", background: "#F0FDFA", border: "1px solid #99F6E4", padding: "3px 10px", borderRadius: 999 },
  narrowPill: { fontSize: "0.74rem", fontWeight: 700, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", padding: "3px 10px", borderRadius: 999 },
  miniBtn: { border: "1px solid #DBE3EC", background: "#FFFFFF", color: "#334155", fontWeight: 700, fontSize: "0.8rem", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  miniBtnDanger: { border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", fontWeight: 700, fontSize: "0.8rem", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },

  modalWrap: { position: "fixed", inset: 0, zIndex: 95, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modal: { position: "relative", width: "min(560px, 96vw)", maxHeight: "90vh", background: "#FFFFFF", borderRadius: 20, boxShadow: "0 30px 70px rgba(15,23,42,0.28)", display: "flex", flexDirection: "column", overflow: "hidden" },
  textareaMono: { width: "100%", minHeight: 150, padding: "10px 12px", border: "1px solid #DBE3EC", borderRadius: 10, background: "#FFFFFF", fontSize: "0.82rem", fontFamily: "monospace", color: "#1F2937", outline: "none", resize: "vertical" },
  importResult: { marginTop: 14, background: "#F8FAFC", border: "1px solid #E5EAF1", borderRadius: 12, padding: "12px 14px", fontSize: "0.86rem", color: "#334155" },
  errorList: { margin: "6px 0 0", paddingLeft: 18, color: "#B45309", fontSize: "0.82rem", lineHeight: 1.5 },
  infoBox: { marginTop: 10, background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 10, padding: "10px 14px", fontSize: "0.84rem", color: "#0C4A6E", lineHeight: 1.5 },
  warnBox: { marginTop: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", fontSize: "0.84rem", color: "#92400E", lineHeight: 1.5 },

  // ---- Duty Lists (review + generate) ----
  reviewHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 },
  reviewActions: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  reviewTitleRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 },
  reviewTitle: { margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#0F172A", letterSpacing: "-0.01em" },
  versionTag: { fontSize: "0.78rem", fontWeight: 700, color: "#64748B", background: "#F1F5F9", border: "1px solid #E2E8F0", padding: "3px 10px", borderRadius: 999 },
  metaInline: { fontSize: "0.82rem", color: "#64748B", fontWeight: 600 },

  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 },
  stat: { background: "#FFFFFF", border: "1px solid #E5EAF1", borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 1px 3px rgba(15,23,42,0.05)" },
  statValue: { fontSize: "1.5rem", fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 },
  statTotal: { fontSize: "1rem", fontWeight: 700, color: "#94A3B8" },
  statLabel: { fontSize: "0.76rem", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em" },
  ruleHitLine: { fontSize: "0.86rem", color: "#475569", fontWeight: 600, margin: "0 0 16px", fontVariantNumeric: "tabular-nums" },

  reviewToolbar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 },
  workloadCard: { background: "#FFFFFF", border: "1px solid #E5EAF1", borderRadius: 14, padding: "14px 16px", marginBottom: 14, boxShadow: "0 1px 3px rgba(15,23,42,0.05)" },
  workloadRow: { display: "grid", gridTemplateColumns: "160px 1fr 120px", gap: 12, alignItems: "center", padding: "5px 0", fontSize: "0.86rem" },
  workloadName: { fontWeight: 600, color: "#1F2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  workloadBar: { height: 8, background: "#EEF2F7", borderRadius: 999, overflow: "hidden" },
  workloadFill: { height: "100%", borderRadius: 999, transition: "width 200ms ease" },
  workloadCount: { fontWeight: 700, color: "#475569", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },

  localTag: { display: "inline-block", fontSize: "0.72rem", fontWeight: 700, color: "#0F766E", background: "#F0FDFA", border: "1px solid #99F6E4", padding: "2px 8px", borderRadius: 999 },
  unfilledTag: { display: "inline-block", fontSize: "0.74rem", fontWeight: 700, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", padding: "3px 10px", borderRadius: 999 },
  explainBox: { marginTop: 14, background: "#F8FAFC", border: "1px solid #E5EAF1", borderRadius: 12, padding: "12px 14px" },
  explainText: { margin: "2px 0 0", fontSize: "0.88rem", color: "#334155", lineHeight: 1.55 },

  genGrid: { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" },
  genBtnWrap: { display: "flex", alignItems: "flex-end", marginBottom: 14 },
};
