// lib/duty-engine.js
//
// Pure, deterministic monthly duty-list generator for the Duty Roster.
// NO database access, NO framework imports — everything comes in through the
// `input` object so this module is fully unit-testable with `node --test`.
//
// It rebuilds the legacy "Duty List Automation" assignment logic:
//   - respect each pracharak's preferences (area / day / week-of-month / time)
//   - one duty per pracharak per day
//   - a minimum gap (in days) between a pracharak's duties
//   - branch (sector) cooldown: don't put the same pracharak back on a branch
//     they served in the recent window (current + previous N months of history)
//   - rating-based eligibility (a lower-tier pracharak can't lead a higher-tier
//     satsang), driven by a configurable rating matrix
//   - per-pracharak monthly target (soft by default, hard if sewaCountStrict)
//   - predefined local coverage (a satsang's designated local pracharak gets it)
//
// The result carries per-slot explanations and aggregate stats so the UI can
// show WHY each assignment (or gap) happened.

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIE_SEED = 0x9e3779b9;

// ---------- Specialization constants (Phase 1) ----------
export const SPECIALIZATIONS = [
  "hindi",
  "punjabi",
  "ramcharitmanas",
  "bhagavad_gita",
  "quran",
  "psychology",
  "general",
];

export const SPECIALIZATION_LABELS = {
  hindi: "Hindi",
  punjabi: "Punjabi",
  ramcharitmanas: "Ramcharitmanas",
  bhagavad_gita: "Bhagavad Gita",
  quran: "Quran",
  psychology: "Psychology",
  general: "General",
};

export const LOCATION_TYPES = ["urban", "semi_urban", "rural", "village"];

export const LOCATION_TYPE_LABELS = {
  urban: "Urban",
  semi_urban: "Semi-urban",
  rural: "Rural",
  village: "Village/Kheda",
};

// ---------- deterministic RNG (seedable, pure) ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Small stable string hash → 32-bit int (FNV-1a). Used to derive a per-slot,
// per-pracharak jitter so ties break deterministically without alphabetical bias.
export function hashStr(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------- date helpers (UTC-based to avoid timezone drift) ----------
export function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

// Format a UTC y/m(1-12)/d as 'YYYY-MM-DD' without going through toISOString.
export function ymd(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Convert 'YYYY-MM-DD' → integer day index (days since epoch) for gap math.
export function dateToDayNum(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

// Every date in the target month whose weekday matches `dayOfWeek` (0=Sunday).
// Returns [{ date:'YYYY-MM-DD', dayOfWeek, weekOfMonth }] where weekOfMonth is
// the occurrence number of that weekday in the month (1st, 2nd, ... = 1..5).
export function occurrencesInMonth(year, month, dayOfWeek) {
  const total = daysInMonth(year, month);
  const out = [];
  for (let day = 1; day <= total; day += 1) {
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (dow === dayOfWeek) {
      out.push({ date: ymd(year, month, day), dayOfWeek, weekOfMonth: Math.floor((day - 1) / 7) + 1 });
    }
  }
  return out;
}

// ---------- rule primitives (pure, exported for tests) ----------

// Rating eligibility. rows = pracharak rating, cols = satsang rating.
export function isRatingEligible(pracharakRating, satsangRating, ratingMatrix) {
  const row = ratingMatrix?.[pracharakRating];
  if (!row) return true; // unknown rating → don't block
  const allowed = row[satsangRating];
  return allowed !== false; // default allow unless explicitly false
}

// Does the pracharak clear the min-gap and one-per-day rules for this date,
// given the dates they're already assigned (this run + relevant history)?
export function passesGap(dateStr, assignedDayNums, minGapDays) {
  const target = dateToDayNum(dateStr);
  for (const dn of assignedDayNums) {
    const gap = Math.abs(target - dn);
    if (gap === 0) return false; // one duty per day
    if (gap < minGapDays) return false; // must be at least minGapDays apart
  }
  return true;
}

// Branch cooldown: excluded if the pracharak served this sector within the
// cooldown window. `sectorsServedRecently` is a Set of sectorIds drawn from
// history inside the window plus sectors already taken this run.
export function passesCooldown(sectorId, sectorsServedRecently) {
  if (!sectorId) return true;
  return !sectorsServedRecently.has(sectorId);
}

// Preference gate — only HARD dimensions block. A pracharak with no active
// preference sets is treated as unconstrained. AW-AD relaxes day/week/time
// (but never area). Passes if ANY active set satisfies all hard dimensions.
export function passesHardPreferences(slot, sets, dimensionMode, awAd) {
  if (!sets || sets.length === 0) return true;
  const mode = dimensionMode || {};
  return sets.some((set) => {
    if (mode.area === "hard" && arr(set.sectorIds).length && !arr(set.sectorIds).includes(slot.sectorId)) return false;
    if (!awAd && mode.day === "hard" && arr(set.days).length && !arr(set.days).includes(slot.dayOfWeek)) return false;
    if (!awAd && mode.week === "hard" && arr(set.weeks).length && !arr(set.weeks).includes(slot.weekOfMonth)) return false;
    if (!awAd && mode.time === "hard" && arr(set.times).length && !arr(set.times).includes(slot.timeType)) return false;
    return true;
  });
}

// Preference score in [0,1]: best fit across the pracharak's active sets.
// Rewards volunteers whose EXPLICIT preferences line up with the slot.
// Also gives a bonus for matching preferred (soft) dimensions.
export function preferenceScore(slot, sets, awAd) {
  if (!sets || sets.length === 0) return 0.4; // unconstrained -> mildly neutral
  let best = 0;
  for (const set of sets) {
    const dims = [
      ["area", arr(set.sectorIds), slot.sectorId, false],
      ["day", arr(set.days), slot.dayOfWeek, true],
      ["week", arr(set.weeks), slot.weekOfMonth, true],
      ["time", arr(set.times), slot.timeType, true],
    ];
    let explicit = 0;
    let matched = 0;
    let preferred = 0;
    let preferredMatched = 0;

    const PREFERRED_KEY = { area: "preferredSectorIds", day: "preferredDays", week: "preferredWeeks", time: "preferredTimes" };
    for (const [dimName, list, val, relaxable] of dims) {
      if (list.length) {
        explicit += 1;
        if (list.includes(val) || (awAd && relaxable)) matched += 1;
      }
      // Check preferred arrays (soft, for scoring bonus)
      const preferredList = arr(set[PREFERRED_KEY[dimName]]);
      if (preferredList.length) {
        preferred += 1;
        if (preferredList.includes(val)) preferredMatched += 1;
      }
    }
    const baseSc = explicit === 0 ? 0.5 : matched / explicit;
    const prefBonus = preferred > 0 ? (preferredMatched / preferred) * 0.2 : 0;
    const sc = Math.min(1, baseSc + prefBonus);
    if (sc > best) best = sc;
  }
  return best;
}

function arr(x) {
  return Array.isArray(x) ? x : [];
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// ---------- main generator ----------
//
// input = {
//   year, month,                       // target month, month is 1-12
//   satsangs: [{ id, name, sectorId, dayOfWeek, timeType, timeSlot, rating,
//                isActive, predefinedLocalPracharakId }],
//   pracharaks: [{ id, name, sectorId, rating, monthlyTarget, isActive, awAd }],
//   preferencesByPracharak: { [pracharakId]: [{ sectorIds, days, weeks, times }] },
//   history: [{ pracharakId, satsangId, sectorId, date:'YYYY-MM-DD' }],  // recent committed
//   config: { minGapDays, branchCooldownMonths, ratingMatrix, dimensionMode,
//             sewaCountStrict, rotationWeight, scoringWeights },
//   seed: number
// }
export function generateDutyList(input) {
  const {
    year,
    month,
    satsangs = [],
    pracharaks = [],
    branches = [],
    preferencesByPracharak = {},
    history = [],
    config = {},
    seed = DEFAULT_TIE_SEED,
  } = input || {};

  const cfg = normalizeConfig(config);
  const w = cfg.scoringWeights;

  // Build branch lookup: sectorId -> branch requirements
  const branchBySector = new Map();
  for (const b of branches) {
    if (b.sectorId) branchBySector.set(b.sectorId, b);
  }

  // Index pracharaks and their per-run mutable state.
  const activePracharaks = pracharaks.filter((p) => p.isActive !== false);
  const pById = new Map();
  const state = new Map(); // pracharakId → { dates:[dayNum], sectors:Set, count, target }
  for (const p of activePracharaks) {
    pById.set(p.id, p);
    state.set(p.id, {
      dates: [],
      sectors: new Set(),
      satsangs: new Set(),
      count: 0,
      target: Number.isFinite(p.monthlyTarget) ? p.monthlyTarget : 2,
    });
  }

  // Seed cooldown + gap state from history that falls inside the relevant window.
  // Window start = first day of (target month - branchCooldownMonths).
  const windowStartDayNum = dateToDayNum(
    ymd(...monthMinus(year, month, cfg.branchCooldownMonths), 1),
  );
  const historyByPracharak = new Map(); // id → { sectors:Set, dates:[dayNum], satsangs:Set }
  for (const h of history) {
    const dn = dateToDayNum(h.date);
    if (dn < windowStartDayNum) continue;
    if (!historyByPracharak.has(h.pracharakId)) {
      historyByPracharak.set(h.pracharakId, { sectors: new Set(), dates: [], satsangs: new Set() });
    }
    const hp = historyByPracharak.get(h.pracharakId);
    if (h.sectorId) hp.sectors.add(h.sectorId);
    if (h.satsangId) hp.satsangs.add(h.satsangId);
    hp.dates.push(dn);
  }

  // Build slots: one per satsang occurrence in the month.
  const activeSatsangs = satsangs.filter((sasa) => sasa.isActive !== false);
  const slots = [];
  for (const sat of activeSatsangs) {
    // Branch schedule requirement: if a branch for this sector defines requiredDays
    // (array of {week, day} objects), skip satsangs that don't match any entry.
    const branchReq = sat.sectorId ? branchBySector.get(sat.sectorId) : null;

    // If the satsang has a specific date, check if it falls in this month.
    if (sat.date) {
      const [sYear, sMonth, sDay] = String(sat.date).split("-").map(Number);
      if (sYear === year && sMonth === month) {
        const dow = new Date(Date.UTC(sYear, sMonth - 1, sDay)).getUTCDay();
        const wom = Math.floor((sDay - 1) / 7) + 1;
        if (branchReq && Array.isArray(branchReq.requiredDays) && branchReq.requiredDays.length > 0) {
          const matched = branchReq.requiredDays.some((r) => r.day === dow && r.week === wom);
          if (!matched) continue;
        }
        slots.push({
          satsangId: sat.id,
          satsangName: sat.name,
          sectorId: sat.sectorId || null,
          satsangRating: sat.rating ?? 2,
          date: sat.date,
          dayOfWeek: dow,
          weekOfMonth: wom,
          timeType: sat.timeType || "M",
          timeSlot: sat.timeSlot || "",
          predefinedLocalPracharakId: sat.predefinedLocalPracharakId || null,
        });
      }
    } else {
      // Recurring satsang — generate one slot per weekday occurrence in the month.
      for (const occ of occurrencesInMonth(year, month, sat.dayOfWeek ?? 0)) {
        if (branchReq && Array.isArray(branchReq.requiredDays) && branchReq.requiredDays.length > 0) {
          const matched = branchReq.requiredDays.some((r) => r.day === occ.dayOfWeek && r.week === occ.weekOfMonth);
          if (!matched) continue;
        }
        slots.push({
          satsangId: sat.id,
          satsangName: sat.name,
          sectorId: sat.sectorId || null,
          satsangRating: sat.rating ?? 2,
          date: occ.date,
          dayOfWeek: occ.dayOfWeek,
          weekOfMonth: occ.weekOfMonth,
          timeType: sat.timeType || "M",
          timeSlot: sat.timeSlot || "",
          predefinedLocalPracharakId: sat.predefinedLocalPracharakId || null,
        });
      }
    }
  }

  // Process most-constrained slots first (rating 1 hardest to fill), then by
  // date, then satsangId — deterministic ordering.
  slots.sort((a, b) =>
    a.satsangRating - b.satsangRating ||
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    (a.satsangId < b.satsangId ? -1 : a.satsangId > b.satsangId ? 1 : 0));

  const assignments = [];
  const unfilled = [];
  const ruleHits = { rating: 0, gap: 0, cooldown: 0, preference: 0, target: 0 };

  for (const slot of slots) {
    // 0) First Sunday of every month is reserved for Huzoor Discourse — no assignment.
    if (slot.dayOfWeek === 0 && slot.weekOfMonth === 1) {
      assignments.push({
        ...slotPublic(slot),
        pracharakId: null,
        isLocal: false,
        localKind: "none",
        reasonCode: "huzoor_discourse",
        score: null,
        explanation: "Huzoor Discourse — first Sunday of the month, no duty assignment required.",
        candidatesConsidered: 0,
      });
      continue;
    }

    // 1) Predefined local coverage takes priority (exempt from rating / gap /
    //    cooldown / preference, but must be active and not already busy today).
    const localId = slot.predefinedLocalPracharakId;
    if (localId && pById.has(localId)) {
      const st = state.get(localId);
      const localDayNums = st.dates.concat(historyOf(historyByPracharak, localId).dates);
      const busyToday = st.dates.includes(dateToDayNum(slot.date));
      if (!busyToday) {
        assign(slot, pById.get(localId), st, {
          isLocal: true,
          localKind: "predefined",
          reasonCode: "predefined_local",
          score: null,
          explanation: `Predefined local coverage — ${pById.get(localId).name} is the designated local pracharak for this satsang.`,
          candidatesConsidered: 1,
        });
        continue;
      }
    }

    // 2) Build eligible candidate pool by applying hard rules in order.
    const candidates = [];
    let reasonCounts = { rating: 0, gap: 0, cooldown: 0, preference: 0, target: 0 };
    for (const p of activePracharaks) {
      const st = state.get(p.id);
      const hist = historyOf(historyByPracharak, p.id);

      if (!isRatingEligible(p.rating ?? 2, slot.satsangRating, cfg.ratingMatrix)) { reasonCounts.rating += 1; continue; }

      // Specialization check: if branch requires specific specializations, pracharak must have at least one
      const branchReq = branchBySector.get(slot.sectorId);
      if (branchReq && branchReq.requiredSpecializations && branchReq.requiredSpecializations.length > 0) {
        const pracharakSpecs = p.specializations || [];
        const hasMatch = branchReq.requiredSpecializations.some((req) => pracharakSpecs.includes(req));
        if (!hasMatch) { reasonCounts.preference += 1; continue; }
      }

      const allDates = st.dates.concat(hist.dates);
      if (!passesGap(slot.date, allDates, cfg.minGapDays)) { reasonCounts.gap += 1; continue; }

      // Branch cooldown — scope is configurable. "satsang" (default) forbids
      // repeating the exact same congregation within the window; "sector"
      // forbids any satsang in a sector already served; "none" disables it.
      if (cfg.cooldownScope !== "none") {
        const key = cfg.cooldownScope === "sector" ? slot.sectorId : slot.satsangId;
        const servedRecently = cfg.cooldownScope === "sector"
          ? new Set([...st.sectors, ...hist.sectors])
          : new Set([...st.satsangs, ...hist.satsangs]);
        if (!passesCooldown(key, servedRecently)) { reasonCounts.cooldown += 1; continue; }
      }

      const sets = activeSetsFor(preferencesByPracharak, p.id);
      if (!passesHardPreferences(slot, sets, cfg.dimensionMode, p.awAd === true)) { reasonCounts.preference += 1; continue; }

      if (cfg.sewaCountStrict && st.count >= st.target) { reasonCounts.target += 1; continue; }

      candidates.push({ p, st, sets });
    }

    if (candidates.length === 0) {
      ruleHits.rating += reasonCounts.rating;
      ruleHits.gap += reasonCounts.gap;
      ruleHits.cooldown += reasonCounts.cooldown;
      ruleHits.preference += reasonCounts.preference;
      ruleHits.target += reasonCounts.target;
      unfilled.push({
        satsangId: slot.satsangId,
        satsangName: slot.satsangName,
        date: slot.date,
        reason: `No eligible pracharak (filtered: ${reasonCounts.rating} rating, ${reasonCounts.gap} gap, ${reasonCounts.cooldown} branch cooldown, ${reasonCounts.preference} preference${cfg.sewaCountStrict ? `, ${reasonCounts.target} at target` : ""}).`,
      });
      assignments.push({
        ...slotPublic(slot),
        pracharakId: null,
        isLocal: false,
        localKind: "none",
        reasonCode: "unfilled",
        score: null,
        explanation: "Left unfilled — no pracharak cleared the hard rules.",
        candidatesConsidered: 0,
      });
      continue;
    }

    // 3) Score candidates and pick the best (deterministic tie-breaks).
    let best = null;
    for (const c of candidates) {
      const hist = historyOf(historyByPracharak, c.p.id);
      const pref = preferenceScore(slot, c.sets, c.p.awAd === true);
      const locality = c.p.sectorId && slot.sectorId && c.p.sectorId === slot.sectorId ? 1 : 0;
      const recentCount = c.st.count + hist.dates.length;
      const rotation = (1 / (1 + recentCount)) * cfg.rotationWeight;
      const util = clamp((c.st.target - c.st.count) / Math.max(1, c.st.target), -1, 1);
      // Repeat-satsang penalty (rotation vs recent/comparison months).
      const repeatPenalty = hist.satsangs.has(slot.satsangId) ? 0.5 : 0;
      const score = w.preference * pref + w.locality * locality + w.rotation * rotation + w.utilization * util - repeatPenalty;

      const jitter = mulberry32(seed ^ hashStr(`${slot.satsangId}|${slot.date}|${c.p.id}`))();
      const cand = { c, score, pref, locality, rotation, util, jitter };
      if (best === null || betterThan(cand, best)) best = cand;
    }

    const chosen = best.c;
    assign(slot, chosen.p, chosen.st, {
      isLocal: chosen.p.sectorId && slot.sectorId && chosen.p.sectorId === slot.sectorId,
      localKind: chosen.p.sectorId === slot.sectorId ? "same_sector" : "none",
      reasonCode: "scored",
      score: round2(best.score),
      explanation: buildExplanation(best, chosen, slot),
      candidatesConsidered: candidates.length,
    });
  }

  // Re-sort assignments to a stable, human view order: date, then satsang name.
  assignments.sort((a, b) =>
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    (a.satsangName < b.satsangName ? -1 : a.satsangName > b.satsangName ? 1 : 0));

  const stats = buildStats(activePracharaks, state, slots.length, assignments, unfilled, ruleHits);
  return { year, month, assignments, unfilled, stats };

  // ----- inner helpers that close over run state -----
  function assign(slot, pracharak, st, extra) {
    st.dates.push(dateToDayNum(slot.date));
    if (slot.sectorId) st.sectors.add(slot.sectorId);
    st.satsangs.add(slot.satsangId);
    st.count += 1;
    assignments.push({
      ...slotPublic(slot),
      pracharakId: pracharak.id,
      pracharakName: pracharak.name,
      ...extra,
    });
  }
}

// ---------- supporting pure helpers ----------
function slotPublic(slot) {
  return {
    satsangId: slot.satsangId,
    satsangName: slot.satsangName,
    sectorId: slot.sectorId,
    satsangRating: slot.satsangRating,
    date: slot.date,
    dayOfWeek: slot.dayOfWeek,
    weekOfMonth: slot.weekOfMonth,
    timeType: slot.timeType,
    timeSlot: slot.timeSlot,
  };
}

function historyOf(map, id) {
  return map.get(id) || { sectors: new Set(), dates: [], satsangs: new Set() };
}

function activeSetsFor(prefs, id) {
  const list = prefs[id] || [];
  return list.filter((s) => s && s.isActive !== false);
}

// Candidate ordering: higher score, then fewer duties so far, then jitter, then id.
function betterThan(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  if (a.c.st.count !== b.c.st.count) return a.c.st.count < b.c.st.count;
  if (a.jitter !== b.jitter) return a.jitter > b.jitter;
  return a.c.p.id < b.c.p.id;
}

function buildExplanation(best, chosen, slot) {
  const bits = [];
  if (best.pref >= 0.99) bits.push("matches all stated preferences");
  else if (best.pref >= 0.5) bits.push("partial preference match");
  else if (best.pref > 0) bits.push("weak preference match");
  if (best.locality === 1) bits.push("same-sector (local)");
  bits.push(`${chosen.st.count}/${chosen.st.target} toward monthly target`);
  return `Assigned ${chosen.p.name} (score ${round2(best.score)}): ${bits.join("; ")}.`;
}

function buildStats(activePracharaks, state, totalSlots, assignments, unfilled, ruleHits) {
  const perPracharak = {};
  for (const p of activePracharaks) {
    const st = state.get(p.id);
    perPracharak[p.id] = {
      name: p.name,
      assigned: st.count,
      target: st.target,
      utilizationPct: st.target > 0 ? Math.round((st.count / st.target) * 100) : null,
    };
  }
  const filled = assignments.filter((a) => a.pracharakId).length;
  return {
    totalSlots,
    filled,
    unfilled: unfilled.length,
    fillRatePct: totalSlots > 0 ? Math.round((filled / totalSlots) * 100) : 100,
    ruleHits,
    perPracharak,
  };
}

function normalizeConfig(config) {
  const d = {
    minGapDays: 5,
    branchCooldownMonths: 3,
    cooldownScope: "satsang", // "satsang" | "sector" | "none"
    ratingMatrix: { 1: { 1: true, 2: true, 3: true }, 2: { 1: true, 2: true, 3: true }, 3: { 1: false, 2: true, 3: true } },
    dimensionMode: { area: "hard", day: "hard", week: "hard", time: "soft" },
    sewaCountStrict: false,
    rotationWeight: 1,
    scoringWeights: { preference: 3, locality: 2, rotation: 1, utilization: 2 },
  };
  return {
    ...d,
    ...config,
    ratingMatrix: config.ratingMatrix || d.ratingMatrix,
    dimensionMode: { ...d.dimensionMode, ...(config.dimensionMode || {}) },
    scoringWeights: { ...d.scoringWeights, ...(config.scoringWeights || {}) },
  };
}

// Returns [year, month] shifted back by `months` (month stays 1-12).
export function monthMinus(year, month, months) {
  let m = month - months;
  let y = year;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  return [y, m];
}

function round2(x) {
  return x == null ? null : Math.round(x * 100) / 100;
}
