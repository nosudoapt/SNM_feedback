"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (!code) return;
    const messages = {
      oauth_not_configured: "Google sign-in isn't set up yet — use your username and password.",
      access_denied: "Google sign-in was cancelled.",
      not_allowed: "That Google account isn't on the allowlist. Ask an admin to add it.",
    };
    setNotice(messages[code] || "Google sign-in failed. Please try again.");
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      router.push("/admin");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <img src="/logo/logo.webp" alt="Logo" style={styles.logo} />
        <h1 style={styles.title}>Admin Login</h1>
        <p style={styles.subtitle}>Pracharak Mahatma Feedback</p>
        {notice && <p style={styles.notice}>{notice}</p>}
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>
        <a href="/api/auth/google/start" style={styles.googleBtn}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Sign in with Google
        </a>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    fontFamily: '"Inter", system-ui, sans-serif',
    padding: 16,
  },
  logo: {
    width: "auto",
    height: 48,
    objectFit: "contain",
    margin: "0 auto 18px",
    display: "block",
    opacity: 0.92,
  },
  card: {
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(217,229,241,0.9)",
    borderRadius: 28,
    boxShadow: "0 24px 70px rgba(96,136,172,0.16)",
    padding: "40px 32px",
    width: "min(400px, 100%)",
  },
  title: { margin: 0, fontSize: "2rem", fontFamily: '"Space Grotesk", sans-serif', color: "#3d556e" },
  subtitle: { margin: "4px 0 24px", color: "#7d93aa", fontSize: "0.95rem" },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  input: {
    width: "100%",
    minHeight: 54,
    padding: "14px 16px",
    border: "1px solid #d9e5f1",
    borderRadius: 16,
    fontSize: "1rem",
    fontFamily: "inherit",
    background: "#fff",
    color: "#3d556e",
    boxSizing: "border-box",
  },
  btn: {
    minHeight: 54,
    border: 0,
    borderRadius: 999,
    fontWeight: 800,
    cursor: "pointer",
    color: "white",
    background: "linear-gradient(135deg, #6ba2d6, #91c7e6)",
    boxShadow: "0 16px 34px rgba(107,162,214,0.28)",
    fontSize: "1rem",
    fontFamily: "inherit",
  },
  error: { color: "#dc2626", margin: 0, fontSize: "0.92rem" },
  notice: { color: "#8a6d1f", background: "#fdf4e0", border: "1px solid #f2e3bf", borderRadius: 12, padding: "10px 14px", margin: "0 0 18px", fontSize: "0.9rem" },
  divider: { display: "flex", alignItems: "center", gap: 12, margin: "18px 0" },
  dividerLine: { flex: 1, height: 1, background: "#e3ecf5" },
  dividerText: { color: "#9fb0c2", fontSize: "0.82rem" },
  googleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 54,
    borderRadius: 999,
    border: "1px solid #d9e5f1",
    background: "#fff",
    color: "#3d556e",
    fontWeight: 700,
    fontSize: "1rem",
    fontFamily: "inherit",
    textDecoration: "none",
    cursor: "pointer",
  },
};