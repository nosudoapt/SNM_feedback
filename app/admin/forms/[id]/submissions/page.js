"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";

function fmt(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function cellText(val) {
  if (val === null || val === undefined) return "—";
  if (Array.isArray(val)) return val.join(", ") || "—";
  return String(val);
}

export default function FormSubmissionsPage() {
  const router = useRouter();
  const { id } = useParams();
  const [phase, setPhase] = useState("loading"); // loading | denied | ready
  const [form, setForm] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const limit = 20;

  const load = useCallback(async (p) => {
    const res = await fetch(`/api/cms/forms/${id}/submissions?page=${p}&limit=${limit}`);
    if (res.status === 401) return router.push("/admin/login");
    if (res.status === 403) return setPhase("denied");
    const data = await res.json();
    if (!res.ok) return setPhase("denied");
    setForm(data.form);
    setRows(data.rows || []);
    setTotal(data.total || 0);
    setPage(p);
    setPhase("ready");
  }, [id, router]);

  useEffect(() => { load(1); }, [load]);

  const schema = form?.schema || [];
  const term = q.trim().toLowerCase();
  const filtered = term
    ? rows.filter((r) =>
        schema.some((f) => cellText(r.payload?.[f.key]).toLowerCase().includes(term))
      )
    : rows;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div style={s.wrap}>
      <div style={s.container}>
        <header style={s.header}>
          <div>
            <a href="/admin/forms" style={s.back}>← All forms</a>
            <h1 style={s.title}>{form ? form.title : "Responses"}</h1>
            <p style={s.subtitle}>{total} total response{total === 1 ? "" : "s"}</p>
          </div>
          {phase === "ready" && total > 0 && (
            <a href={`/api/cms/forms/${id}/export`} style={s.btn}>Export CSV</a>
          )}
        </header>

        {phase === "loading" && <div style={s.card}>Loading…</div>}
        {phase === "denied" && (
          <div style={s.card}>
            <h2 style={{ margin: "0 0 8px" }}>Not available</h2>
            <p style={{ margin: 0, color: "#7d93aa" }}>
              You may not have access, or this is a legacy form (view those from the dashboard).
            </p>
          </div>
        )}

        {phase === "ready" && (
          <>
            <input
              type="search"
              placeholder="Search responses on this page…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={s.search}
            />
            <div style={s.tableCard}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Submitted</th>
                    {schema.map((f) => <th key={f.key} style={s.th}>{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td style={s.td}>{fmt(r.created_at)}</td>
                      {schema.map((f) => <td key={f.key} style={s.td}>{cellText(r.payload?.[f.key])}</td>)}
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td style={s.td} colSpan={schema.length + 1}>No responses{term ? " match your search" : " yet"}.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div style={s.pager}>
                <button type="button" style={s.pageBtn} disabled={page <= 1} onClick={() => load(page - 1)}>← Prev</button>
                <span style={s.pageInfo}>Page {page} of {pages}</span>
                <button type="button" style={s.pageBtn} disabled={page >= pages} onClick={() => load(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  wrap: { minHeight: "100vh", fontFamily: '"Inter", system-ui, sans-serif', padding: "28px 20px", color: "#3d556e" },
  container: { maxWidth: 1080, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap" },
  back: { color: "#6ba2d6", textDecoration: "none", fontSize: "0.9rem", fontWeight: 600 },
  title: { margin: "6px 0 2px", fontSize: "1.8rem", fontFamily: '"Space Grotesk", sans-serif' },
  subtitle: { margin: 0, color: "#7d93aa", fontSize: "0.95rem" },
  btn: { minHeight: 44, display: "inline-flex", alignItems: "center", border: 0, borderRadius: 999, fontWeight: 800, cursor: "pointer", color: "white", background: "linear-gradient(135deg, #6ba2d6, #91c7e6)", padding: "0 20px", textDecoration: "none", fontFamily: "inherit" },
  card: { background: "rgba(255,255,255,0.9)", border: "1px solid #d9e5f1", borderRadius: 20, padding: 28 },
  search: { width: "100%", minHeight: 46, padding: "10px 14px", border: "1px solid #d9e5f1", borderRadius: 12, fontSize: "0.95rem", fontFamily: "inherit", background: "#fff", color: "#3d556e", boxSizing: "border-box", marginBottom: 14 },
  tableCard: { background: "rgba(255,255,255,0.9)", border: "1px solid #d9e5f1", borderRadius: 20, padding: 8, overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" },
  th: { textAlign: "left", padding: "12px 14px", color: "#7d93aa", fontWeight: 700, borderBottom: "1px solid #eef3f9", whiteSpace: "nowrap" },
  td: { padding: "11px 14px", borderBottom: "1px solid #f2f6fb", verticalAlign: "top" },
  pager: { display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 18 },
  pageBtn: { border: "1px solid #d9e5f1", background: "#fff", color: "#4a80b4", borderRadius: 999, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  pageInfo: { color: "#7d93aa", fontSize: "0.9rem" },
};
