"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const CARDS = [
  { title: "Duty Roster", desc: "Manage pracharaks, branches, satsang schedules, and generate monthly duty lists", href: "/admin/duty", color: "#EEF2FF", border: "#C7D2FE", icon: "📅" },
  { title: "Feedback Forms", desc: "View submissions and analytics for branch-incharge and pracharak feedback forms", href: "/admin/forms", color: "#F0FDF4", border: "#BBF7D0", icon: "📝" },
  { title: "Form Builder", desc: "Create and manage custom CMS forms with public submission links", href: "/admin/forms", color: "#FFF7ED", border: "#FED7AA", icon: "🔧" },
  { title: "User Management", desc: "Manage admin users, roles, and access permissions", href: "/admin/users", color: "#FDF2F8", border: "#FBCFE8", icon: "👥" },
];

export default function RootPage() {
  const router = useRouter();
  const [auth, setAuth] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAuth(d))
      .catch(() => setAuth(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoggingIn(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed"); return; }
      window.location.reload();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFC", fontFamily: "system-ui, sans-serif" }}>
        <p style={{ color: "#94A3B8", fontSize: "0.95rem" }}>Loading...</p>
      </div>
    );
  }

  /* ── Not logged in → login form ── */
  if (!auth) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #EEF2FF 0%, #F8FAFC 50%, #F0FDF4 100%)", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ width: 380, background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", padding: "40px 32px" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: "2rem", marginBottom: 6 }}>🙏</div>
            <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#1E293B" }}>SNM Feedback</h1>
            <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "#64748B" }}>Sign in to access the admin dashboard</p>
          </div>
          <form onSubmit={handleLogin}>
            {error && <p style={{ background: "#FEF2F2", color: "#B91C1C", borderRadius: 8, padding: "8px 12px", fontSize: "0.82rem", fontWeight: 600, marginBottom: 12 }}>{error}</p>}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: 4 }}>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: "0.88rem", outline: "none", boxSizing: "border-box" }} onFocus={(e) => e.target.style.borderColor = "#6366F1"} onBlur={(e) => e.target.style.borderColor = "#E2E8F0"} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#475569", marginBottom: 4 }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: "0.88rem", outline: "none", boxSizing: "border-box" }} onFocus={(e) => e.target.style.borderColor = "#6366F1"} onBlur={(e) => e.target.style.borderColor = "#E2E8F0"} />
            </div>
            <button type="submit" disabled={loggingIn} style={{ width: "100%", padding: "11px 0", background: "#4F46E5", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: "0.9rem", cursor: loggingIn ? "default" : "pointer", opacity: loggingIn ? 0.7 : 1 }}>
              {loggingIn ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ── Logged in → dashboard hub ── */
  const roleLabel = auth.role === "super_admin" ? "Super Admin" : auth.role === "editor" ? "Editor" : "Viewer";

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.3rem" }}>🙏</span>
          <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "#1E293B" }}>SNM Feedback</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: "0.78rem", color: "#64748B" }}>
            {auth.email || auth.role} · <span style={{ background: "#EEF2FF", color: "#4F46E5", borderRadius: 4, padding: "2px 6px", fontWeight: 700, fontSize: "0.72rem" }}>{roleLabel}</span>
          </span>
        </div>
      </header>
      <main style={{ maxWidth: 840, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "1.5rem", fontWeight: 800, color: "#1E293B" }}>Welcome back</h1>
        <p style={{ margin: "0 0 32px", fontSize: "0.88rem", color: "#64748B" }}>Choose a section to get started</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {CARDS.map((c) => (
            <a key={c.title} href={c.href} style={{ display: "block", background: c.color, border: `1.5px solid ${c.border}`, borderRadius: 14, padding: "22px 24px", textDecoration: "none", transition: "box-shadow 0.15s, transform 0.15s", cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
            >
              <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>{c.icon}</div>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "#1E293B", marginBottom: 4 }}>{c.title}</div>
              <div style={{ fontSize: "0.82rem", color: "#475569", lineHeight: 1.45 }}>{c.desc}</div>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
