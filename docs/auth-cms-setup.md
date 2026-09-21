# Auth + Form CMS — Setup & Live-Test Guide

This guide covers everything added in the Auth-hardening and Form-CMS work:
environment variables, Google sign-in setup, the database migration, and a
manual checklist to confirm it all works on your Mac before you deploy.

> **Important:** the app was built and statically verified in an environment that
> **cannot** run `next build` / `next dev`. All the steps below assume you run the
> final `npm install && npm run build && npm run dev` on your own machine. If the
> build reports anything, fix-and-repeat before deploying.

---

## 1. What was added

**Authentication & access control**

- Central `middleware.js` gate over `/admin/*` and the private APIs.
- Signed-cookie sessions upgraded to carry **identity + role** (v2 tokens), while
  old cookies keep working (treated as owner / super-admin) — no one gets logged out.
- Three roles: **viewer** (read + export), **editor** (build forms + duty roster),
  **super_admin** (everything, incl. managing users).
- Email **allowlist**: only emails you add under *Users & Access* can sign in with Google.
- **Google sign-in** (optional) alongside the existing username/password
  "break-glass" login, which always works even if Google is misconfigured.
- Security headers in `next.config.js`, same-origin CSRF checks on writes,
  login rate-limiting, and an audit trail.

**Form CMS**

- *Forms* screen (`/admin/forms`) to build, publish, share and delete forms.
- Public dynamic form pages at **`/f/<slug>`**; submissions validated server-side.
- Per-form responses view with search, pagination and CSV export.
- Your 3 existing forms appear in the list as **read-only "Legacy"** entries — their
  public pages and data pipeline are untouched.

---

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill it in. Summary:

| Variable | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string. |
| `AUTH_SECRET` | Yes in prod | HMAC key for signing sessions. `openssl rand -hex 32`. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Yes | Break-glass password login. |
| `ADMIN_EMAIL` / `ADMIN_NAME` | Recommended | Seeded as an active super-admin, so you can log in with Google using this email. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Enables Google sign-in. Blank = disabled. |
| `OAUTH_REDIRECT_URL` | With Google | Must exactly match the URI registered in Google. |

> **Security:** never commit `.env.local`. Rotate `AUTH_SECRET` only when you
> intend to invalidate all existing sessions.

---

## 3. Google sign-in — click-by-click

1. Go to **console.cloud.google.com** → create or pick a project.
2. **APIs & Services → OAuth consent screen**: choose *External*, add an app name,
   your support email, and (under *Test users* while unverified) the emails that
   will sign in. Save.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized redirect URIs** — add the exact callback URL(s):
     - Dev: `http://localhost:3000/api/auth/google/callback`
     - Prod: `https://YOUR-DOMAIN/api/auth/google/callback`
4. Copy the **Client ID** and **Client secret** into `.env.local`
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), and set `OAUTH_REDIRECT_URL` to the
   matching callback URL.
5. Restart the dev server. The "Sign in with Google" button now works.

If any of the three Google vars are blank, the button shows a friendly
"not set up yet — use username and password" notice and password login still works.

---

## 4. Database migration

No manual SQL needed. Each data module creates/updates its own tables on first use
(`ensureSchema` / `ensureAccessSchema` / `ensureCmsSchema`), which is safe to run
repeatedly. New tables introduced:

- `admin_users`, `audit_log` — identity, allowlist, and audit trail.
- `forms` — CMS form definitions (your 3 existing forms are seeded here as
  read-only *legacy* rows so they show up in the list).
- `form_submissions` — responses to **dynamic CMS forms only**.

> **Why a separate submissions table?** The existing dashboard, stats and Excel
> export read the original `submissions` table and assume the 3 hardcoded form
> shapes. Dynamic forms have arbitrary fields, so their answers live in
> `form_submissions` — keeping the old reports exactly as they were.

---

## 5. Manual live-test checklist

Run `npm install && npm run build && npm run dev`, then:

**Auth**

- [ ] Visiting `/admin` while logged out redirects to `/admin/login`.
- [ ] Username/password login works and lands on the dashboard.
- [ ] (If configured) "Sign in with Google" works for an allowlisted email.
- [ ] A Google email **not** on the allowlist is refused with "not on the allowlist".
- [ ] Logout returns you to the login page and `/admin` is protected again.

**Users & Access** (super-admin only)

- [ ] `/admin/users` lists users; you can add an email, change a role, toggle active.
- [ ] The app refuses to demote/deactivate the **last** active super-admin.
- [ ] A viewer/editor visiting `/admin/users` sees the "super-admin only" screen.

**Form CMS**

- [ ] `/admin/forms` shows your 3 existing forms as *Legacy* (read-only) plus any new ones.
- [ ] Create a form, add fields (try select/checkbox/date/number), **Save & Publish**.
- [ ] Open the public link `/f/<slug>` in an incognito window and submit it.
- [ ] Required-field and type validation reject bad input; a good submission shows "Thank you".
- [ ] The response appears under *Responses*, and **Export CSV** downloads it.
- [ ] Legacy forms cannot be edited/deleted; their public pages still work unchanged.

**Regression (nothing broke)**

- [ ] The 3 original public forms still load and submit.
- [ ] The main dashboard, filters, and the existing Excel export are unchanged.
- [ ] The Duty Roster screens still work.

---

## 6. Follow-ups / notes

- **CSP** was intentionally left out of the security headers (the static forms rely
  on inline styles). Adding a Content-Security-Policy is a good future hardening step.
- The Duty Roster (Phases 2–4) and this Auth + CMS work should be **committed to git**
  from your machine — I made the code changes but did not create commits.
- Rate-limiting is in-memory (per server instance); for multi-instance deploys
  consider a shared store later.
