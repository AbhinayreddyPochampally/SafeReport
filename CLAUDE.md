# SafeReport — Build Brief for Claude Code

You are maintaining **SafeReport**, a workplace safety incident reporting system for
Aditya Birla Fashion & Retail (ABFRL). The pilot covers 20 retail stores and goes
live tomorrow. This file is your single source of truth — read it end-to-end before
touching the codebase.

Two companion references:
- `docs/DESIGN.md` — product, screens, flows, data model
- `docs/VISUAL_LANGUAGE.md` — palette, typography, components

The long-form product-design PDF lives at
`/mnt/user-data/outputs/SafeReport_Design_Document_v6.pdf` — use it when you need
context on why a decision was made.

---

## Your working agreement

The Phase A → G plan that originally drove this build is now historical (see the
appendix at the bottom). Day-to-day work is feature/fix-driven: no speculative
changes, no library swaps, verify against the live Supabase project, ship small.

If you're touching something the doc describes, the doc is law. If you're touching
something the doc doesn't describe, write the doc *first*.

---

## Stack (locked — do not substitute)

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Fonts:** DM Sans (body) + IBM Plex Sans (display), via `next/font`
- **Icons:** `lucide-react` only
- **Animation:** `framer-motion` (specifically for the wheel picker)
- **Database / Auth / Storage:** Supabase (managed Postgres 15)
- **Voice → English:** OpenAI two-stage pipeline — `gpt-4o-transcribe`
  (with `whisper-1` fallback) for transcription, `gpt-4o-mini` chat for
  translation. See §Translation pipeline.
- **Charts:** `recharts`
- **Excel / CSV:** `xlsx` (SheetJS)
- **PDF (QR posters):** `pdf-lib` + `qrcode`
- **Web push:** `web-push` + VAPID
- **Email:** `resend` (free tier for pilot)
- **SMS:** MSG91 (only for fatality alerts — stub until needed)
- **Hosting:** Railway (Nixpacks, Node 20 — see `nixpacks.toml`)
- **Source control:** GitHub → `main` branch auto-deploys

---

## Three surfaces, one Next.js app, route groups

```
app/
  (reporter)/r/[sap_code]/
    page.tsx              # screen 1 — landing (name + phone + locale toggle)
    category/page.tsx     # screen 2 — observation/incident triage
    category/[kind]/page.tsx  # screen 3 — sub-category grid
    when/page.tsx         # screen 4 — APPLE WHEEL PICKER (see §Wheel picker spec)
    voice/page.tsx        # screen 5a — voice recorder
    evidence/page.tsx     # screen 5 — photo (required) + voice/text
    review/page.tsx       # screen 6 — review + submit
    confirm/[report_id]/page.tsx   # confirmation

  (manager)/m/[sap_code]/
    page.tsx              # phone+password login OR inbox (depending on cookie)
    r/[report_id]/page.tsx       # report detail
    r/[report_id]/resolve/page.tsx  # resolution form

  (ho)/ho/
    layout.tsx            # 240px left sidebar shell
    page.tsx              # Overview — summary cards + 2 queues + heatmap
    all-reports/page.tsx  # Reports tab — filter card + dense table
    reports/[report_id]/page.tsx  # HO report detail (approve/return/void)
    analytics/page.tsx
    stores/page.tsx       # store registry — add/edit/QR/CSV import
    login/page.tsx

  api/
    reports/route.ts          # POST (new report), returns SR-NNNNNN
    reports/[id]/route.ts     # GET, PATCH (status transitions)
    resolutions/route.ts      # POST
    auth/manager/route.ts     # phone+password → signed cookie
    auth/ho/route.ts
    transcribe/route.ts       # two-stage pipeline, fired from /api/reports
    excel/export/route.ts
    excel/stores/route.ts     # CSV upsert with optional prune flag
    ho-stores/route.ts        # POST/PATCH from the Stores page
    ho-actions/route.ts       # approve / return / void
    qr/[sap_code]/route.ts    # single-store A4 poster PDF
    qr/bulk/route.ts          # multi-page poster PDF
    push/subscribe/route.ts
    push/vapid-public-key/route.ts
    notifications/dispatch/route.ts
```

---

## Surface viewports

- **Reporter** and **Manager** are phone-only, designed at ~375px. Don't add desktop
  layouts — the QR posters point straight at a phone.
- **HO** is desktop-only and frames itself inside a 240px sidebar shell. The console
  assumes a real screen; mobile is not a goal for the pilot.

---

## Environment variables

Copy `.env.example` → `.env.local` and fill these:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=
RESEND_API_KEY=
MSG91_AUTH_KEY=              # leave empty in pilot except for fatality testing
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:safety@abfrl.example

SESSION_SECRET=              # 32+ random bytes for manager JWT signing
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

If you see "Invalid API key" on a fresh Supabase project, decode the JWT payload
before re-pasting — keys with a URL-shaped `iss` or blank `sub`/`aud` are bad copies
of the dashboard value. The anon key needs `role: "anon"`, the service-role key
needs `role: "service_role"`.

---

## Manager auth — phone + password

The pilot used to ship a 4-digit PIN keypad. As of migration 002 it's a phone +
password flow:

- The store row carries `manager_phone` (display + identity) and
  `manager_password_hash` (bcrypt, cost 10). The legacy `manager_pin_hash` column is
  dropped at the end of the migration; if you re-add it as a hot-patch, drop it
  again once the new code is verified live (`ALTER TABLE stores DROP COLUMN IF
  EXISTS manager_pin_hash;`).
- `POST /api/auth/manager` takes `{ sap_code, phone, password }`. Phone is
  normalised to digits-only and we compare on the trailing 10 digits, so `+91 98200
  11234`, `9820011234`, and `(98200) 11234` all match. Password is 6–128 characters.
- A legacy `{ pin }` body is rejected with `410 Gone` so old clients surface a
  clear "update the app" message rather than a generic 400.
- Three-strikes lockout per SAP code (15-minute TTL) lives in process memory.
  Adequate for a single-instance pilot; if you ever scale horizontally, move it.
- Passwords are set by HO from the Stores page (Add store, or Edit → password
  field at the bottom of the modal). There's no self-service reset in the pilot.

HO auth is unchanged — Supabase Auth email + password, gated by middleware on
`/ho/*`.

---

## HO console layout

The HO console lives behind a left sidebar (240px, sticky, white-on-slate-50).
The sidebar is intentionally lean — **Overview, Reports, Analytics, Stores**, and
nothing else. Counts beside Overview / Reports / Stores are fetched server-side in
the layout so the sidebar shows live numbers without any client polling. No
Notifications, no Settings, no Help — those would be empty surfaces in the pilot.

### Overview (`/ho`)

Four summary cards (Reports this month / Awaiting my approval / Closed this month
/ Returned this month) sitting above two distinct queues:

- **Approval Queue** — sky-accented (`border-l-sky-600`). Status =
  `awaiting_ho`, oldest-first. This is the action queue; HO is the one who has to
  do something. Rows that have been waiting > 48h surface an SLA-breach indicator
  (orange-700 left bar, "SLA breach > 48h · N" header pill).
- **Reported Queue** — slate-accented (`border-l-slate-400`). Statuses =
  `new` | `in_progress` | `returned`, newest-first. Read-only awareness; the store
  manager owns these. Each row carries a status pill so HO can scan what's flowing.

Below the queues sits the 12-month × 8-category heatmap.

### Reports (`/ho/all-reports`)

Comprehensive browser over every report. The filter card carries free-text search,
a date range, brand and category multi-select chips, and status pills with live
counts. Filter state is URL-driven (searchParams) so refreshes are stable and
permalinks work. Pagination is server-side at 50 rows/page; the dense sortable
table is the body of the screen. Don't ship the whole pilot dataset to the
browser — keep the server-paged shape.

### Stores (`/ho/stores`)

Searchable, filterable table of the full store roster. Has:

- **Add store** button → modal with SAP code, name, brand, city, state,
  manager name + phone, and the initial password.
- **Edit** per row → same modal in edit mode, with the password field at the
  bottom for resets. Leaving the password blank keeps the existing one.
- **Per-store QR** download → `GET /api/qr/[sap_code]?download=1`, returns an
  A4 PDF poster generated in `lib/poster.ts` (the user's "See Something? Say
  Something" template, navy + orange-600 accent).
- **Bulk QR download** → `GET /api/qr/bulk?codes=...`, returns one multi-page PDF.
  When there are stores without a `qr_downloaded_at`, the button defaults to "new
  only"; otherwise it dumps all stores.
- **"New" badge** + **"Show new only"** filter for stores whose
  `qr_downloaded_at` is null. The badge clears once HO downloads the QR.
- **CSV import** → `POST /api/excel/stores`. Multipart, parsed with SheetJS,
  upserts by SAP code, hashes plain-text passwords with bcrypt before write.
  Includes an opt-in **"Treat this CSV as the master list"** prune flag — when
  set, active stores not in the CSV are marked `permanently_closed`. Reports stay
  intact for audit.

### Analytics

Recharts dashboards filterable by date range + brand + city + category, with an
Excel export hung off `/api/excel/export` (one sheet per month).

---

## Reporter localisation — English + Kannada across the flow

The first screen the reporter sees carries an **English / ಕನ್ನಡ** toggle pill.
Strings live in `lib/reporter-i18n.ts` and cover the entire reporter flow,
not just the landing form: triage, sub-category, when, evidence, review,
confirm, the store-not-found fallback, plus the shared `PhotoCapture`,
`VoiceRecorder`, and `PwaInstallPrompt` components. Category labels and
blurbs are localised too, via `labelFor(cat, locale)` / `blurbFor(cat, locale)`
in `lib/categories.ts` — `cat.label` still exists as the English fallback so
non-reporter surfaces (manager inbox, HO console, Excel export) can keep
reading it directly.

Locale persists in `localStorage` as `sr_locale`. Adding a new locale =
extend `LOCALES` + the `STRINGS` map (the category `*.label` / `*.blurb`
keys are part of the same map). The toggle in `reporter-form.tsx` renders
one button per `LOCALES` entry automatically.

Client components consume locale through the `useReporterLocale()` hook —
SSR-safe (returns "en" until hydration), then subscribes to the `sr:locale`
`CustomEvent` so a toggle on the landing re-renders every other locale-aware
mount on the page. Don't read `localStorage` directly in new screens; use
the hook.

The wheel-picker preview and the review-screen timestamp call
`Date.prototype.toLocaleString` with `kn-IN` when locale is Kannada so the
weekday and month render in Kannada script on browsers that ship that
locale data (modern Chrome / iOS Safari).

The manager and HO surfaces remain English-only — they're internal tools.

---

## Translation pipeline (v2)

Voice notes go through a two-stage pipeline in `app/api/transcribe/route.ts`:

1. **Stage A — transcribe.** `gpt-4o-transcribe` is the primary model
   (better recall on Indian languages, especially Kannada/Tamil/Telugu); on error
   it falls back to `whisper-1`. We pass a domain-aware `prompt` that biases
   decoding toward retail-floor vocabulary (PPE, mannequin, billing counter,
   trial room, mezzanine, etc).
2. **Stage B — translate.** `gpt-4o-mini` chat completion with a system prompt
   that demands a clean, formal English translation, preserves locations /
   equipment / times / body parts, and outputs `NO_INTELLIGIBLE_SPEECH` literal
   for unintelligible audio. Skipped when stage A returns English (we look at
   the language code and an ASCII-letters heuristic).

Three columns on `reports` carry the result:

- `transcript` — English (translated, or original if English to begin with)
- `transcript_source` — raw source-language transcript (audit + future
  re-translation without paying transcription again)
- `transcript_source_lang` — ISO-639-1 code returned by the transcriber
- `transcript_error` — populated on failure; the UI surfaces a banner

If Stage B fails but Stage A succeeded, we still persist `transcript_source` so
HO can read the source language if they happen to speak it. Each stage retries
3× with exponential backoff; only network and 5xx errors are retried.

The whole call is fired-and-forgotten from `/api/reports` after the row insert so
the reporter's confirmation screen is instant.

---

## Wheel picker spec (Screen 4)

**Critical — get this right. It's the visual centrepiece.**

- Three independent columns: **Day**, **Hour**, **Minute**
  - Day values: `["Today", "Yesterday", "2 days ago", "3 days ago", "4 days ago", "5 days ago", "6 days ago"]`
  - Hour values: `"00"` through `"23"`
  - Minute values: `["00", "15", "30", "45"]`
- **Five visible rows per column.** Row height 40 px.
- **Centre row is the selection.** It gets:
  - Fill: `bg-indigo-100` (#E0E7FF)
  - Border: `1px solid indigo-500` (#6366F1), `rounded-[3px]`
  - Text: `text-indigo-900 font-bold text-[14pt]`
- **Distance-1 rows:** `text-slate-600 text-[11pt]`
- **Distance-2 rows:** `text-slate-400 text-[9.5pt]`
- **Interaction:**
  - Vertical swipe on a column scrolls that column only
  - Momentum inertia, snap-to-row on release
  - Snap animation: `180ms cubic-bezier(0.2, 0.9, 0.3, 1)` — no bounce
  - Mouse wheel support on desktop
  - Keyboard: ArrowUp/Down = ±1 row, PageUp/Down = ±3 rows
  - Haptic `navigator.vibrate(5)` on selection change (wrap in a capability check)
- **Implementation:**
  - Use `framer-motion` with `motion.div drag="y"` + custom snap modifier
  - Do **NOT** install a third-party date-picker library
  - Expected component size: ~180 lines, split into `<Wheel />` + `<DateTimePicker />`
  - Accessibility: `role="spinbutton"` per column, `aria-valuenow/min/max`
- Respects `prefers-reduced-motion` — snap becomes 0ms instantaneous
- Header copy: "When did this happen?"
- Sub-header: "Scroll to adjust"
- Default selection: Today · current hour · nearest past quarter-hour

Reference rendering in the PDF, page 18 (`SafeReport_Design_Document_v6.pdf`).

---

## Photo capture — Android gallery fix

Both the reporter evidence screen and the manager resolution form use the
`<PhotoCapture>` component in `components/photo-capture.tsx`, which exposes **two
buttons**: "Take photo" (camera intent, `capture="environment"`) and "From
gallery" (no capture attr). Splitting into two inputs is deliberate — Android
WebView treats `capture` as a hint that hides the gallery picker on some OEMs,
which silently broke the upload path on the first round of pilot testing. Don't
collapse them back into a single input.

Photos are still compressed client-side to 1600px longest edge, 80% JPEG before
upload.

---

## HO report detail — side-by-side photo comparison

`/ho/reports/[report_id]` shows the original report photo and the resolution
proof photo side-by-side on `md+` screens (stacked on mobile). Left card =
"Reported" (the scene the reporter captured); right card = "Latest fix attempt"
(the manager's resolution photo). An arrow divider sits between them on wide
screens. Tap-to-expand works on either card.

---

## Palette rules (no green, no red)

- **Observations** (near miss / unsafe act / unsafe condition) → **Slate 600** (`#475569`)
- **Incidents** (all five injury categories) → **Amber 700** (`#B45309`)
- **Status: NEW** → Slate 600
- **Status: ACKNOWLEDGED** (`in_progress`) → Indigo 700 (`#4338CA`)
- **Status: AWAITING HO** → Sky 700 (`#0369A1`)
- **Status: CLOSED** → Teal 700 (`#0F766E`) — **not green**
- **Status: RETURNED** → Orange 700 (`#C2410C`) — **not red**
- **Primary CTA** → Indigo 700
- **Body text** → Slate 900
- **Page background** → Slate 50

Do not use `green-*`, `red-*`, `rose-*`, `crimson-*`, `lime-*`, or `emerald-*`
Tailwind utilities anywhere in the codebase. The QR poster (`lib/poster.ts`) gets
a one-time exception: it uses orange-600 for the warm headline accent, which is
palette-compliant.

---

## Refresh model (no realtime)

- **Do NOT use Supabase Realtime subscriptions.** No `.channel(...)`, no
  `.on('postgres_changes', ...)`.
- **Manager inbox:** poll every 30 seconds when the tab is visible. Use
  `document.visibilityState === 'visible'` to gate the interval. Stop on unmount.
- **HO dashboard:** no polling. Every page is `dynamic = "force-dynamic"`, fetches
  fresh on navigation. HO users respond to email/SMS notifications, then open
  the dashboard on demand.
- **Notifications are the "something happened" trigger** — not in-app subscriptions.

---

## Schema additions you should know about

Beyond `supabase/schema.sql`, two migrations have run:

- **`002_manager_password.sql`** — adds `stores.manager_password_hash` and
  `stores.qr_downloaded_at`, drops `stores.manager_pin_hash`. Idempotent.
- **`003_transcript_source.sql`** — adds `reports.transcript_source` and
  `reports.transcript_source_lang`. Idempotent.

Demo data wipe: `supabase/wipe_demo_data.sql` clears reports, resolutions, HO
actions, push subscriptions, and notification logs but preserves stores and HO
users. Run it before a fresh smoke test.

---

## Smoke tests

Two scripts cover the public-facing surface:

- **`npm run smoke:api`** → `bash scripts/smoke-api.sh`. Hits the public routes
  (reporter landing, manager login, auth rejection paths, QR auth gate, HO redirect)
  and asserts none of them 500. Set `SR_BASE_URL` to point at local or Railway.
- **`npm run smoke:translate`** → `tsx scripts/smoke-translate.ts`. Exercises the
  two-stage transcription pipeline against a known audio file.

Run smoke:api on Windows from Git Bash: `SR_BASE_URL=https://... bash scripts/smoke-api.sh`.

---

## Design fidelity — hard rules

These don't change.

- Every status badge is `{icon} {label}` — never colour-only
- No component imports `green-*` or `red-*` Tailwind classes (grep as a lint check)
- The wheel picker implements the exact visual spec above
- No Supabase Realtime subscription anywhere — search for `.channel(` and
  `.on('postgres_changes'` as a lint check
- Reporter name and phone NEVER appear in the manager's view of the data —
  exclude those columns at query time, not at render time
- All copy uses the exact microcopy from DESIGN.md (the "Your name is visible only
  to Head Office" line matters — do not paraphrase)

---

## If you get stuck

1. Re-read the relevant section of this brief (it's the source of truth, not the
   PDF anymore)
2. Check VISUAL_LANGUAGE.md for tokens
3. Ask the team — do not invent behaviour not specified here

---

# RUNBOOK — Day 1 ops

This section is tactical. Pilot launches tomorrow. Know where every dial is.

## Deploy to Railway

`main` auto-deploys. To ship a change:

1. Run `npm run lint:guardrails && npx tsc --noEmit` locally. Strict-mode Next
   build will reject unused imports — the most recent failed deploy was a single
   stray import in a server component. Don't push to `main` without the typecheck.
2. `git push origin main`. Watch the Railway dashboard for the new build under
   the SafeReport service → Deployments. Watch the build log specifically for
   `next build` — Nixpacks (not Railpack) drives the build per `nixpacks.toml`,
   which pins Node 20 and explicit `install` / `build` / `start` phases.
3. Target Port in the Railway service settings must match the `$PORT` Next.js
   binds to (`npm run start` resolves to `next start -H 0.0.0.0 -p ${PORT:-3000}`).
   If health checks fail with a connection refused, this is almost always why.
4. **Roll back** from the Deployments tab → click the last known good build →
   "Redeploy". Don't try to revert a commit on `main` if you're under time
   pressure; redeploy is faster.

## Add a store

HO logs in → Stores tab in the sidebar → **Add store** (top right). Fill SAP code
(uppercase letters/digits/dashes — used in the QR URL), name, brand, city, state,
manager name, manager phone, and an initial password (6–128 chars). The password
is required at creation — without one the store can't accept manager logins. The
modal blocks submission with a clear error if you try.

## Distribute QR posters

HO → Stores → toggle the **"New only"** filter pill (top of the filter bar).
The button in the page header switches to **"Download N new QRs"**. Click it,
get a single multi-page PDF (one A4 poster per store), print, distribute. The
download fires a server-side update to `qr_downloaded_at`, so refreshing the
page clears the "New" badge on those rows.

For a one-off reprint, use the per-row **QR** button — it streams a single A4
PDF for that store.

## Reset a manager password

HO → Stores → click **Edit** on the row → scroll to the password panel at the
bottom of the modal. Enter the new password (6–128 chars). The old password
stops working immediately on save. Share the new password by phone, not text.

If a store row shows the orange "No password set" warning under the manager
column, the manager will fail every login attempt until you set one — fix it
the same way.

## Investigate a failed transcription

A report whose voice note didn't translate will surface a banner in the manager
and HO detail views. To debug:

1. Look up the row in Supabase: `select id, transcript, transcript_source,
   transcript_source_lang, transcript_error from reports where id = 'SR-...';`.
   `transcript_error` carries a one-line reason (audio fetch failed, transcription
   failed, translation failed, no speech detected, unintelligible).
2. If `transcript_source` is non-null but `transcript` is null, **Stage B
   failed** — transcription succeeded, translation didn't. HO can still read the
   source-language transcript. Re-run is cheap (just translation).
3. If both are null, **Stage A failed** — check Railway logs for `[transcribe]`
   warn/error lines. The most common cause is OpenAI rate limiting (status 429)
   or a malformed audio fetch.
4. To re-trigger: `POST /api/transcribe` with `{ "report_id": "SR-..." }`. The
   route is idempotent — it skips if `transcript` is already set.

## Pilot smoke test

From any shell on a clean install:

```
npm install
SR_BASE_URL=http://localhost:3000 bash scripts/smoke-api.sh
SR_BASE_URL=https://safereport.up.railway.app bash scripts/smoke-api.sh
```

(On Windows, use Git Bash — the inline `SR_BASE_URL=...` env-var syntax doesn't
work in PowerShell. If you must, set `$env:SR_BASE_URL` first, then call bash.)

`npm run smoke:translate` runs the two-stage pipeline against a fixture; it
needs `OPENAI_API_KEY`.

## Sandbox cleanup

Once new auth is verified live in production and no client is sending PIN
payloads:

```sql
ALTER TABLE stores DROP COLUMN IF EXISTS manager_pin_hash;
```

The migration already does this on a clean run, but the column was hot-patched
back in temporarily during the cutover — drop it again once you're sure
no rollback is on the table.

## Incident response checklist

If the manager inbox isn't updating during the smoke test:

1. The polling interval is **30s**, gated by tab visibility. Confirm the tab is
   foregrounded.
2. Confirm the report is for the SAP code the manager is logged into — the
   URL prefix is `/m/[sap_code]`.
3. Inspect the network tab for the GET to the inbox API — a 401 means the
   `sr_mgr` cookie has expired (7-day TTL) and the manager needs to sign in
   again.

If a reporter QR scan lands on "Store not found":

1. The SAP code in the URL is wrong, the store row is `permanently_closed`, or
   the store row was never created.
2. HO → Stores → search for the SAP code. If absent, add it. If closed, edit
   to active.

If web push isn't firing on the manager device:

1. iOS Safari requires the app to be installed to the home screen before push
   permission works. Chrome/Android works without that.
2. Check `push_subscriptions` for the SAP code.
3. Check `notification_log` for the dispatch attempt and any error.

---

# Appendix — How we got here (historical)

The original phased plan that drove the build is preserved below for reference.
All seven phases are complete and the exit criteria have shifted (e.g. Phase C
now reflects phone+password, not PIN; Phase D now reflects the sidebar console
and the two-queue Overview). Treat this as a build log, not as instructions.

## Phase A — Scaffold (~2h)

Blank Next.js app, Supabase wired, reporter landing renders the store name from
the DB. Created `app/(reporter)/r/[sap_code]/page.tsx`, the three Supabase
client wrappers, Tailwind palette, and the `next/font` setup.

## Phase B — Reporter flow (~5h)

End-to-end submission. Six screens (later restructured into landing → triage →
sub-category → wheel → evidence → review), `/api/reports` POST writing to
Storage and inserting a `reports` row with a fresh `SR-NNNNNN` id.

## Phase C — Manager flow (~5h)

PIN keypad → inbox with 30s visibility-gated polling → report detail → resolution
form. Note: PIN auth has since been replaced by phone+password (migration 002);
the keypad component is gone.

## Phase D — HO dashboard (~5h)

Originally shipped with a top nav (Overview / Analytics / Stores) and a single
"Active reports" panel on Overview. Now: 240px left sidebar (Overview / Reports
/ Analytics / Stores), two queues on Overview (Approval + Reported), full
Reports tab with URL-driven filters and server-paged 50/page table.

## Phase E — Whisper + notifications (~3h)

Whisper-1 single-stage translation. Now upgraded to the two-stage pipeline
described in §Translation pipeline (gpt-4o-transcribe + gpt-4o-mini), and
migration 003 added `transcript_source` + `transcript_source_lang`.

## Phase F — Excel I/O (~2h)

`/api/excel/export` (one sheet per month) and `/api/excel/stores` (CSV upsert
with the optional prune flag for treating the CSV as the master list).

## Phase G — Deploy + smoke test (~2h)

Live on Railway, custom domain, QR posters via `lib/poster.ts` rendered into
the user's "See Something? Say Something" template (single via
`/api/qr/[sap_code]`, bulk via `/api/qr/bulk`). Smoke tests automated as
`npm run smoke:api` and `npm run smoke:translate`.

— Team Alpha, IIM Mumbai · 17 April 2026 (original) · 12 May 2026 (this revision)
