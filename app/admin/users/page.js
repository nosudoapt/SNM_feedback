"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const ROLE_OPTIONS = [
  { value: "viewer", label: "Viewer", hint: "Read + export submissions" },
  { value: "editor", label: "Editor", hint: "Build forms + manage duty roster" },
  { value: "super_admin", label: "Super admin", hint: "Full access incl. users" },
];
const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));

function fmt(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export default function UsersAccessPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [phase, setPhase] = useState("loading"); // loading | denied | ready
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState(null); // { type, text }
  const [busy, setBusy] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("viewer");

  const flash = useCallback((text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  }, []);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.status === 401) return router.push("/admin/login");
    if (res.status === 403) {
      setPhase("denied");
      return;
    }
    const data = await res.json();
    setUsers(data.users || []);
    setPhase("ready");
  }, [router]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/me");
      if (res.status === 401) return router.push("/admin/login");
      const data = await res.json();
      setMe(data);
      if (data.role !== "super_admin") {
        setPhase("denied");
        return;
      }
      await loadUsers();
    })();
  }, [router, loadUsers]);

  async function addUser(e) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim(), role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) return flash(data.error || "Could not add user", "error");
      setNewEmail("");
      setNewName("");
      setNewRole("viewer");
      flash(`Saved ${data.user.email}`);
      await loadUsers();
    } finally {
      setBusy(false);
    }
  }

  async function patchUser(email, patch) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || "Update failed", "error");
        await loadUsers(); // revert optimistic UI
        return;
      }
      await loadUsers();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.container}>
        <header style={s.header}>
          <div>
            <a href="/admin" style={s.back}>← Dashboard</a>
            <h1 style={s.title}>Users &amp; Access</h1>
            <p style={s.subtitle}>Control who can sign in and what they can do.</p>
          </div>
          {me && (
            <div style={s.meBox}>
              <div style={s.meEmail}>{me.email}</div>
              <div style={s.badge}>{ROLE_LABEL[me.role] || me.role}</div>
            </div>
          )}
        </header>

        {phase === "loading" && <div style={s.card}>Loading…</div>}

        {phase === "denied" && (
          <div style={s.card}>
            <h2 style={{ margin: "0 0 8px", color: "#3d556e" }}>Super-admin only</h2>
            <p style={{ margin: 0, color: "#7d93aa" }}>
              You don&apos;t have permission to manage users. Ask a super admin for access.
            </p>
          </div>
        )}

        {phase === "ready" && (
          <>
            <form onSubmit={addUser} style={s.addCard}>
              <div style={s.addGrid}>
                <input
                  type="email"
                  required
                  placeholder="person@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={s.input}
                />
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={s.input}
                />
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={s.input}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <button type="submit" disabled={busy} style={s.btn}>Add / update</button>
              </div>
              <p style={s.hint}>
                Adding an email here lets that Google account sign in. {ROLE_OPTIONS.map((r) => `${r.label}: ${r.hint}`).join(" · ")}
              </p>
            </form>

            {msg && (
              <div style={msg.type === "error" ? s.msgError : s.msgOk}>{msg.text}</div>
            )}

            <div style={s.tableCard}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Email</th>
                    <th style={s.th}>Name</th>
                    <th style={s.th}>Role</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Last login</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.email} style={{ opacity: u.active ? 1 : 0.55 }}>
                      <td style={s.td}>{u.email}</td>
                      <td style={s.td}>{u.name || "—"}</td>
                      <td style={s.td}>
                        <select
                          value={u.role}
                          disabled={busy}
                          onChange={(e) => patchUser(u.email, { role: e.target.value })}
                          style={s.roleSelect}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </td>
                      <td style={s.td}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => patchUser(u.email, { active: !u.active })}
                          style={u.active ? s.pillActive : s.pillInactive}
                        >
                          {u.active ? "Active" : "Disabled"}
                        </button>
                      </td>
                      <td style={s.td}>{fmt(u.last_login_at)}</td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td style={s.td} colSpan={5}>No users yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  wrap: { minHeight: "100vh", fontFamily: '"Inter", system-ui, sans-serif', padding: "28px 20px", color: "#3d556e" },
  container: { maxWidth: 960, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 22, flexWrap: "wrap" },
  back: { color: "#6ba2d6", textDecoration: "none", fontSize: "0.9rem", fontWeight: 600 },
  title: { margin: "6px 0 2px", fontSize: "1.9rem", fontFamily: '"Space Grotesk", sans-serif' },
  subtitle: { margin: 0, color: "#7d93aa", fontSize: "0.95rem" },
  meBox: { textAlign: "right" },
  meEmail: { fontSize: "0.9rem", color: "#5b748f" },
  badge: { display: "inline-block", marginTop: 4, padding: "3px 12px", borderRadius: 999, background: "#eaf2fb", color: "#4a80b4", fontSize: "0.78rem", fontWeight: 700 },
  card: { background: "rgba(255,255,255,0.9)", border: "1px solid #d9e5f1", borderRadius: 20, padding: 28 },
  addCard: { background: "rgba(255,255,255,0.9)", border: "1px solid #d9e5f1", borderRadius: 20, padding: 20, marginBottom: 16 },
  addGrid: { display: "grid", gridTemplateColumns: "1.4fr 1fr 0.9fr auto", gap: 10 },
  input: { minHeight: 46, padding: "10px 14px", border: "1px solid #d9e5f1", borderRadius: 12, fontSize: "0.95rem", fontFamily: "inherit", background: "#fff", color: "#3d556e", boxSizing: "border-box" },
  btn: { minHeight: 46, border: 0, borderRadius: 999, fontWeight: 800, cursor: "pointer", color: "white", background: "linear-gradient(135deg, #6ba2d6, #91c7e6)", padding: "0 22px", fontFamily: "inherit" },
  hint: { margin: "12px 2px 0", color: "#8fa3b8", fontSize: "0.8rem" },
  msgOk: { margin: "0 0 14px", padding: "10px 16px", borderRadius: 12, background: "#e7f6ec", color: "#1f7a44", fontSize: "0.9rem" },
  msgError: { margin: "0 0 14px", padding: "10px 16px", borderRadius: 12, background: "#fdeaea", color: "#b91c1c", fontSize: "0.9rem" },
  tableCard: { background: "rgba(255,255,255,0.9)", border: "1px solid #d9e5f1", borderRadius: 20, padding: 8, overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" },
  th: { textAlign: "left", padding: "12px 14px", color: "#7d93aa", fontWeight: 700, borderBottom: "1px solid #eef3f9", whiteSpace: "nowrap" },
  td: { padding: "12px 14px", borderBottom: "1px solid #f2f6fb", verticalAlign: "middle" },
  roleSelect: { padding: "6px 10px", border: "1px solid #d9e5f1", borderRadius: 10, background: "#fff", color: "#3d556e", fontFamily: "inherit" },
  pillActive: { border: 0, cursor: "pointer", padding: "4px 14px", borderRadius: 999, background: "#e7f6ec", color: "#1f7a44", fontWeight: 700, fontSize: "0.8rem" },
  pillInactive: { border: 0, cursor: "pointer", padding: "4px 14px", borderRadius: 999, background: "#eef1f4", color: "#8a97a6", fontWeight: 700, fontSize: "0.8rem" },
};
