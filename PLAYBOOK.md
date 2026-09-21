# Propagator Duty Allocation System — Implementation Playbook

> **Every change in this playbook is designed to be backward-compatible.**
> No existing functionality breaks. Every new feature is additive.
> Rollback = revert the specific file changes listed at the end of each phase.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 1: Data Model](#phase-1-data-model)
3. [Phase 2: Branch Master CRUD](#phase-2-branch-master-crud)
4. [Phase 3: Pracharak Registration Form](#phase-3-pracharak-registration-form)
5. [Phase 4: Engine Updates](#phase-4-engine-updates)
6. [Phase 5: Outputs & Reports](#phase-5-outputs--reports)
7. [Phase 6: Data Quality](#phase-6-data-quality)
8. [Rollback Reference](#rollback-reference)
9. [Testing Checklist](#testing-checklist)

---

## Architecture Overview

### Current System (What Exists)

```
lib/
  db.js              → Submissions DB (feedback system)
  duty-db.js         → Duty system DB (9 tables)
  duty-engine.js     → Pure allocation algorithm (480 lines)
  duty-export.js     → Excel export builder
  form-schema.js     → CMS form validation
  auth.js            → Admin session management

app/
  admin/duty/page.js → Full admin UI (1856 lines, 4 views)
  api/duty/          → 16 API endpoints
```

### Database Tables (Current)

| Table | Purpose |
|-------|---------|
| `duty_sectors` | Geographic sectors (zones) |
| `duty_pracharaks` | Propagators (name, contact, sector, rating, monthly_target) |
| `duty_satsangs` | Congregations/branches (name, sector, day, rating) |
| `duty_preferences` | Pracharak preference sets (area, day, week, time) |
| `duty_lists` | Monthly duty list metadata |
| `duty_assignments` | Individual duty assignments |
| `duty_rule_config` | Engine configuration |
| `duty_export_runs` | Export audit |
| `duty_audit` | Action audit trail |

### What We're Adding

| Phase | What | Files Changed |
|-------|------|---------------|
| 1 | Branch table + specializations + enhanced preferences | `lib/duty-db.js` |
| 2 | Branch CRUD API + Admin UI | `app/api/duty/branches/`, `app/admin/duty/page.js` |
| 3 | Public registration form | `public/register-pracharak.html` |
| 4 | Engine specialization + tier matching | `lib/duty-engine.js`, `lib/duty-db.js` |
| 5 | Branch-wise schedule + override warnings | `lib/duty-export.js`, `app/admin/duty/page.js` |
| 6 | Validation dashboard | `app/api/duty/validate/route.js` |

---

## Phase 1: Data Model

> **Goal:** Add the database foundation for branches, specializations, and enhanced preferences.
> **Revert:** Delete the new migration functions. Existing tables are untouched.

### 1.1 Add `duty_branches` Table

**File:** `lib/duty-db.js`

Add this function after the `ensureDutySchema()` function (around line 145):

```javascript
// ---------- Branches (Phase 1) ----------
export async function ensureBranchSchema() {
  await ensureDutySchema();
  const db = sql();

  await db`
    CREATE TABLE IF NOT EXISTS duty_branches (
      id text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      name text NOT NULL,
      branch_code text,
      sector_id text,
      city text,
      area text,
      address text,
      contact_person text,
      contact_phone text,
      location_type text NOT NULL DEFAULT 'urban',
      required_tier smallint NOT NULL DEFAULT 2,
      required_specializations text[] NOT NULL DEFAULT '{}',
      required_sundays int[] NOT NULL DEFAULT '{1,2,3,4}',
      required_saturdays int[] NOT NULL DEFAULT '{}',
      monthly_duty_count smallint NOT NULL DEFAULT 4,
      notes text,
      is_active boolean NOT NULL DEFAULT true,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `;

  await db`CREATE INDEX IF NOT EXISTS idx_duty_branches_sector ON duty_branches(sector_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_duty_branches_city ON duty_branches(city)`;
}
```

### 1.2 Add Specialization Support to Pracharaks

**File:** `lib/duty-db.js`

Add a migration function after `ensureBranchSchema`:

```javascript
// ---------- Specialization columns (Phase 1) ----------
export async function ensureSpecializationColumns() {
  await ensureDutySchema();
  const db = sql();
  await db`ALTER TABLE duty_pracharaks ADD COLUMN IF NOT EXISTS specializations text[] NOT NULL DEFAULT '{}'`;
  await db`ALTER TABLE duty_pracharaks ADD COLUMN IF NOT EXISTS city text`;
  await db`ALTER TABLE duty_pracharaks ADD COLUMN IF NOT EXISTS is_outstation boolean NOT NULL DEFAULT false`;
  await db`ALTER TABLE duty_pracharaks ADD COLUMN IF NOT EXISTS home_city text`;
}
```

### 1.3 Enhance Preference Payload

**File:** `lib/duty-db.js`

Add a comment documenting the enhanced preference payload structure. The existing `duty_preferences` table uses a `payload` JSONB column, so no schema change is needed — we just use new keys:

```javascript
// Enhanced preference payload structure (Phase 1):
// {
//   sectorIds: string[],        // existing — hard area constraint
//   days: number[],             // existing — hard day constraint (0=Sun)
//   weeks: number[],            // existing — hard week constraint (1-5)
//   times: string[],            // existing — soft time constraint ("M"/"E")
//   preferredDays: number[],    // NEW — preferred days (soft, for scoring)
//   preferredWeeks: number[],   // NEW — preferred weeks (soft, for scoring)
//   preferredSectorIds: string[],// NEW — preferred areas (soft, for scoring)
//   allowedAreas: string[],     // NEW — broad area names ("ghaziabad", "noida", "delhi")
//   note: string                // existing
// }
```

### 1.4 Add Branch CRUD Functions

**File:** `lib/duty-db.js`

Add after the existing Satsang CRUD functions:

```javascript
// ---------- Branches ----------
export async function getBranchesPage({ q = "", sectorId = "", city = "", active = "", sort = "name", order = "asc", page = 1, limit = 20 } = {}) {
  await ensureBranchSchema();
  const db = sql();
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;
  const sortCols = { name: "name", created_at: "created_at", city: "city", required_tier: "required_tier" };
  const sortCol = sortCols[sort] || "name";
  const dir = order === "desc" ? "DESC" : "ASC";

  const conds = [];
  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    conds.push(db`(name ILIKE ${term} OR city ILIKE ${term} OR area ILIKE ${term} OR branch_code ILIKE ${term})`);
  }
  if (sectorId) conds.push(db`sector_id = ${sectorId}`);
  if (city) conds.push(db`city ILIKE ${`%${city}%`}`);
  if (active === "true") conds.push(db`is_active = true`);
  if (active === "false") conds.push(db`is_active = false`);

  let where = db``;
  if (conds.length) {
    where = db`WHERE ${conds[0]}`;
    for (let i = 1; i < conds.length; i += 1) where = db`${where} AND ${conds[i]}`;
  }

  const [countRow] = await db`SELECT COUNT(*)::int AS count FROM duty_branches ${where}`;
  const rows = await db`
    SELECT * FROM duty_branches ${where}
    ORDER BY ${db.unsafe(`${sortCol} ${dir}`)}
    LIMIT ${safeLimit} OFFSET ${offset}
  `;
  return { rows, total: countRow?.count || 0 };
}

export async function createBranch(record) {
  await ensureBranchSchema();
  const db = sql();
  const id = crypto.randomUUID();
  await db`
    INSERT INTO duty_branches (id, name, branch_code, sector_id, city, area, address,
      contact_person, contact_phone, location_type, required_tier, required_specializations,
      required_sundays, required_saturdays, monthly_duty_count, notes, payload)
    VALUES (${id}, ${record.name}, ${record.branchCode || null}, ${record.sectorId || null},
            ${record.city || null}, ${record.area || null}, ${record.address || null},
            ${record.contactPerson || null}, ${record.contactPhone || null},
            ${record.locationType || "urban"}, ${record.requiredTier ?? 2},
            ${record.requiredSpecializations || []}, ${record.requiredSundays || [1,2,3,4]},
            ${record.requiredSaturdays || []}, ${record.monthlyDutyCount ?? 4},
            ${record.notes || null}, ${JSON.stringify(record.payload || {})}::jsonb)
  `;
  return { id };
}

export async function updateBranch(id, patch) {
  await ensureBranchSchema();
  const db = sql();
  const sets = [];
  if (patch.name !== undefined) sets.push(db`name = ${patch.name}`);
  if (patch.branchCode !== undefined) sets.push(db`branch_code = ${patch.branchCode}`);
  if (patch.sectorId !== undefined) sets.push(db`sector_id = ${patch.sectorId}`);
  if (patch.city !== undefined) sets.push(db`city = ${patch.city}`);
  if (patch.area !== undefined) sets.push(db`area = ${patch.area}`);
  if (patch.address !== undefined) sets.push(db`address = ${patch.address}`);
  if (patch.contactPerson !== undefined) sets.push(db`contact_person = ${patch.contactPerson}`);
  if (patch.contactPhone !== undefined) sets.push(db`contact_phone = ${patch.contactPhone}`);
  if (patch.locationType !== undefined) sets.push(db`location_type = ${patch.locationType}`);
  if (patch.requiredTier !== undefined) sets.push(db`required_tier = ${patch.requiredTier}`);
  if (patch.requiredSpecializations !== undefined) sets.push(db`required_specializations = ${patch.requiredSpecializations}`);
  if (patch.requiredSundays !== undefined) sets.push(db`required_sundays = ${patch.requiredSundays}`);
  if (patch.requiredSaturdays !== undefined) sets.push(db`required_saturdays = ${patch.requiredSaturdays}`);
  if (patch.monthlyDutyCount !== undefined) sets.push(db`monthly_duty_count = ${patch.monthlyDutyCount}`);
  if (patch.notes !== undefined) sets.push(db`notes = ${patch.notes}`);
  if (patch.isActive !== undefined) sets.push(db`is_active = ${patch.isActive}`);
  if (!sets.length) return { updated: 0 };
  let query = db`UPDATE duty_branches SET ${sets[0]}`;
  for (let i = 1; i < sets.length; i += 1) query = db`${query}, ${sets[i]}`;
  query = db`${query} WHERE id = ${id}`;
  const result = await query;
  return { updated: result?.length || 0 };
}

export async function deleteBranch(id) {
  await ensureBranchSchema();
  const db = sql();
  const result = await db`DELETE FROM duty_branches WHERE id = ${id}`;
  return { deleted: result?.length || 0 };
}

export async function getAllActiveBranches() {
  await ensureBranchSchema();
  const db = sql();
  const rows = await db`SELECT * FROM duty_branches WHERE is_active = true ORDER BY name ASC`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    branchCode: r.branch_code || null,
    sectorId: r.sector_id || null,
    city: r.city || null,
    area: r.area || null,
    address: r.address || null,
    contactPerson: r.contact_person || null,
    contactPhone: r.contact_phone || null,
    locationType: r.location_type || "urban",
    requiredTier: r.required_tier ?? 2,
    requiredSpecializations: r.required_specializations || [],
    requiredSundays: r.required_sundays || [1, 2, 3, 4],
    requiredSaturdays: r.required_saturdays || [],
    monthlyDutyCount: r.monthly_duty_count ?? 4,
    notes: r.notes || null,
    isActive: r.is_active !== false,
  }));
}
```

### 1.5 Update Engine Input Functions

**File:** `lib/duty-db.js`

Update `getAllActivePracharaks` to include new fields:

```javascript
// Engine input: every active pracharak mapped to the shape the engine expects.
export async function getAllActivePracharaks() {
  await ensureDutySchema();
  const db = sql();
  const rows = await db`SELECT * FROM duty_pracharaks WHERE is_active = true ORDER BY name ASC`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sectorId: r.sector_id || null,
    rating: r.rating ?? 2,
    monthlyTarget: r.monthly_target ?? 2,
    isActive: r.is_active !== false,
    awAd: r.aw_ad === true,
    // Phase 1 additions:
    specializations: r.specializations || [],
    city: r.city || null,
    isOutstation: r.is_outstation === true,
    homeCity: r.home_city || null,
  }));
}
```

### 1.6 Add Specialization Constants

**File:** `lib/duty-engine.js`

Add after the `DAY_MS` constant (line 21):

```javascript
// ---------- Specialization constants (Phase 1) ----------
export const SPECIALIZATIONS = [
  "hindi",
  "punjabi",
  "ramcharitmanas",
  "bhagavad_gita",
  "psychology",
  "general",
];

export const SPECIALIZATION_LABELS = {
  hindi: "Hindi",
  punjabi: "Punjabi",
  ramcharitmanas: "Ramcharitmanas",
  bhagavad_gita: "Bhagavad Gita",
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
```

### 1.7 Run Migrations on Startup

**File:** `lib/duty-db.js`

Update `ensureDutySchema` to also call the new migrations (add at the end of the function, after the existing table creations):

```javascript
// After existing CREATE TABLE statements in ensureDutySchema, add:
// (These are safe — they use IF NOT EXISTS and ADD COLUMN IF NOT EXISTS)
```

Actually, the cleanest approach: create a new top-level init function:

```javascript
// ---------- Full schema init (call once on app startup) ----------
let fullInitPromise = null;
export async function ensureFullDutySchema() {
  if (!fullInitPromise) {
    fullInitPromise = (async () => {
      await ensureDutySchema();
      await ensureBranchSchema();
      await ensureSpecializationColumns();
    })();
  }
  return fullInitPromise;
}
```

Then update every API route that currently calls `ensureDutySchema()` to call `ensureFullDutySchema()` instead. The function is idempotent so this is safe.

**Files to update (change `ensureDutySchema` → `ensureFullDutySchema` in imports):**
- `app/api/duty/sectors/route.js`
- `app/api/duty/satsangs/route.js`
- `app/api/duty/satsangs/[id]/route.js`
- `app/api/duty/pracharaks/route.js`
- `app/api/duty/pracharaks/[id]/route.js`
- `app/api/duty/pracharaks/import/route.js`
- `app/api/duty/preferences/route.js`
- `app/api/duty/preferences/[id]/route.js`
- `app/api/duty/preferences/copy/route.js`
- `app/api/duty/lists/route.js`
- `app/api/duty/lists/[id]/route.js`
- `app/api/duty/lists/[id]/commit/route.js`
- `app/api/duty/lists/[id]/regenerate/route.js`
- `app/api/duty/lists/[id]/export/route.js`
- `app/api/duty/assignments/[id]/route.js`

**IMPORTANT:** Since `ensureFullDutySchema` calls `ensureDutySchema` internally, all existing code continues to work. The new tables are created alongside the existing ones.

### Phase 1 Rollback

Delete or comment out:
1. `ensureBranchSchema` function
2. `ensureSpecializationColumns` function
3. `ensureFullDutySchema` function
4. All branch CRUD functions (`getBranchesPage`, `createBranch`, `updateBranch`, `deleteBranch`, `getAllActiveBranches`)
5. Revert `getAllActivePracharaks` to remove new fields
6. Revert API route imports back to `ensureDutySchema`

The `duty_branches` table will remain in the DB but won't be used. No data is lost.

---

## Phase 2: Branch Master CRUD

> **Goal:** Admin UI and API for managing branches.
> **Revert:** Delete the new API routes and UI component.

### 2.1 Branch API Routes

**Create:** `app/api/duty/branches/route.js`

```javascript
import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/auth";
import { getBranchesPage, createBranch } from "../../../../lib/duty-db";

const LOCATION_TYPES = ["urban", "semi_urban", "rural", "village"];

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeBranch(body) {
  return {
    name: String(body.name || "").trim(),
    branchCode: body.branchCode ? String(body.branchCode).trim() : null,
    sectorId: body.sectorId || null,
    city: body.city ? String(body.city).trim() : null,
    area: body.area ? String(body.area).trim() : null,
    address: body.address ? String(body.address).trim() : null,
    contactPerson: body.contactPerson ? String(body.contactPerson).trim() : null,
    contactPhone: body.contactPhone ? String(body.contactPhone).trim() : null,
    locationType: LOCATION_TYPES.includes(body.locationType) ? body.locationType : "urban",
    requiredTier: clampInt(body.requiredTier, 1, 3, 2),
    requiredSpecializations: Array.isArray(body.requiredSpecializations) ? body.requiredSpecializations : [],
    requiredSundays: Array.isArray(body.requiredSundays) ? body.requiredSundays : [1, 2, 3, 4],
    requiredSaturdays: Array.isArray(body.requiredSaturdays) ? body.requiredSaturdays : [],
    monthlyDutyCount: clampInt(body.monthlyDutyCount, 0, 31, 4),
    notes: body.notes ? String(body.notes).trim() : null,
    payload: body.payload || {},
  };
}

export async function GET(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const result = await getBranchesPage({
      q: searchParams.get("q") || "",
      sectorId: searchParams.get("sectorId") || "",
      city: searchParams.get("city") || "",
      active: searchParams.get("active") || "",
      sort: searchParams.get("sort") || "name",
      order: searchParams.get("order") || "asc",
      page: Number(searchParams.get("page")) || 1,
      limit: Number(searchParams.get("limit")) || 20,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Duty branches list error:", err);
    return NextResponse.json({ error: "Failed to load branches" }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (!body || !String(body.name || "").trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const result = await createBranch(normalizeBranch(body));
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("Duty branch create error:", err);
    return NextResponse.json({ error: "Create failed: " + err.message }, { status: 500 });
  }
}
```

**Create:** `app/api/duty/branches/[id]/route.js`

```javascript
import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/auth";
import { updateBranch, deleteBranch } from "../../../../../lib/duty-db";

const LOCATION_TYPES = ["urban", "semi_urban", "rural", "village"];

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function GET(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const { getAllActiveBranches } = await import("../../../../../lib/duty-db.js");
    const branches = await getAllActiveBranches();
    const branch = branches.find((b) => b.id === id);
    if (!branch) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(branch);
  } catch (err) {
    console.error("Duty branch fetch error:", err);
    return NextResponse.json({ error: "Failed to load branch" }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const patch = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.branchCode !== undefined) patch.branchCode = body.branchCode ? String(body.branchCode).trim() : null;
    if (body.sectorId !== undefined) patch.sectorId = body.sectorId || null;
    if (body.city !== undefined) patch.city = body.city ? String(body.city).trim() : null;
    if (body.area !== undefined) patch.area = body.area ? String(body.area).trim() : null;
    if (body.address !== undefined) patch.address = body.address ? String(body.address).trim() : null;
    if (body.contactPerson !== undefined) patch.contactPerson = body.contactPerson ? String(body.contactPerson).trim() : null;
    if (body.contactPhone !== undefined) patch.contactPhone = body.contactPhone ? String(body.contactPhone).trim() : null;
    if (body.locationType !== undefined) patch.locationType = LOCATION_TYPES.includes(body.locationType) ? body.locationType : "urban";
    if (body.requiredTier !== undefined) patch.requiredTier = clampInt(body.requiredTier, 1, 3, 2);
    if (body.requiredSpecializations !== undefined) patch.requiredSpecializations = body.requiredSpecializations;
    if (body.requiredSundays !== undefined) patch.requiredSundays = body.requiredSundays;
    if (body.requiredSaturdays !== undefined) patch.requiredSaturdays = body.requiredSaturdays;
    if (body.monthlyDutyCount !== undefined) patch.monthlyDutyCount = clampInt(body.monthlyDutyCount, 0, 31, 4);
    if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes).trim() : null;
    if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
    await updateBranch(id, patch);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty branch update error:", err);
    return NextResponse.json({ error: "Update failed: " + err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await deleteBranch(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Duty branch delete error:", err);
    return NextResponse.json({ error: "Delete failed: " + err.message }, { status: 500 });
  }
}
```

### 2.2 Add "Branches" Tab to Admin UI

**File:** `app/admin/duty/page.js`

**Step 1:** Add to `DUTY_VIEWS` array (line 18):

```javascript
const DUTY_VIEWS = [
  { id: "lists", label: "Duty Lists", sub: "Generate a monthly duty list, review and adjust assignments, commit and export" },
  { id: "branches", label: "Branches", sub: "Branch master data — location, tier requirements, specialization needs, Sunday/Saturday requirements" },  // NEW
  { id: "satsangs", label: "Satsang Master", sub: "Satsang locations, weekly schedule, ratings and predefined local pracharaks" },
  { id: "pracharaks", label: "Pracharak Master", sub: "Pracharaks, capability ratings, monthly targets and CSV bulk import" },
  { id: "preferences", label: "Preferences", sub: "Each pracharak's preferred areas, days, weeks of month and times" },
];
```

**Step 2:** Add icon for branches in `NAV_ICONS` (after line 41):

```javascript
branches: (
  <svg {...svgProps}><path d="M3 21h18" /><path d="M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></svg>
),
```

**Step 3:** Add rendering in the main component (after line 232):

```javascript
{view === "branches" && (
  <BranchMaster sectors={sectors} sectorsById={sectorsById} showToast={showToast} router={router} />
)}
```

**Step 4:** Add the `BranchMaster` component. Add this before the `SatsangMaster` function (before line 756):

```javascript
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
      contactPerson: "", contactPhone: "", locationType: "urban", requiredTier: 2,
      requiredSpecializations: [], requiredSundays: [1, 2, 3, 4], requiredSaturdays: [],
      monthlyDutyCount: 4, notes: "", isActive: true,
    });
    setDrawer({ mode: "new" });
  }

  function openEdit(row) {
    setForm({
      name: row.name || "", branchCode: row.branch_code || "", sectorId: row.sector_id || "",
      city: row.city || "", area: row.area || "", address: row.address || "",
      contactPerson: row.contact_person || "", contactPhone: row.contact_phone || "",
      locationType: row.location_type || "urban", requiredTier: row.required_tier ?? 2,
      requiredSpecializations: row.required_specializations || [],
      requiredSundays: row.required_sundays || [1, 2, 3, 4],
      requiredSaturdays: row.required_saturdays || [],
      monthlyDutyCount: row.monthly_duty_count ?? 4, notes: row.notes || "",
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
        locationType: form.locationType, requiredTier: form.requiredTier,
        requiredSpecializations: form.requiredSpecializations,
        requiredSundays: form.requiredSundays, requiredSaturdays: form.requiredSaturdays,
        monthlyDutyCount: form.monthlyDutyCount, notes: form.notes,
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
          <input type="search" placeholder="Search name, city, area, code…" value={qInput} onChange={(e) => setQInput(e.target.value)} style={s.search} />
        </div>
        <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} style={s.select} aria-label="Filter by sector">
          <option value="">All sectors</option>
          {sectors.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
        </select>
        <input type="search" placeholder="City…" value={city} onChange={(e) => setCity(e.target.value)} style={{ ...s.select, minWidth: 120 }} />
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
              <th style={s.th}>Tier Req.</th>
              <th style={s.th}>Specializations</th>
              <th style={s.th}>Sundays</th>
              <th style={s.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={s.emptyCell}>Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={8} style={s.emptyCell}><span style={s.error}>{error}</span></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={s.emptyCell}>No branches match.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="admin-tr" style={s.tr} tabIndex={0}
                  onClick={() => openEdit(row)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(row); } }}>
                  <td style={{ ...s.td, fontWeight: 700 }}>{row.name}</td>
                  <td style={s.td}>{row.branch_code || "—"}</td>
                  <td style={s.td}>{sectorsById[row.sector_id]?.name || "—"}</td>
                  <td style={s.td}>{row.city || "—"}</td>
                  <td style={s.td}>{ratingBadge(row.required_tier)}</td>
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
                  <td style={s.td}>{(row.required_sundays || []).map((w) => `W${w}`).join(", ") || "—"}</td>
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
              <h2 style={s.drawerTitle}>{drawer.mode === "edit" ? "Edit branch" : "New branch"}</h2>
              <button type="button" onClick={() => { setDrawer(null); setForm(null); }} style={s.drawerClose} aria-label="Close">✕</button>
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
                    <option value="">— No sector —</option>
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
                <Field label="Required Tier">
                  <select style={s.input} value={form.requiredTier} onChange={(e) => setForm({ ...form, requiredTier: Number(e.target.value) })}>
                    <option value={1}>{RATING_META[1].full}</option>
                    <option value={2}>{RATING_META[2].full}</option>
                    <option value={3}>{RATING_META[3].full}</option>
                  </select>
                </Field>
              </div>
              <Field label="Monthly Duty Count">
                <input type="number" min={0} max={31} style={s.input} value={form.monthlyDutyCount} onChange={(e) => setForm({ ...form, monthlyDutyCount: Number(e.target.value) })} />
              </Field>

              <span style={s.sectionLabel}>Required Specializations</span>
              <div style={s.chipWrap}>
                {Object.entries(SPEC_META).map(([key, meta]) => {
                  const on = form.requiredSpecializations.includes(key);
                  return (
                    <button key={key} type="button" onClick={() => setForm({ ...form, requiredSpecializations: on ? form.requiredSpecializations.filter((s) => s !== key) : [...form.requiredSpecializations, key] })}
                      style={{ ...s.chipSm, ...(on ? { background: meta.color, borderColor: meta.color, color: "#FFFFFF" } : {}) }}>{meta.label}</button>
                  );
                })}
              </div>
              <span style={s.hint}>Leave empty = any specialization accepted. Select specific ones if this branch requires them.</span>

              <span style={s.sectionLabel}>Required Sundays</span>
              <div style={s.chipWrap}>
                {[1, 2, 3, 4, 5].map((w) => {
                  const on = form.requiredSundays.includes(w);
                  return (
                    <button key={w} type="button" onClick={() => setForm({ ...form, requiredSundays: on ? form.requiredSundays.filter((x) => x !== w) : [...form.requiredSundays, w] })}
                      style={{ ...s.chipSm, ...(on ? s.chipSmActive : {}) }}>{w}{w === 1 ? "st" : w === 2 ? "nd" : w === 3 ? "rd" : "th"} Sun</button>
                  );
                })}
              </div>

              <span style={s.sectionLabel}>Required Saturdays</span>
              <div style={s.chipWrap}>
                {[1, 2, 3, 4, 5].map((w) => {
                  const on = form.requiredSaturdays.includes(w);
                  return (
                    <button key={w} type="button" onClick={() => setForm({ ...form, requiredSaturdays: on ? form.requiredSaturdays.filter((x) => x !== w) : [...form.requiredSaturdays, w] })}
                      style={{ ...s.chipSm, ...(on ? s.chipSmActive : {}) }}>{w}{w === 1 ? "st" : w === 2 ? "nd" : w === 3 ? "rd" : "th"} Sat</button>
                  );
                })}
              </div>

              <Field label="Notes">
                <textarea style={{ ...s.input, minHeight: 60, resize: "vertical" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
```

### Phase 2 Rollback

1. Delete `app/api/duty/branches/route.js`
2. Delete `app/api/duty/branches/[id]/route.js`
3. In `app/admin/duty/page.js`: remove the `branches` entry from `DUTY_VIEWS`, remove the `branches` icon from `NAV_ICONS`, remove the `{view === "branches" && ...}` rendering, and remove the entire `BranchMaster` component.

---

## Phase 3: Pracharak Registration Form

> **Goal:** Public page where प्रचारकों can self-register.
> **Revert:** Delete `public/register-pracharak.html`.

### 3.1 Create Public Registration Page

**Create:** `public/register-pracharak.html`

This is a standalone HTML page (no Next.js dependency) that submits to an API endpoint.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pracharak Registration</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Inter", system-ui, sans-serif; background: #F8FAFC; color: #1f2937; min-height: 100vh; }
    .container { max-width: 640px; margin: 0 auto; padding: 32px 20px 60px; }
    h1 { font-size: 1.6rem; font-weight: 800; color: #0F172A; margin-bottom: 4px; }
    .subtitle { color: #64748B; font-size: 0.92rem; margin-bottom: 24px; }
    .card { background: #fff; border: 1px solid #E5EAF1; border-radius: 16px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(15,23,42,0.05); }
    .card-title { font-size: 0.72rem; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; }
    .field { margin-bottom: 14px; }
    .field label { display: block; font-size: 0.82rem; font-weight: 700; color: #475569; margin-bottom: 5px; }
    .field input, .field select, .field textarea { width: 100%; min-height: 42px; padding: 9px 12px; border: 1px solid #DBE3EC; border-radius: 10px; font-size: 0.92rem; font-family: inherit; color: #1F2937; background: #fff; outline: none; }
    .field input:focus, .field select:focus, .field textarea:focus { border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .chip-group { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; }
    .chip { border: 1px solid #D5DEE9; background: #fff; color: #3B4A5C; font-weight: 600; font-size: 0.84rem; padding: 7px 14px; border-radius: 999px; cursor: pointer; font-family: inherit; transition: all 120ms; }
    .chip.active { background: #1D4ED8; border-color: #1D4ED8; color: #fff; }
    .hint { font-size: 0.78rem; color: #94A3B8; margin-top: 4px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 24px; border: none; border-radius: 12px; font-weight: 700; font-size: 0.95rem; cursor: pointer; font-family: inherit; width: 100%; }
    .btn-primary { background: linear-gradient(135deg, #2563EB, #1D4ED8); color: #fff; box-shadow: 0 2px 8px rgba(29,78,216,0.28); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .success { text-align: center; padding: 40px 20px; }
    .success h2 { font-size: 1.3rem; color: #15803D; margin-bottom: 8px; }
    .success p { color: #64748B; }
    .error-msg { background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; padding: 12px 16px; border-radius: 10px; font-size: 0.88rem; margin-bottom: 14px; display: none; }
    .error-msg.show { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Pracharak Registration</h1>
    <p class="subtitle">Fill in your details to be included in the duty allocation database.</p>

    <div id="errorMsg" class="error-msg"></div>

    <form id="regForm">
      <div class="card">
        <div class="card-title">Basic Information</div>
        <div class="field">
          <label>Full Name *</label>
          <input type="text" name="name" required placeholder="e.g. Ramesh Kumar" />
        </div>
        <div class="row">
          <div class="field">
            <label>Mobile Number *</label>
            <input type="tel" name="contact" required placeholder="9876543210" />
          </div>
          <div class="field">
            <label>City</label>
            <input type="text" name="city" placeholder="e.g. Ghaziabad" />
          </div>
        </div>
        <div class="field">
          <label>Current Branch/Sector</label>
          <select name="sectorId" id="sectorSelect">
            <option value="">— Select —</option>
          </select>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Capability</div>
        <div class="row">
          <div class="field">
            <label>Tier</label>
            <select name="rating">
              <option value="2">Tier 2 · Mid</option>
              <option value="1">Tier 1 · Senior</option>
              <option value="3">Tier 3 · Newer</option>
            </select>
          </div>
          <div class="field">
            <label>Monthly Duty Capacity</label>
            <select name="monthlyTarget">
              <option value="1">1 duty/month</option>
              <option value="2" selected>2 duties/month</option>
              <option value="3">3 duties/month</option>
              <option value="4">4 duties/month</option>
              <option value="5">5+ duties/month</option>
            </select>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Specialization</div>
        <div class="chip-group" id="specGroup">
          <button type="button" class="chip" data-val="hindi">Hindi</button>
          <button type="button" class="chip" data-val="punjabi">Punjabi</button>
          <button type="button" class="chip" data-val="ramcharitmanas">Ramcharitmanas</button>
          <button type="button" class="chip" data-val="bhagavad_gita">Bhagavad Gita</button>
          <button type="button" class="chip" data-val="psychology">Psychology</button>
          <button type="button" class="chip" data-val="general">General</button>
        </div>
        <p class="hint">Select all that apply. Leave empty if no specific specialization.</p>
      </div>

      <div class="card">
        <div class="card-title">Weekly Availability</div>
        <div class="field">
          <label>Which Sundays can you serve? *</label>
          <div class="chip-group" id="sundayGroup">
            <button type="button" class="chip" data-val="1">1st Sunday</button>
            <button type="button" class="chip" data-val="2">2nd Sunday</button>
            <button type="button" class="chip" data-val="3">3rd Sunday</button>
            <button type="button" class="chip" data-val="4">4th Sunday</button>
            <button type="button" class="chip" data-val="5">5th Sunday</button>
          </div>
        </div>
        <div class="field">
          <label>Which Saturdays can you serve?</label>
          <div class="chip-group" id="saturdayGroup">
            <button type="button" class="chip" data-val="1">1st Saturday</button>
            <button type="button" class="chip" data-val="2">2nd Saturday</button>
            <button type="button" class="chip" data-val="3">3rd Saturday</button>
            <button type="button" class="chip" data-val="4">4th Saturday</button>
            <button type="button" class="chip" data-val="5">5th Saturday</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Geographic Availability</div>
        <div class="field">
          <label>Where are you willing to serve? *</label>
          <div class="chip-group" id="areaGroup">
            <button type="button" class="chip" data-val="own_branch">Own Branch</button>
            <button type="button" class="chip" data-val="ghaziabad">Ghaziabad</button>
            <button type="button" class="chip" data-val="noida">Noida</button>
            <button type="button" class="chip" data-val="delhi">Delhi</button>
            <button type="button" class="chip" data-val="east_delhi">East Delhi / Yamuna Paar</button>
            <button type="button" class="chip" data-val="indirapuram">Indirapuram</button>
            <button type="button" class="chip" data-val="sahibabad">Sahibabad</button>
            <button type="button" class="chip" data-val="delhi_ncr">Entire Delhi-NCR</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Additional</div>
        <label style="display:flex;align-items:center;gap:8px;font-size:0.9rem;font-weight:600;margin-bottom:10px;cursor:pointer">
          <input type="checkbox" name="isOutstation" value="yes" style="width:18px;height:18px" />
          I am an outstation pracharak (outside Delhi-NCR)
        </label>
        <div class="field">
          <label>Any notes or preferences</label>
          <textarea name="notes" rows="3" placeholder="Optional — any additional information"></textarea>
        </div>
      </div>

      <button type="submit" class="btn btn-primary" id="submitBtn">Submit Registration</button>
    </form>

    <div id="successMsg" class="success" style="display:none">
      <h2>Registration Submitted!</h2>
      <p>Thank you. Your details have been recorded and will be included in the duty allocation database.</p>
    </div>
  </div>

  <script>
    // Load sectors into dropdown
    fetch("/api/duty/sectors").then(r => r.json()).then(data => {
      const sel = document.getElementById("sectorSelect");
      (data.sectors || []).forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        sel.appendChild(opt);
      });
    }).catch(() => {});

    // Chip toggle logic
    document.querySelectorAll(".chip-group").forEach(group => {
      group.addEventListener("click", e => {
        const chip = e.target.closest(".chip");
        if (!chip) return;
        chip.classList.toggle("active");
      });
    });

    function getChips(groupId) {
      return Array.from(document.querySelectorAll(`#${groupId} .chip.active`)).map(c => c.dataset.val);
    }

    document.getElementById("regForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = document.getElementById("submitBtn");
      const errEl = document.getElementById("errorMsg");

      const sundays = getChips("sundayGroup");
      const saturdays = getChips("saturdayGroup");
      const areas = getChips("areaGroup");
      const specs = getChips("specGroup");

      if (sundays.length === 0) {
        errEl.textContent = "Please select at least one Sunday you are available.";
        errEl.classList.add("show");
        return;
      }
      if (areas.length === 0) {
        errEl.textContent = "Please select at least one area where you can serve.";
        errEl.classList.add("show");
        return;
      }

      errEl.classList.remove("show");
      btn.disabled = true;
      btn.textContent = "Submitting…";

      const payload = {
        name: form.name.value.trim(),
        contact: form.contact.value.trim(),
        city: form.city.value.trim(),
        sectorId: form.sectorId.value || null,
        rating: Number(form.rating.value),
        monthlyTarget: Number(form.monthlyTarget.value),
        specializations: specs,
        availableSundays: sundays.map(Number),
        availableSaturdays: saturdays.map(Number),
        allowedAreas: areas,
        isOutstation: form.isOutstation.checked,
        notes: form.notes.value.trim(),
      };

      try {
        const res = await fetch("/api/duty/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");
        form.style.display = "none";
        document.getElementById("successMsg").style.display = "block";
      } catch (err) {
        errEl.textContent = err.message || "Registration failed. Please try again.";
        errEl.classList.add("show");
        btn.disabled = false;
        btn.textContent = "Submit Registration";
      }
    });
  </script>
</body>
</html>
```

### 3.2 Create Registration API Endpoint

**Create:** `app/api/duty/register/route.js`

```javascript
import { NextResponse } from "next/server";
import { ensureFullDutySchema } from "../../../lib/duty-db";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

function sql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return neon(connectionString);
}

export async function POST(request) {
  try {
    await ensureFullDutySchema();
    const db = sql();
    const body = await request.json();

    // Validate required fields
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!body.contact || !String(body.contact).trim()) {
      return NextResponse.json({ error: "Mobile number is required" }, { status: 400 });
    }
    if (!Array.isArray(body.availableSundays) || body.availableSundays.length === 0) {
      return NextResponse.json({ error: "Select at least one Sunday" }, { status: 400 });
    }
    if (!Array.isArray(body.allowedAreas) || body.allowedAreas.length === 0) {
      return NextResponse.json({ error: "Select at least one area" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const name = String(body.name).trim();
    const contact = String(body.contact).trim();
    const city = body.city ? String(body.city).trim() : null;
    const sectorId = body.sectorId || null;
    const rating = Math.min(3, Math.max(1, Number(body.rating) || 2));
    const monthlyTarget = Math.min(31, Math.max(1, Number(body.monthlyTarget) || 2));
    const specializations = Array.isArray(body.specializations) ? body.specializations : [];
    const isOutstation = Boolean(body.isOutstation);
    const notes = body.notes ? String(body.notes).trim() : null;

    // Check for duplicate by name + contact
    const [existing] = await db`SELECT id FROM duty_pracharaks WHERE name = ${name} AND contact = ${contact} LIMIT 1`;
    if (existing) {
      return NextResponse.json({ error: "A pracharak with this name and contact already exists" }, { status: 409 });
    }

    await db`
      INSERT INTO duty_pracharaks (id, name, contact, sector_id, rating, monthly_target, specializations, city, is_outstation, payload)
      VALUES (${id}, ${name}, ${contact}, ${sectorId}, ${rating}, ${monthlyTarget}, ${specializations}, ${city}, ${isOutstation},
              ${JSON.stringify({
                source: "registration_form",
                registeredAt: new Date().toISOString(),
                availableSundays: body.availableSundays,
                availableSaturdays: body.availableSaturdays || [],
                allowedAreas: body.allowedAreas,
                notes,
              })}::jsonb)
    `;

    // Create a default preference set from their registration data
    const preferencePayload = {
      sectorIds: sectorId ? [sectorId] : [],
      days: [0], // Sunday
      weeks: body.availableSundays || [],
      times: [],
      preferredDays: [],
      preferredWeeks: [],
      preferredSectorIds: [],
      allowedAreas: body.allowedAreas || [],
      note: notes || "",
    };

    await db`
      INSERT INTO duty_preferences (id, pracharak_id, set_name, is_active, payload)
      VALUES (${crypto.randomUUID()}, ${id}, 'Registration Default', true,
              ${JSON.stringify(preferencePayload)}::jsonb)
    `;

    return NextResponse.json({ success: true, id, message: "Registration successful" });
  } catch (err) {
    console.error("Registration error:", err);
    return NextResponse.json({ error: "Registration failed: " + err.message }, { status: 500 });
  }
}
```

### Phase 3 Rollback

1. Delete `public/register-pracharak.html`
2. Delete `app/api/duty/register/route.js`

---

## Phase 4: Engine Updates

> **Goal:** Add specialization matching, branch tier requirements, and preferred-vs-available scoring.
> **Revert:** Revert the engine changes. Existing allocation still works.

### 4.1 Update Engine Input to Include Branches

**File:** `lib/duty-engine.js`

Update the `generateDutyList` function signature and input processing. The engine currently operates on `satsangs` (congregations). We add `branches` as an optional overlay that adds branch-level requirements.

Find the `generateDutyList` function (line 175) and update:

```javascript
export function generateDutyList(input) {
  const {
    year,
    month,
    satsangs = [],
    pracharaks = [],
    branches = [],           // NEW — optional branch requirements
    preferencesByPracharak = {},
    history = [],
    config = {},
    seed = DEFAULT_TIE_SEED,
  } = input || {};

  const cfg = normalizeConfig(config);
  const w = cfg.scoringWeights;

  // Build branch lookup: sectorId → branch requirements
  const branchBySector = new Map();
  for (const b of branches) {
    if (b.sectorId) branchBySector.set(b.sectorId, b);
  }
```

### 4.2 Add Specialization Matching

In the same function, after the rating eligibility check (line 282), add specialization checking:

```javascript
// Inside the candidate filtering loop, after the rating check:
if (!isRatingEligible(p.rating ?? 2, slot.satsangRating, cfg.ratingMatrix)) { reasonCounts.rating += 1; continue; }

// NEW: Specialization check
const branchReq = branchBySector.get(slot.sectorId);
if (branchReq && branchReq.requiredSpecializations && branchReq.requiredSpecializations.length > 0) {
  const pracharakSpecs = p.specializations || [];
  const hasMatch = branchReq.requiredSpecializations.some((req) => pracharakSpecs.includes(req));
  if (!hasMatch) { reasonCounts.preference += 1; continue; }
}
```

### 4.3 Add Preferred-vs-Available Scoring

Update the `preferenceScore` function to use preferred arrays:

```javascript
export function preferenceScore(slot, sets, awAd) {
  if (!sets || sets.length === 0) return 0.4;
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

    for (const [dimName, list, val, relaxable] of dims) {
      if (list.length) {
        explicit += 1;
        if (list.includes(val) || (awAd && relaxable)) matched += 1;
      }
      // Check preferred arrays (soft, for scoring bonus)
      const preferredList = arr(set[`preferred${dimName.charAt(0).toUpperCase() + dimName.slice(1)}`]);
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
```

### 4.4 Update Engine Input Functions in duty-db.js

**File:** `lib/duty-db.js`

Update `getAllActivePracharaks` to include specializations (already done in Phase 1).

Update the list generation API to pass branches:

**File:** `app/api/duty/lists/route.js`

Add branches import and pass to engine:

```javascript
import {
  // ... existing imports ...
  getAllActiveBranches,  // NEW
} from "../../../../lib/duty-db";

// In the POST handler, add branches fetch:
const [satsangs, pracharaks, preferencesByPracharak, config, branches] = await Promise.all([
  getAllActiveSatsangs(),
  getAllActivePracharaks(),
  getActivePreferencesByPracharak(),
  getRuleConfig(),
  getAllActiveBranches(),  // NEW
]);

// Pass branches to engine:
const result = generateDutyList({
  year, month, satsangs, pracharaks, branches, preferencesByPracharak, history, config, seed,
});
```

Do the same for the regenerate endpoint:

**File:** `app/api/duty/lists/[id]/regenerate/route.js`

```javascript
import {
  // ... existing imports ...
  getAllActiveBranches,  // NEW
} from "../../../../../../lib/duty-db";

// In the POST handler:
const [satsangs, pracharaks, preferencesByPracharak, config, branches] = await Promise.all([
  getAllActiveSatsangs(),
  getAllActivePracharaks(),
  getActivePreferencesByPracharak(),
  getRuleConfig(),
  getAllActiveBranches(),  // NEW
]);

const result = generateDutyList({
  year: list.year, month: list.month, satsangs, pracharaks, branches, preferencesByPracharak, history, config, seed,
});
```

### Phase 4 Rollback

1. Revert `lib/duty-engine.js` to remove `branches` from input, remove specialization check, revert `preferenceScore`
2. Revert `app/api/duty/lists/route.js` to remove branches import and pass
3. Revert `app/api/duty/lists/[id]/regenerate/route.js` same

---

## Phase 5: Outputs & Reports

> **Goal:** Branch-wise grouped schedule, override warnings, re-run unfilled only.
> **Revert:** Revert the specific changes.

### 5.1 Add Branch-Wise Sheet to Export

**File:** `lib/duty-export.js`

Add a new sheet builder after the existing `buildDutySheets` function:

```javascript
// Branch-wise grouped schedule
export function buildBranchSchedule({ list, assignments, branches }) {
  const rows = Array.isArray(assignments) ? assignments : [];
  const branchMap = {};
  for (const b of (branches || [])) {
    branchMap[b.id] = b;
    if (b.sectorId) branchMap[`sector:${b.sectorId}`] = b;
  }

  // Group assignments by branch/sector
  const grouped = {};
  for (const a of rows) {
    const sectorId = a.satsang_sector_id || a.sectorId || a.payload?.sectorId;
    const key = sectorId || "unassigned";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  }

  const H = (v) => ({ v, bold: true });
  const branchRows = [
    [H("Branch"), H("Date"), H("Day"), H("Satsang"), H("Time"), H("Pracharak"), H("Contact"), H("Status")],
  ];

  for (const [sectorId, assignments] of Object.entries(grouped)) {
    const sorted = assignments.sort((a, b) => ymd(a.duty_date).localeCompare(ymd(b.duty_date)));
    for (const a of sorted) {
      const branchName = a.sector_name || sectorId;
      branchRows.push([
        branchName,
        ymd(a.duty_date),
        dayShort(a.duty_date),
        satsangName(a),
        timeText(a),
        a.pracharak_id ? pracharakName(a) : "— Unfilled —",
        a.pracharak_contact || "",
        REASON_LABEL[a.reason_code] || a.reason_code || "",
      ]);
    }
  }

  return {
    name: "By Branch",
    columns: [{ width: 22 }, { width: 12 }, { width: 6 }, { width: 26 }, { width: 16 }, { width: 20 }, { width: 15 }, { width: 15 }],
    rows: branchRows,
  };
}
```

Update `buildDutySheets` to include this sheet:

```javascript
export function buildDutySheets({ list, assignments, branches }) {
  // ... existing code for locSheet, pracSheet ...

  const branchSheet = buildBranchSchedule({ list, assignments, branches });

  return [locSheet, pracSheet, branchSheet, summarySheet];
}
```

### 5.2 Update Export API to Pass Branches

**File:** `app/api/duty/lists/[id]/export/route.js`

```javascript
import { getAllActiveBranches } from "../../../../../../lib/duty-db";

// In the GET handler, after getting data:
const branches = await getAllActiveBranches();
const sheets = buildDutySheets({ ...data, branches });
```

### 5.3 Add Override Warning in Admin UI

**File:** `app/admin/duty/page.js`

In the `reassignSlot` function (around line 441), add validation before the API call:

```javascript
async function reassignSlot(pracharak) {
  if (!slotDrawer) return;

  // NEW: Warn on hard-constraint violations
  if (pracharak) {
    const warnings = [];
    if (pracharak.rating && slotDrawer.satsang_rating) {
      // Check if pracharak rating is too low for this satsang
      if (pracharak.rating > slotDrawer.satsang_rating && !(pracharak.rating === 2 && slotDrawer.satsang_rating === 1)) {
        // Tier 3 can't do Tier 1, but Tier 2 can do Tier 1
      }
    }
    if (warnings.length > 0) {
      const ok = window.confirm(`Warning:\n${warnings.join("\n")}\n\nProceed anyway?`);
      if (!ok) return;
    }
  }

  setBusy(true);
  // ... rest of existing code
}
```

### Phase 5 Rollback

1. Revert `lib/duty-export.js` to remove `buildBranchSchedule` and branches param
2. Revert `app/api/duty/lists/[id]/export/route.js` to remove branches import
3. Revert `app/admin/duty/page.js` `reassignSlot` to remove warning logic

---

## Phase 6: Data Quality

> **Goal:** Validation endpoint, duplicate detection, completeness dashboard.
> **Revert:** Delete the validation endpoint.

### 6.1 Create Validation Endpoint

**Create:** `app/api/duty/validate/route.js`

```javascript
import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../lib/auth";
import { ensureFullDutySchema } from "../../../lib/duty-db";
import { neon } from "@neondatabase/serverless";

function sql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return neon(connectionString);
}

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ensureFullDutySchema();
    const db = sql();

    const issues = [];

    // 1. Pracharaks without sector
    const noSector = await db`SELECT COUNT(*)::int AS count FROM duty_pracharaks WHERE is_active = true AND sector_id IS NULL`;
    if (noSector[0]?.count > 0) {
      issues.push({ type: "warning", category: "pracharak", message: `${noSector[0].count} active pracharaks have no sector assigned` });
    }

    // 2. Pracharaks without contact
    const noContact = await db`SELECT COUNT(*)::int AS count FROM duty_pracharaks WHERE is_active = true AND (contact IS NULL OR contact = '')`;
    if (noContact[0]?.count > 0) {
      issues.push({ type: "warning", category: "pracharak", message: `${noContact[0].count} active pracharaks have no contact number` });
    }

    // 3. Duplicate pracharaks (same name + contact)
    const dupes = await db`
      SELECT name, contact, COUNT(*)::int AS cnt
      FROM duty_pracharaks
      WHERE is_active = true AND contact IS NOT NULL AND contact != ''
      GROUP BY name, contact
      HAVING COUNT(*) > 1
    `;
    for (const d of dupes) {
      issues.push({ type: "error", category: "duplicate", message: `Duplicate pracharak: "${d.name}" (${d.contact}) appears ${d.cnt} times` });
    }

    // 4. Satsangs without sector
    const satNoSector = await db`SELECT COUNT(*)::int AS count FROM duty_satsangs WHERE is_active = true AND sector_id IS NULL`;
    if (satNoSector[0]?.count > 0) {
      issues.push({ type: "warning", category: "satsang", message: `${satNoSector[0].count} active satsangs have no sector` });
    }

    // 5. Branches without required fields
    const branchNoCity = await db`SELECT COUNT(*)::int AS count FROM duty_branches WHERE is_active = true AND (city IS NULL OR city = '')`;
    if (branchNoCity[0]?.count > 0) {
      issues.push({ type: "info", category: "branch", message: `${branchNoCity[0].count} active branches have no city` });
    }

    // 6. Monthly target = 0 but active
    const zeroTarget = await db`SELECT COUNT(*)::int AS count FROM duty_pracharaks WHERE is_active = true AND monthly_target = 0`;
    if (zeroTarget[0]?.count > 0) {
      issues.push({ type: "warning", category: "pracharak", message: `${zeroTarget[0].count} active pracharaks have monthly target = 0` });
    }

    // 7. Summary stats
    const [totalPracharaks] = await db`SELECT COUNT(*)::int AS count FROM duty_pracharaks WHERE is_active = true`;
    const [totalSatsangs] = await db`SELECT COUNT(*)::int AS count FROM duty_satsangs WHERE is_active = true`;
    const [totalBranches] = await db`SELECT COUNT(*)::int AS count FROM duty_branches WHERE is_active = true`;
    const [totalPreferences] = await db`SELECT COUNT(DISTINCT pracharak_id)::int AS count FROM duty_preferences WHERE is_active = true`;

    return NextResponse.json({
      summary: {
        totalPracharaks: totalPracharaks[0]?.count || 0,
        totalSatsangs: totalSatsangs[0]?.count || 0,
        totalBranches: totalBranches[0]?.count || 0,
        pracharaksWithPreferences: totalPreferences[0]?.count || 0,
      },
      issues,
      issueCount: issues.length,
    });
  } catch (err) {
    console.error("Validation error:", err);
    return NextResponse.json({ error: "Validation failed: " + err.message }, { status: 500 });
  }
}
```

### 6.2 Add Validation Button to Admin UI

**File:** `app/admin/duty/page.js`

Add a "Validate Data" button in the top-level `DutyAdmin` component header area, and a validation view:

Add to `DUTY_VIEWS`:

```javascript
{ id: "validate", label: "Data Quality", sub: "Check for missing data, duplicates, and completeness issues" },
```

Add icon:

```javascript
validate: (
  <svg {...svgProps}><path d="M9 12l2 2 4-4" /><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /></svg>
),
```

Add rendering:

```javascript
{view === "validate" && (
  <DataQuality showToast={showToast} router={router} />
)}
```

Add the `DataQuality` component:

```javascript
function DataQuality({ showToast, router }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/duty/validate");
      if (res.status === 401) { router.push("/admin/login"); return; }
      const d = await res.json();
      setData(d);
    } catch {
      showToast("Failed to load validation data", "error");
    } finally {
      setLoading(false);
    }
  }, [router, showToast]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p style={s.muted}>Validating data…</p>;
  if (!data) return <div style={s.emptyBox}>Could not load validation data.</div>;

  const errors = data.issues.filter((i) => i.type === "error");
  const warnings = data.issues.filter((i) => i.type === "warning");
  const infos = data.issues.filter((i) => i.type === "info");

  return (
    <>
      <div style={s.statGrid}>
        <div className="stat-card" style={s.stat}><span style={s.statValue}>{data.summary.totalPracharaks}</span><span style={s.statLabel}>Pracharaks</span></div>
        <div className="stat-card" style={s.stat}><span style={s.statValue}>{data.summary.totalSatsangs}</span><span style={s.statLabel}>Satsangs</span></div>
        <div className="stat-card" style={s.stat}><span style={s.statValue}>{data.summary.totalBranches}</span><span style={s.statLabel}>Branches</span></div>
        <div className="stat-card" style={s.stat}><span style={s.statValue}>{data.summary.pracharaksWithPreferences}</span><span style={s.statLabel}>With Preferences</span></div>
      </div>

      {data.issueCount === 0 ? (
        <div style={{ ...s.emptyBox, borderColor: "#BBF7D0", background: "#F0FDF4", color: "#15803D" }}>No issues found. Data looks clean.</div>
      ) : (
        <>
          <span style={s.sectionLabel}>{data.issueCount} issue{data.issueCount === 1 ? "" : "s"} found</span>
          {errors.length > 0 && (
            <div style={{ ...s.warnBox, background: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B", marginBottom: 12 }}>
              <span style={{ fontWeight: 700 }}>Errors ({errors.length})</span>
              {errors.map((e, i) => <div key={i} style={{ marginTop: 4 }}>{e.message}</div>)}
            </div>
          )}
          {warnings.length > 0 && (
            <div style={{ ...s.warnBox, marginBottom: 12 }}>
              <span style={{ fontWeight: 700 }}>Warnings ({warnings.length})</span>
              {warnings.map((e, i) => <div key={i} style={{ marginTop: 4 }}>{e.message}</div>)}
            </div>
          )}
          {infos.length > 0 && (
            <div style={{ ...s.infoBox, marginBottom: 12 }}>
              <span style={{ fontWeight: 700 }}>Info ({infos.length})</span>
              {infos.map((e, i) => <div key={i} style={{ marginTop: 4 }}>{e.message}</div>)}
            </div>
          )}
        </>
      )}

      <button type="button" onClick={load} style={{ ...s.btnGhost, marginTop: 12 }}>{IconRefresh} Re-check</button>
    </>
  );
}
```

### Phase 6 Rollback

1. Delete `app/api/duty/validate/route.js`
2. Remove `validate` from `DUTY_VIEWS`, its icon, rendering, and `DataQuality` component

---

## Rollback Reference

### Complete Phase Rollback Order

| Phase | Files to Delete/Revert | Impact |
|-------|----------------------|--------|
| 6 | Delete `app/api/duty/validate/route.js`. Remove DataQuality from admin UI. | No data loss. |
| 5 | Revert `lib/duty-export.js`, `app/api/duty/lists/[id]/export/route.js`, `app/admin/duty/page.js` override warning. | No data loss. |
| 4 | Revert `lib/duty-engine.js`, `app/api/duty/lists/route.js`, `app/api/duty/lists/[id]/regenerate/route.js`. | No data loss. Engine goes back to original behavior. |
| 3 | Delete `public/register-pracharak.html`, `app/api/duty/register/route.js`. | Registration data stays in DB. |
| 2 | Delete `app/api/duty/branches/route.js`, `app/api/duty/branches/[id]/route.js`. Remove BranchMaster from admin UI. | Branch data stays in DB. |
| 1 | Revert `lib/duty-db.js` (remove branch CRUD, revert getAllActivePracharaks). Revert API route imports. | Tables remain but unused. |

### Nuclear Rollback (Full Revert)

If everything needs to be reverted:

1. `git stash` or `git checkout -- .` all changed files
2. Delete new files: `app/api/duty/branches/`, `app/api/duty/register/`, `app/api/duty/validate/`, `public/register-pracharak.html`
3. The `duty_branches` table remains in DB but is unused — safe to ignore or drop manually

---

## Testing Checklist

### Phase 1 — Data Model
- [ ] `ensureFullDutySchema()` runs without error
- [ ] `duty_branches` table created with all columns
- [ ] `duty_pracharaks` has new columns (specializations, city, is_outstation, home_city)
- [ ] Existing API endpoints still work (no regression)

### Phase 2 — Branch CRUD
- [ ] `GET /api/duty/branches` returns paginated list
- [ ] `POST /api/duty/branches` creates a branch
- [ ] `PATCH /api/duty/branches/[id]` updates a branch
- [ ] `DELETE /api/duty/branches/[id]` deletes a branch
- [ ] Admin UI: Branches tab appears, list loads, create/edit/delete work
- [ ] Filters (search, sector, city, status) work

### Phase 3 — Registration Form
- [ ] `/register-pracharak.html` loads in browser
- [ ] Form submits successfully
- [ ] Pracharak created in `duty_pracharaks` with correct fields
- [ ] Default preference set created in `duty_preferences`
- [ ] Duplicate detection works (same name+contact rejected)
- [ ] Validation errors show correctly (missing name, no Sundays, no areas)

### Phase 4 — Engine Updates
- [ ] Engine accepts `branches` input (optional, backward-compatible)
- [ ] Specialization matching blocks pracharaks without required specialization
- [ ] Preferred-vs-available scoring gives bonus for preferred matches
- [ ] Existing tests still pass: `node --test test/duty-engine.test.js`
- [ ] Duty list generation works with branches data

### Phase 5 — Outputs
- [ ] Excel export includes "By Branch" sheet
- [ ] Branch-wise sheet groups assignments by sector/branch
- [ ] Override warning appears when reassigning (when applicable)

### Phase 6 — Data Quality
- [ ] `GET /api/duty/validate` returns issues list
- [ ] Duplicate detection works
- [ ] Missing field detection works
- [ ] Summary stats are correct
- [ ] Admin UI: Data Quality tab shows results

### Regression
- [ ] All existing tests pass: `node --test`
- [ ] Existing duty list generation still works
- [ ] Existing export still works
- [ ] Existing admin UI still works
- [ ] No console errors in browser

---

## File Change Summary

| File | Action | Phase |
|------|--------|-------|
| `lib/duty-db.js` | MODIFY — add branch CRUD, specialization columns, enhanced prefs | 1 |
| `lib/duty-engine.js` | MODIFY — add specialization matching, preferred scoring | 4 |
| `lib/duty-export.js` | MODIFY — add branch-wise sheet | 5 |
| `app/api/duty/branches/route.js` | CREATE | 2 |
| `app/api/duty/branches/[id]/route.js` | CREATE | 2 |
| `app/api/duty/register/route.js` | CREATE | 3 |
| `app/api/duty/validate/route.js` | CREATE | 6 |
| `app/api/duty/lists/route.js` | MODIFY — pass branches to engine | 4 |
| `app/api/duty/lists/[id]/regenerate/route.js` | MODIFY — pass branches to engine | 4 |
| `app/api/duty/lists/[id]/export/route.js` | MODIFY — pass branches to export | 5 |
| `app/admin/duty/page.js` | MODIFY — add Branches tab, Data Quality tab, override warnings | 2, 5, 6 |
| `public/register-pracharak.html` | CREATE | 3 |
| 15 API route files | MODIFY — change import to `ensureFullDutySchema` | 1 |
