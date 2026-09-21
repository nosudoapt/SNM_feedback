"use client";

import { useState } from "react";

export default function PublicForm({ slug, title, description, fields }) {
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | submitting | done | error
  const [topError, setTopError] = useState("");

  function setValue(key, value) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  function toggleCheckbox(key, option, checked) {
    setValues((v) => {
      const cur = Array.isArray(v[key]) ? v[key] : [];
      return { ...v, [key]: checked ? [...cur, option] : cur.filter((x) => x !== option) };
    });
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("submitting");
    setTopError("");
    setErrors({});
    try {
      const res = await fetch(`/api/f/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(data.fields || {});
        setTopError(data.error || "Submission failed.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setTopError("Network error. Please try again.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <div style={s.check}>✓</div>
          <h1 style={s.title}>Thank you!</h1>
          <p style={s.subtitle}>Your response has been recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <style>{`@keyframes btn-spin { to { transform: rotate(360deg); } }`}</style>
      <form style={s.card} onSubmit={handleSubmit}>
        <h1 style={s.title}>{title}</h1>
        {description && <p style={s.subtitle}>{description}</p>}
        {topError && <p style={s.topError}>{topError}</p>}

        {(fields || []).map((f) => (
          <div key={f.key} style={s.field}>
            <label style={s.label}>
              {f.label}
              {f.required && <span style={s.req}> *</span>}
            </label>
            {f.help && <p style={s.help}>{f.help}</p>}
            {renderInput(f, values[f.key], setValue, toggleCheckbox)}
            {errors[f.key] && <p style={s.err}>{errors[f.key]}</p>}
          </div>
        ))}

        <button type="submit" disabled={status === "submitting"} style={s.btn}>
          {status === "submitting" ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span style={s.spinner} aria-hidden="true" />
              Submitting…
            </span>
          ) : (
            "Submit"
          )}
        </button>
      </form>
    </div>
  );
}

function renderInput(f, value, setValue, toggleCheckbox) {
  const common = { style: s.input, value: value ?? "", onChange: (e) => setValue(f.key, e.target.value) };
  switch (f.type) {
    case "textarea":
      return <textarea {...common} style={{ ...s.input, minHeight: 90 }} />;
    case "tel":
      return <input type="tel" {...common} />;
    case "email":
      return <input type="email" {...common} />;
    case "number":
      return <input type="number" {...common} />;
    case "date":
      return <input type="date" {...common} />;
    case "select":
      return (
        <select {...common}>
          <option value="">Select…</option>
          {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case "radio":
      return (
        <div style={s.choices}>
          {(f.options || []).map((o) => (
            <label key={o} style={s.choice}>
              <input type="radio" name={f.key} value={o} checked={value === o} onChange={() => setValue(f.key, o)} /> {o}
            </label>
          ))}
        </div>
      );
    case "checkbox": {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div style={s.choices}>
          {(f.options || []).map((o) => (
            <label key={o} style={s.choice}>
              <input type="checkbox" checked={arr.includes(o)} onChange={(e) => toggleCheckbox(f.key, o, e.target.checked)} /> {o}
            </label>
          ))}
        </div>
      );
    }
    default:
      return <input type="text" {...common} />;
  }
}

const s = {
  wrap: { display: "flex", justifyContent: "center", alignItems: "flex-start", minHeight: "100vh", fontFamily: '"Inter", system-ui, sans-serif', padding: "40px 16px" },
  card: { background: "rgba(255,255,255,0.92)", border: "1px solid #d9e5f1", borderRadius: 24, boxShadow: "0 24px 70px rgba(96,136,172,0.16)", padding: "36px 30px", width: "min(560px, 100%)" },
  title: { margin: "0 0 6px", fontSize: "1.7rem", fontFamily: '"Space Grotesk", sans-serif', color: "#3d556e" },
  subtitle: { margin: "0 0 20px", color: "#7d93aa", fontSize: "0.95rem" },
  topError: { color: "#b91c1c", background: "#fdeaea", borderRadius: 12, padding: "10px 14px", margin: "0 0 16px", fontSize: "0.9rem" },
  field: { marginBottom: 18 },
  label: { display: "block", fontWeight: 700, color: "#3d556e", fontSize: "0.95rem", marginBottom: 6 },
  req: { color: "#dc2626" },
  help: { margin: "0 0 8px", color: "#8fa3b8", fontSize: "0.82rem" },
  input: { width: "100%", minHeight: 50, padding: "12px 15px", border: "1px solid #d9e5f1", borderRadius: 14, fontSize: "1rem", fontFamily: "inherit", background: "#fff", color: "#3d556e", boxSizing: "border-box" },
  choices: { display: "flex", flexDirection: "column", gap: 8 },
  choice: { display: "flex", alignItems: "center", gap: 8, color: "#3d556e", fontSize: "0.95rem" },
  err: { color: "#dc2626", margin: "6px 2px 0", fontSize: "0.82rem" },
  btn: { width: "100%", minHeight: 54, border: 0, borderRadius: 999, fontWeight: 800, cursor: "pointer", color: "white", background: "linear-gradient(135deg, #6ba2d6, #91c7e6)", boxShadow: "0 16px 34px rgba(107,162,214,0.28)", fontSize: "1rem", fontFamily: "inherit", marginTop: 8 },
  spinner: { width: 18, height: 18, border: "3px solid rgba(255,255,255,0.35)", borderTopColor: "white", borderRadius: "50%", animation: "btn-spin 0.8s linear infinite", display: "inline-block" },
  check: { width: 64, height: 64, borderRadius: "50%", background: "#e7f6ec", color: "#1f7a44", fontSize: "2rem", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" },
};
