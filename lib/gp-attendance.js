// lib/gp-attendance.js
// Pure, dependency-free logic for the GP (Gyan Prachark) attendance feature so it
// can be unit-tested with `node --test` and reused by both the server routes and
// the offline HTML file (the browser copy lives inline in the generated HTML).
//
// Terminology:
//   rid        — global roll number (1..N) assigned to every person in the GP list.
//                It is the ONLY key used in sync payloads, so they stay tiny.
//   marks      — { [rid]: { [yyyy-mm-dd]: { at, by } } }
//   payload    — the tiny JSON a field user copies offline and the admin pastes:
//                { app, v, h, d, by, came: [rid, ...] }

export const GP_APP_TAG = "gp-att";

// ---------------------------------------------------------------------------
// Hashing / normalization
// ---------------------------------------------------------------------------

// djb2 xor-hash as hex. Not cryptographic — only used to fingerprint the roster
// so a pasted payload made from a DIFFERENT version of the list is rejected.
export function djb2(str) {
  let h = 5381;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // force 32-bit
  }
  return ("00000000" + h.toString(16)).slice(-8);
}

// Lowercase, alphanumerics only — used as the search normalization everywhere.
export function normSearch(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

// Local-day ISO date (yyyy-mm-dd) without UTC shifting.
export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Civil day in IST regardless of where the server runs (Vercel = UTC).
// Used as the fallback attendance day on the server side.
export function istTodayISO(nowMs = Date.now()) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(nowMs);
  return s; // en-CA → yyyy-mm-dd
}

// ---------------------------------------------------------------------------
// Payload build / parse / merge
// ---------------------------------------------------------------------------

export function buildPayload({ ver, hash, date, by, came }) {
  return JSON.stringify({
    app: GP_APP_TAG,
    v: ver,
    h: hash,
    d: date,
    by: by || "",
    came: (came || []).map(Number).sort((a, b) => a - b),
  });
}

// Parse a pasted payload. Returns { ok: true, data } or { ok: false, error }.
export function parsePayload(text, { ver, hash } = {}) {
  let data;
  try {
    data = JSON.parse(String(text || "").trim());
  } catch {
    return { ok: false, error: "Not valid JSON" };
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.came)) {
    return { ok: false, error: "Missing came array" };
  }
  if (data.app && data.app !== GP_APP_TAG) {
    return { ok: false, error: "This is not a GP attendance payload" };
  }
  if (ver && data.v && data.v !== ver) {
    return { ok: false, error: `List version mismatch (got ${data.v}, this file is ${ver}). Share the latest file.` };
  }
  if (hash && data.h && data.h !== hash) {
    return { ok: false, error: "List checksum mismatch — the copy that produced this payload has a different list. Share the latest file." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.d || ""))) {
    return { ok: false, error: "Missing/invalid date" };
  }
  const came = data.came.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!came.length) return { ok: false, error: "Payload has no roll numbers" };
  return { ok: true, data: { ...data, came } };
}

// Merge a parsed payload into `marks`. Read-only — returns a new object plus a
// report. Dedupe is (rid + date): the same person on the same day is never
// stored twice, no matter how many payloads are pasted.
export function mergePayload(marks, payload, rosterCount) {
  const next = { ...marks };
  const report = { added: [], alreadyMarked: [], unknown: [], date: payload.d, by: payload.by || "imported" };
  for (const rid of payload.came) {
    if (rid > (rosterCount || 0)) { report.unknown.push(rid); continue; }
    if (next[rid] && next[rid][payload.d]) { report.alreadyMarked.push(rid); continue; }
    next[rid] = {
      ...(next[rid] || {}),
      [payload.d]: {
        at: payload.at || new Date().toISOString(),
        by: payload.by || "imported",
      },
    };
    report.added.push(rid);
  }
  return { marks: next, report };
}

// ---------------------------------------------------------------------------
// Search over the roster
// ---------------------------------------------------------------------------

// Build the searchable shadow-fields for a decoded roster record.
export function searchFields(record) {
  return {
    nname: normSearch(record.name),
    nphone: digitsOnly(record.phones),
    ngp: digitsOnly(record.gpNo),
    nzone: normSearch(record.zoneName) + normSearch(record.zoneNo),
  };
}

// One query may contain letters (name), digits (phone / GP no), or both →
// every token must match its own field type. Substring matching so the last
// few digits of a phone number are enough.
export function matchRecord(fields, query, nq) {
  if (!nq) return true;
  const tokens = String(query).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const t of tokens) {
    if (/^\d+$/.test(t) || /^\+?\d[\d\s-]*$/.test(t)) {
      const digits = digitsOnly(t);
      if (!(fields.nphone.includes(digits) || (fields.ngp && fields.ngp.includes(digits)))) return false;
    } else {
      if (!fields.nname.includes(normSearch(t))) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Offline user store (the baked-in USERS array in the HTML file)
// ---------------------------------------------------------------------------
// roles reuse the server's names: viewer | editor (recorder) | super_admin (admin)

export function roleLabel(role) {
  return role === "super_admin" ? "Admin" : role === "editor" ? "Recorder" : "Viewer";
}

export function rankOfRole(role) {
  return role === "super_admin" ? 3 : role === "editor" ? 2 : role === "viewer" ? 1 : 0;
}

export function canRole(role, minRole) {
  return rankOfRole(role) >= rankOfRole(minRole);
}

// Local users stored by an offline admin override the baked-ins entry-by-entry.
export function effectiveUsers(baked, local) {
  const map = new Map();
  for (const u of baked || []) map.set(String(u.u).toLowerCase(), u);
  for (const u of local || []) map.set(String(u.u).toLowerCase(), u);
  return [...map.values()].filter((u) => u && u.u && u.p && u.r);
}
