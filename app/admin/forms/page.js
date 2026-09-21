"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const FIELD_TYPES = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Paragraph" },
  { value: "tel", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "radio", label: "Single choice" },
  { value: "checkbox", label: "Multiple choice" },
];
const OPTION_TYPES = new Set(["select", "radio", "checkbox"]);

function blankField() {
  return { key: "", label: "", type: "text", required: false, help: "", options: [] };
}

export default function FormsBuilderPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [phase, setPhase] = useState("loading"); // loading | denied | list | edit
  const [forms, setForms] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // editor state
  const [editing, setEditing] = useState(null); // full form object
  const [fields, setFields] = useState([]);
  const [meta, setMeta] = useState({ title: "", description: "", category: "" });

  const flash = useCallback((text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  }, []);

  const loadForms = useCallback(async () => {
    const res = await fetch("/api/cms/forms");
    if (res.status === 401) return router.push("/admin/login");
    if (res.status === 403) return setPhase("denied");
    const data = await res.json();
    setForms(data.forms || []);
    setPhase("list");
  }, [router]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/me");
      if (res.status === 401) return router.push("/admin/login");
      const data = await res.json();
      setMe(data);
      if (!(data.role === "editor" || data.role === "super_admin")) return setPhase("denied");
      await loadForms();
    })();
  }, [router, loadForms]);

  async function createForm(e) {
    e.preventDefault();
    const title = meta.title.trim();
    if (!title) return;
    setBusy(true);
    try {
      const res = await fetch("/api/cms/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) return flash(data.error || "Could not create form", "error");
      setMeta({ title: "", description: "", category: "" });
      await loadForms();
      openEditor(data.form.id);
    } finally {
      setBusy(false);
    }
  }

  async function openEditor(id) {
    setBusy(true);
    try {
      const res = await fetch(`/api/cms/forms/${id}`);
      const data = await res.json();
      if (!res.ok) return flash(data.error || "Could not open form", "error");
      const f = data.form;
      setEditing(f);
      setMeta({ title: f.title, description: f.description || "", category: f.category || "" });
      setFields((f.schema || []).map((x) => ({ ...blankField(), ...x, options: x.options || [] })));
      setPhase("edit");
    } finally {
      setBusy(false);
    }
  }

  function backToList() {
    setEditing(null);
    setPhase("list");
    loadForms();
  }
  // ---- field editing (local state only until Save) ----
  function updateField(i, patch) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function addField() {
    setFields((prev) => [...prev, blankField()]);
  }
  function removeField(i) {
    setFields((prev) => prev.filter((_, idx) => idx !== i));
  }
  function moveField(i, dir) {
    setFields((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function setOptionsText(i, text) {
    const options = text.split("\n").map((x) => x.trim()).filter(Boolean);
    updateField(i, { options });
  }

  async function saveForm({ publish = false } = {}) {
    setBusy(true);
    try {
      // Persist metadata + schema first.
      const body = {
        title: meta.title.trim(),
        description: meta.description.trim(),
        category: meta.category.trim(),
        schema: fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          required: !!f.required,
          help: f.help,
          options: OPTION_TYPES.has(f.type) ? f.options : undefined,
        })),
      };
      const res = await fetch(`/api/cms/forms/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return flash(data.error || "Save failed", "error");
      setEditing(data.form);
      setFields((data.form.schema || []).map((x) => ({ ...blankField(), ...x, options: x.options || [] })));

      if (publish) {
        const target = data.form.status === "published" ? "draft" : "published";
        const pres = await fetch(`/api/cms/forms/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: target }),
        });
        const pdata = await pres.json();
        if (!pres.ok) return flash(pdata.error || "Publish failed", "error");
        setEditing(pdata.form);
        flash(target === "published" ? "Form published — it's now live." : "Form unpublished.");
      } else {
        flash("Saved.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteForm(form) {
    if (!confirm(`Delete "${form.title}" and all its submissions? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cms/forms/${form.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return flash(data.error || "Delete failed", "error");
      flash("Form deleted.");
      await loadForms();
    } finally {
      setBusy(false);
    }
  }

  function copyLink(form) {
    const path = form.publicPath || `/f/${form.slug}`;
    const url = `${window.location.origin}${path}`;
    navigator.clipboard?.writeText(url).then(
      () => flash(`Link copied: ${url}`),
      () => flash(url)
    );
  }

  // ---- render ----
  return (
    <div style={s.wrap}>
      <div style={s.container}>
        <header style={s.header}>
          <div>
            <a href="/admin" style={s.back}>← Dashboard</a>
            <h1 style={s.title}>Forms</h1>
            <p style={s.subtitle}>Build, publish and share feedback &amp; registration forms.</p>
          </div>
          {me && (
            <div style={s.meBox}>
              <div style={s.meEmail}>{me.email}</div>
              <div style={s.badge}>{me.role}</div>
            </div>
          )}
        </header>

        {msg && <div style={msg.type === "error" ? s.msgError : s.msgOk}>{msg.text}</div>}
        {phase === "loading" && <div style={s.card}>Loading…</div>}

        {phase === "denied" && (
          <div style={s.card}>
            <h2 style={{ margin: "0 0 8px" }}>Editors only</h2>
            <p style={{ margin: 0, color: "#7d93aa" }}>You need editor or super-admin access to manage forms.</p>
          </div>
        )}

        {phase === "list" && (
          <>
            <form onSubmit={createForm} style={s.addCard}>
              <div style={s.addGrid}>
                <input
                  type="text"
                  placeholder="New form title…"
                  value={meta.title}
                  onChange={(e) => setMeta({ ...meta, title: e.target.value })}
                  style={s.input}
                />
                <button type="submit" disabled={busy} style={s.btn}>Create form</button>
              </div>
            </form>

            <div style={s.grid}>
              {forms.map((f) => (
                <div key={f.id} style={s.formCard}>
                  <div style={s.formTop}>
                    <span style={f.status === "published" ? s.pillPub : s.pillDraft}>
                      {f.readOnly ? "Legacy" : f.status === "published" ? "Published" : "Draft"}
                    </span>
                    {f.submissionCount != null && <span style={s.count}>{f.submissionCount} responses</span>}
                  </div>
                  <h3 style={s.formTitle}>{f.title}</h3>
                  <p style={s.formDesc}>{f.description || (f.readOnly ? "Existing form (served as-is)." : "No description.")}</p>
                  <div style={s.formActions}>
                    {f.readOnly ? (
                      <>
                        <a href={f.publicPath} target="_blank" rel="noreferrer" style={s.linkBtn}>Open</a>
                        <a href={`/admin?category=${f.slug}`} style={s.linkBtn}>Responses</a>
                      </>
                    ) : (
                      <>
                        <button type="button" style={s.linkBtn} onClick={() => openEditor(f.id)}>Edit</button>
                        <a href={`/admin/forms/${f.id}/submissions`} style={s.linkBtn}>Responses</a>
                        <button type="button" style={s.linkBtn} onClick={() => copyLink(f)}>Copy link</button>
                        <button type="button" style={s.dangerBtn} onClick={() => deleteForm(f)}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {forms.length === 0 && <div style={s.card}>No forms yet — create your first above.</div>}
            </div>
          </>
        )}

        {phase === "edit" && editing && (
          <div>
            <div style={s.editHead}>
              <button type="button" style={s.back} onClick={backToList}>← All forms</button>
              <div style={s.editActions}>
                <span style={editing.status === "published" ? s.pillPub : s.pillDraft}>
                  {editing.status === "published" ? "Published" : "Draft"}
                </span>
                <a href={editing.publicPath || `/f/${editing.slug}`} target="_blank" rel="noreferrer" style={s.linkBtn}>Preview</a>
                <button type="button" disabled={busy} style={s.btnGhost} onClick={() => saveForm()}>Save</button>
                <button type="button" disabled={busy} style={s.btn} onClick={() => saveForm({ publish: true })}>
                  {editing.status === "published" ? "Unpublish" : "Save & Publish"}
                </button>
              </div>
            </div>

            <div style={s.card}>
              <label style={s.label}>Title</label>
              <input style={s.input} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
              <label style={s.label}>Description</label>
              <textarea style={{ ...s.input, minHeight: 60 }} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
              <label style={s.label}>Category (optional)</label>
              <input style={s.input} value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })} placeholder="feedback, registration…" />
              <p style={s.hint}>Public link: <code>{editing.publicPath || `/f/${editing.slug}`}</code></p>
            </div>

            <h3 style={s.sectionTitle}>Fields</h3>
            {fields.map((f, i) => (
              <div key={i} style={s.fieldCard}>
                <div style={s.fieldGrid}>
                  <div>
                    <label style={s.label}>Label</label>
                    <input style={s.input} value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} />
                  </div>
                  <div>
                    <label style={s.label}>Type</label>
                    <select style={s.input} value={f.type} onChange={(e) => updateField(i, { type: e.target.value })}>
                      {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                {OPTION_TYPES.has(f.type) && (
                  <div>
                    <label style={s.label}>Options (one per line)</label>
                    <textarea style={{ ...s.input, minHeight: 70 }} value={(f.options || []).join("\n")} onChange={(e) => setOptionsText(i, e.target.value)} />
                  </div>
                )}
                <label style={s.label}>Help text (optional)</label>
                <input style={s.input} value={f.help || ""} onChange={(e) => updateField(i, { help: e.target.value })} />
                <div style={s.fieldFoot}>
                  <label style={s.checkRow}>
                    <input type="checkbox" checked={!!f.required} onChange={(e) => updateField(i, { required: e.target.checked })} /> Required
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" style={s.miniBtn} onClick={() => moveField(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" style={s.miniBtn} onClick={() => moveField(i, 1)} disabled={i === fields.length - 1}>↓</button>
                    <button type="button" style={s.dangerBtn} onClick={() => removeField(i)}>Remove</button>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" style={s.btnGhost} onClick={addField}>+ Add field</button>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  wrap: { minHeight: "100vh", fontFamily: '"Inter", system-ui, sans-serif', padding: "28px 20px", color: "#3d556e" },
  container: { maxWidth: 960, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 22, flexWrap: "wrap" },
  back: { color: "#6ba2d6", textDecoration: "none", fontSize: "0.9rem", fontWeight: 600, background: "none", border: 0, cursor: "pointer", padding: 0 },
  title: { margin: "6px 0 2px", fontSize: "1.9rem", fontFamily: '"Space Grotesk", sans-serif' },
  subtitle: { margin: 0, color: "#7d93aa", fontSize: "0.95rem" },
  meBox: { textAlign: "right" },
  meEmail: { fontSize: "0.9rem", color: "#5b748f" },
  badge: { display: "inline-block", marginTop: 4, padding: "3px 12px", borderRadius: 999, background: "#eaf2fb", color: "#4a80b4", fontSize: "0.78rem", fontWeight: 700 },
  card: { background: "rgba(255,255,255,0.9)", border: "1px solid #d9e5f1", borderRadius: 20, padding: 24, marginBottom: 16 },
  addCard: { background: "rgba(255,255,255,0.9)", border: "1px solid #d9e5f1", borderRadius: 20, padding: 20, marginBottom: 18 },
  addGrid: { display: "grid", gridTemplateColumns: "1fr auto", gap: 10 },
  input: { width: "100%", minHeight: 46, padding: "10px 14px", border: "1px solid #d9e5f1", borderRadius: 12, fontSize: "0.95rem", fontFamily: "inherit", background: "#fff", color: "#3d556e", boxSizing: "border-box", marginBottom: 4 },
  btn: { minHeight: 46, border: 0, borderRadius: 999, fontWeight: 800, cursor: "pointer", color: "white", background: "linear-gradient(135deg, #6ba2d6, #91c7e6)", padding: "0 22px", fontFamily: "inherit" },
  btnGhost: { minHeight: 46, border: "1px solid #d9e5f1", borderRadius: 999, fontWeight: 700, cursor: "pointer", color: "#4a80b4", background: "#fff", padding: "0 22px", fontFamily: "inherit" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 },
  formCard: { background: "rgba(255,255,255,0.9)", border: "1px solid #d9e5f1", borderRadius: 18, padding: 18, display: "flex", flexDirection: "column", gap: 8 },
  formTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  formTitle: { margin: "2px 0", fontSize: "1.1rem", color: "#3d556e" },
  formDesc: { margin: 0, color: "#7d93aa", fontSize: "0.85rem", flex: 1 },
  formActions: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 },
  count: { fontSize: "0.78rem", color: "#8fa3b8" },
  pillPub: { padding: "3px 12px", borderRadius: 999, background: "#e7f6ec", color: "#1f7a44", fontSize: "0.75rem", fontWeight: 700 },
  pillDraft: { padding: "3px 12px", borderRadius: 999, background: "#fdf4e0", color: "#8a6d1f", fontSize: "0.75rem", fontWeight: 700 },
  linkBtn: { border: "1px solid #d9e5f1", background: "#fff", color: "#4a80b4", borderRadius: 10, padding: "6px 12px", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", textDecoration: "none", fontFamily: "inherit" },
  dangerBtn: { border: "1px solid #f3d0d0", background: "#fff", color: "#c0392b", borderRadius: 10, padding: "6px 12px", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  miniBtn: { border: "1px solid #d9e5f1", background: "#fff", color: "#4a80b4", borderRadius: 8, padding: "4px 10px", fontWeight: 700, cursor: "pointer" },
  editHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  editActions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  label: { display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#7d93aa", margin: "10px 2px 4px" },
  hint: { margin: "10px 2px 0", color: "#8fa3b8", fontSize: "0.8rem" },
  sectionTitle: { fontSize: "1.1rem", color: "#3d556e", margin: "8px 2px 12px" },
  fieldCard: { background: "rgba(255,255,255,0.9)", border: "1px solid #d9e5f1", borderRadius: 16, padding: 16, marginBottom: 12 },
  fieldGrid: { display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12 },
  fieldFoot: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  checkRow: { display: "flex", alignItems: "center", gap: 6, fontSize: "0.88rem", color: "#5b748f" },
  msgOk: { margin: "0 0 14px", padding: "10px 16px", borderRadius: 12, background: "#e7f6ec", color: "#1f7a44", fontSize: "0.9rem" },
  msgError: { margin: "0 0 14px", padding: "10px 16px", borderRadius: 12, background: "#fdeaea", color: "#b91c1c", fontSize: "0.9rem" },
};
