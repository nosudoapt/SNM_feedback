# SNM Feedback & GBM System — Complete Guide

A full walkthrough of how the site works, what happens to every piece of data, how the admin exports/downloads records, and how we will make the site whitelist-only with Microsoft authentication.

> Current status: the temporary access-token gate has been **removed**. The site is back to being fully reachable (forms are public; the admin dashboard is protected by its own login). The whitelist-only + Microsoft SSO upgrade is the next step — steps are at the bottom of this document.

---

## 1. What is this site?

A private system for the Prachar Vibhag that collects:

| Page | Purpose | Public? |
|------|---------|---------|
| `/` → `home.html` | Landing page linking to the 3 sections | Yes (for now) |
| `/feedback` → `feedback.html` | Index that links to the two feedback forms | Yes (for now) |
| `/feedback/branch-incharge` | Feedback form for Branch Incharge | **Yes — shared with people** |
| `/feedback/pracharak-mahatma` | Feedback form for Pracharak Mahatma | **Yes — shared with people** |
| `/gbm-ebm` | GBM–EBM pre-registration form | **Yes — shared with people** (preview) |
| `/find-pracharak` | Search zone / sector / incharge directory | Yes (for now) |
| `/admin` + `/admin/login` | Admin dashboard (stats, records, export) | No — login required |

---

## 2. The two public feedback forms

Both forms are plain HTML pages under `public/feedback/`. They load the zone list from `/zones-data.js` in the browser (no server call needed for the search).

### 2.1 Feedback for Branch Incharge

Fields in order:

1. **Your Name** — free text
2. **Your Phone Number** — 10 digits, auto-sanitised on input
3. **Type of Samagam held at your branch** — dropdown: **EMS / Bal / Mahila**
4. **Pracharak Mahatma Name who visited your sector** — free text
5. **Your Zone Number** — search box. Type a number or area name; suggestions appear. On mobile a full-screen picker opens instead.
6. **Your Sector** — only appears when the selected zone is a *special* zone (has sectors). Filled from zone data.
7. **Area name** — auto-filled, read-only.

Then the feedback section. **The content question changes depending on the Samagam type chosen:**

| Samagam type | Content question | Options |
|---|---|---|
| **EMS** | What was the ratio of the Vichar (discourse) done in English and Hindi? | 70:30 (English : Hindi, preferred) · 60:40 · 50:50 · 40:60 |
| **Bal** | Did the Pracharak Saint use child-friendly (Bal) examples and analogies to help the kids understand the discourse? | Yes · No |
| **Mahila** | Did the Pracharak Saint use the broader aspects of the women's lives and relevant examples/instances of women to help them connect with the discourse? | Yes · No |

Other feedback questions (same for every type):
- **Arrival Time of Pracharak Saint** — On time / Late. If *Late*, an extra field asks the actual time.
- **How was the conduct of Pracharak Saint?** — Excellent / Very Good / Good / Average / Poor
- **Improvements needed for the sewa** — free text

### 2.2 Feedback for Pracharak Mahatma

First a **Samagam category** is chosen: **Mahila Samagam / Bal Samagam / EMS (English Medium Samagam)**. Only the matching question panel is shown and everything else is hidden.

Common details: Name, Phone, Zone number (search), Sector (if special zone), Area name, Zonal/Sector incharge name (auto-filled), category.

**Mahila panel** asks:
- Age group(s) that participated
- Where the Satsang was arranged (Indoor/Outdoor)
- How many Saints were present
- Ratio of Geet, Vichar, Skit, Dance, Kavita (each 1–5)
- Were speakers able to convey the message effectively (Yes/Other + elaboration)
- How many saints did Manch Sanchalan (1/2)
- Time allotted for the discourse (30 / 25 / less than 25 min + actual time)
- Did the Samagam start & conclude on schedule (Yes/No + reason)
- Overall feedback

**Bal panel** — same style but child-specific: age group (Only Kids / Only Youth / Youth and Kids / Mixed), location, saints present, anchoring, ratios, time, speakers, schedule, feedback.

**EMS panel** — includes a language question (Hindi/English/Mixed) **plus the new English–Hindi ratio question**:
- What was the ratio of the Vichar done in English and Hindi? → 70:30 (preferred) / 60:40 / 50:50 / 40:60

Plus all the same ratio/anchoring/time/schedule/feedback questions.

### 2.3 Zone & Sector auto-fill

- Zone list lives in `zones-data.js` (static file). Zones are either **general** (has a Zonal Incharge) or **special** (has Sectors, each with a Sector Incharge).
- When a zone is picked, the form auto-fills the area name and incharge name, and shows the sector dropdown for special zones.
- The same data powers `/api/zones` (used by the find-pracharak page and admin).

---

## 3. GBM–EBM registration form (`/gbm-ebm`)

- Collects a full pre-registration profile (photo preview, address, etc.).
- **Currently a preview**: on submit it shows a message that registrations are not open yet — nothing is saved to the database.
- Once enabled, submissions will follow the **exact same pipeline as the feedback forms** (section 4) and appear in the admin + export (section 5). So "downloading the GBM form" will be the same CSV download described below, filtered by a GBM type.

---

## 4. What happens when someone submits a form?

```
Browser form  →  POST /api/submissions (JSON)  →  Neon PostgreSQL  →  Admin dashboard / Export
```

1. The form builds a JSON payload: the plain form fields **plus** resolved zone data (`zoneNo`, `zoneName`, `zoneType`, `sectorNo`, `sectorName`, `zonalInchargeName`, `sectorInchargeName`) and `category` (`mahila`, `bal`, `ems`, or `branch-incharge`).
2. The browser calls `POST /api/submissions` (`app/api/submissions/route.js`).
3. The API validates the required fields and calls `createSubmission()` in `lib/db.js`.
4. Data is written to a **Neon PostgreSQL** table `submissions`:
   - Columns: `id`, `created_at`, `name`, `phone`, `zone_no`, `zone_name`, `zone_type`, `sector_no`, `sector_name`, `zonal_incharge_name`, `sector_incharge_name`, `category`, and `payload` (a JSONB column that stores **all** the form answers so nothing is lost).
5. The form shows the returned ID as a thank-you message.

### Why the payload is JSONB
Every question (including the category-specific ones) is kept in the `payload` JSON object. This means new questions never require a database migration — the raw answer set is always preserved.

---

## 5. Admin dashboard and the "download" (export) process

### 5.1 Signing in
- `/admin/login` → user `ADMIN_USERNAME`, password `ADMIN_PASSWORD` (from env).
- On success the API creates an HMAC-signed session cookie (`snm_admin_session`, valid 7 days). No passwords are stored in the database — they only exist as env vars.

### 5.2 What the dashboard shows
- **Stats cards**: last 12 hours, last 24 hours, today, all submissions, and "since last export" (count of new records since the most recent CSV export).
- **Charts**: submissions per day (last 14 days), per category, and top zones.
- **Records table**: time, name, phone, zone, category — with search (name/phone/zone), filters (category, zone type), sorting, and pagination.
- **Detail drawer**: click any row to see the full answer set with friendly English labels (the raw `payload` answers are mapped to readable names).

### 5.3 The CSV download (this is the "downloaded GBM form" mechanism)
1. On the dashboard choose:
   - **Type**: All types / Pracharak Mahatma / Branch Incharge (later: GBM)
   - **Range**: All / Last 12 hours / Last 24 hours / Today / Since last export
2. Click **Download CSV** → calls `GET /api/export?type=...&range=...`.
3. The export route:
   - Requires the admin session (401 otherwise).
   - Builds a **CSV file** with fixed columns: ID, Created At, Name, Phone, Zone No, Zone Name, Zone Type, Sector No, Sector Name, Zonal Incharge, Sector Incharge, Category, then one column per question (values like `yes`, `indoor`, `excellent`, `70:30-english-hindi` are converted to readable text).
   - Only the columns relevant to the chosen type are included (e.g. Branch Incharge export has Pracharak name, arrival time, conduct, etc.).
   - Prepends a UTF-8 BOM so Excel opens it correctly.
   - Sends the file as `submissions-<type>-<range>-<date>.csv`.
4. Every export is **recorded** in the `export_runs` table (when + how many rows). This is what powers the "Since last export" stat, so you can prove how many new entries arrived after your last download.

---

## 6. Data flow diagram (summary)

```
Respondent ──► Feedback/GBM form ──► POST /api/submissions
                                        │
                                        ▼
                              Neon PostgreSQL (submissions + payload)
                                        │
                                        ▼
Admin (login) ──► Dashboard (stats/records) ──► GET /api/export ──► CSV download
```

---

## 7. Current security & privacy status

| Concern | Status |
|---|---|
| Public forms can't navigate to internal pages | ✅ All back/home links removed from the forms; the two forms + GBM contain zero internal links |
| Search engines indexing the site | ✅ `robots.txt` = Disallow all + `noindex, nofollow` meta on every page |
| Admin dashboard | ✅ Protected by username/password login + signed session cookie |
| Forms are open to anyone with the link | ✅ By design (chosen: form open, site protected) |
| The rest of the site is currently open | ⚠️ Home/feedback-index/find-pracharak are public **until** the SSO whitelist is implemented (section 8) |
| Site-wide access token gate | ❌ Removed as requested |

---

## 8. Next step: whitelist-only site + Microsoft authentication

Goal: only allowlisted Microsoft emails can reach the internal site; the shared feedback links stay public (and can later live on a neutral "mask" domain).

### 8.1 Create the Microsoft Entra app (one-time, done by someone with Microsoft account access)

1. Go to the **Azure Portal → Microsoft Entra ID → App registrations → New registration**.
2. **Supported account types**: choose **"Accounts in any organizational directory and personal Microsoft accounts"** (this is required so personal `@outlook.com` / `@hotmail.com` emails can sign in).
3. **Redirect URI**: `https://<your-site>/api/auth/callback` (and `http://localhost:3000/api/auth/callback` for local testing).
4. After creation, note the **Application (client) ID** and **Directory (tenant) ID**.
5. Go to **Certificates & secrets → New client secret** and save the secret value.

### 8.2 Add to environment (Vercel project settings → Environment Variables)

| Variable | Value |
|---|---|
| `AZURE_CLIENT_ID` | the Application (client) ID |
| `AZURE_CLIENT_SECRET` | the client secret |
| `AZURE_TENANT_ID` | the Directory (tenant) ID (or `common` for personal accounts) |
| `ALLOWED_EMAILS` | comma-separated whitelist, e.g. `alice@outlook.com,bob@hotmail.com` |

### 8.3 Code changes we will make

1. Add **"Continue with Microsoft"** sign-in (OAuth2 Authorization Code + PKCE) using the Entra app.
2. After Microsoft returns the profile, **compare the email against `ALLOWED_EMAILS`** (or a `allowed_users` table in Neon for adding people without redeploying). Non-listed emails are rejected.
3. Replace the current HMAC admin cookie with an **SSO session cookie** set only for allowlisted emails.
4. Protect the internal routes (`/`, `/feedback`, `/find-pracharak`, `/admin`) in middleware/route guards — public only for the two forms + GBM.
5. **Mask domain option**: create a second, neutral Vercel project that serves only the 3 public form pages with no branding and no links, so the public DNS never reveals the internal site.

---

## 9. Environment variables (current)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `AUTH_SECRET` | Secret used to sign the admin session cookie (HMAC) |
| `ADMIN_USERNAME` | Admin dashboard username |
| `ADMIN_PASSWORD` | Admin dashboard password |

---

## 10. Running locally

```bash
npm install
cp .env.example .env.local   # then fill in the real values
npm run dev                  # http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```
