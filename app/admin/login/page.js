"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
};