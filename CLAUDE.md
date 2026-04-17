# SafeReport — Build Brief for Claude Code

You are building **SafeReport**, a workplace safety incident reporting system for
Aditya Birla Fashion & Retail (ABFRL). This file is your project spec and sequencing
guide. Read it end-to-end before writing code.

Two companion references:
- `docs/DESIGN.md` — product, screens, flows, data model
- `docs/VISUAL_LANGUAGE.md` — palette, typography, components

The long-form product-design PDF lives at
`/mnt/user-data/outputs/SafeReport_Design_Document_v6.pdf` — use it when you need
context on why a decision was made.

---

## Your working agreement

1. **Execute in phases A → G below.** Stop at the exit criterion of each phase and
   ask the team to verify before starting the next. Do not silently roll into the next phase.
2. **No speculative features.** If it's not in this brief or in DESIGN.md, don't build it.
3. **Verify against live Supabase data, not mocks.** Every exit criterion is "this works
   against the real DB with the real seed data."
4. **If a phase overruns its time estimate by 50%, pause and scope-reduce** before continuing.
5. **Commit at the end of every phase** with message `[Phase X] <summary>`.

---

## Stack (locked — do not substitute)

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Fonts:** DM Sans (body) + IBM Plex Sans (display), via `next/font`
- **Icons:** `lucide-react` only (no custom icons in the pilot)
- **Animation:** `framer-motion` (specifically for the wheel picker)
- **Database / Auth / Storage:** Supabase (managed Postgres 15)
- **Voice:** `openai` SDK — `audio.translations.create` endpoint (always English output)
- **Charts:** `recharts`
- **Excel:** `xlsx` (SheetJS, loaded via CDN in client bundles where needed)
- **Web push:** `web-push` + VAPID
- **Email:** `resend` (free tier for pilot)
- **SMS:** MSG91 (only for fatality alerts — leave stub until Phase E)
- **Hosting:** Railway
- **Source control:** GitHub → `main` branch auto-deploys

---

## Three surfaces, one Next.js app, route groups

```
app/
  (reporter)/r/[sap_code]/
    page.tsx            # screen 1 — landing (name + phone + role)
    category/page.tsx   # screen 2 — eight-icon grid
    voice/page.tsx      # screen 3 — voice recorder
    when/page.tsx       # screen 4 — APPLE WHEEL PICKER (see §Wheel picker spec)
    photo/page.tsx      # screen 5 — camera capture
    review/page.tsx     # screen 6 — review + submit
    confirm/[report_id]/page.tsx   # confirmation

  (manager)/m/[sap_code]/
    page.tsx            # PIN keypad OR inbox (depending on cookie)
    r/[report_id]/page.tsx   # report detail + resolution form

  (ho)/ho/
    page.tsx            # landing (cards + approval queue)
    reports/[report_id]/page.tsx   # HO report detail (approve/return/void)
    analytics/page.tsx
    stores/page.tsx     # store registry (CSV import)

  api/
    reports/route.ts    # POST (new report), returns SR-NNNNNN
    reports/[id]/route.ts  # GET, PATCH (status transitions)
    resolutions/route.ts   # POST
    auth/manager/route.ts  # PIN → signed cookie
    transcribe/route.ts    # background job, called from reports POST
    excel/export/route.ts
    excel/stores/route.ts
    push/subscribe/route.ts
    webhooks/notify/route.ts
```

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

## Palette rules (no green, no red)

- **Observations** (near miss / unsafe act / unsafe condition) → **Slate 600** (`#475569`)
- **Incidents** (all five injury categories) → **Amber 700** (`#B45309`)
- **Status: NEW** → Slate 600
- **Status: ACKNOWLEDGED** → Indigo 700 (`#4338CA`)
- **Status: AWAITING HO** → Sky 700 (`#0369A1`)
- **Status: CLOSED** → Teal 700 (`#0F766E`) — **not green**
- **Status: RETURNED** → Orange 700 (`#C2410C`) — **not red**
- **Primary CTA** → Indigo 700
- **Body text** → Slate 900
- **Page background** → Slate 50

Do not use `green-*`, `red-*`, `rose-*`, `crimson-*`, `lime-*`, or `emerald-*` Tailwind utilities
anywhere in the codebase. Lint against them if possible.

---

## Refresh model (no realtime)

- **Do NOT use Supabase Realtime subscriptions.** No `.channel(...)`, no `.on('postgres_changes', ...)`.
- **Manager inbox:** poll every 30 seconds when the tab is visible. Use
  `document.visibilityState === 'visible'` to gate the interval. Stop on unmount.
- **HO dashboard:** no polling. Fetches fresh on navigation. HO users respond to email/SMS
  notifications, then open the dashboard on demand.
- **All pages server-rendered or SSR-ish** so a browser refresh = fresh state.
- **Notifications are the "something happened" trigger** — not in-app subscriptions. See Phase E.

---

# Phases

## Phase A — Scaffold (~2h)

**Goal:** A blank Next.js app running locally, connected to Supabase, rendering the reporter
landing page with the store name pulled from the DB.

**Steps:**
1. `npx create-next-app@14 . --ts --tailwind --app --eslint --no-src-dir`
2. Install deps:
   ```
   npm install @supabase/supabase-js @supabase/ssr openai bcryptjs jose
   npm install framer-motion lucide-react recharts resend web-push
   npm install -D @types/bcryptjs @types/web-push
   npx shadcn@latest init
   npx shadcn@latest add button card input label badge dialog toast
   ```
3. Configure Tailwind with the v6 palette. Open `tailwind.config.ts` and extend with the
   exact colour tokens from `docs/VISUAL_LANGUAGE.md`.
4. Set up `next/font` for DM Sans + IBM Plex Sans in `app/fonts.ts`.
5. Create `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`
   (service-role client for API routes only, never exposed to browser).
6. Create `/app/(reporter)/r/[sap_code]/page.tsx` as a server component. Fetch
   `stores` row by `sap_code`. If inactive or not found, render a 404-style message.
   Otherwise render: brand name, store name, "Continue" button linking to category screen.

**Exit criterion:** Visit `http://localhost:3000/r/PNT-MUM-047` — page renders store name
"Pantaloons Phoenix Palladium" (or whatever is in seed) with zero console errors.

---

## Phase B — Reporter flow (~5h)

**Goal:** End-to-end submission. A reporter completes all six screens and a row appears in
`reports` with audio file in storage.

**Steps:**
1. Screen 1: name + phone + role form. Write to `localStorage` under key `sr_reporter_profile`.
   Skip screen 1 on repeat visits; show "Not you? Switch reporter" link.
2. Screen 2: 2×4 icon grid. Three Observation tiles in Slate 600, five Incident tiles in
   Amber 700. Bilingual labels (local language from `navigator.language`, English underneath).
3. Screen 3: voice recorder. `MediaRecorder` → `audio/webm` blob. Live waveform using
   `AnalyserNode`. Timer. 3s min / 120s max.
4. Screen 4: **the wheel picker** — implement per spec above. This is the highest-attention
   component in the build.
5. Screen 5: photo. `<input type="file" accept="image/*" capture="environment">`. Compress
   client-side to 1600px longest edge, 80% JPEG.
6. Screen 6: review card + "Edit" + "Submit". Multipart POST to `/api/reports` carrying
   name, phone, role, sap_code, category, audio blob, photo blob (optional), event_at.
7. `/api/reports` route (service-role client):
   - Validate SAP code exists + active
   - Validate category enum
   - Validate audio ≤ 10MB `audio/*` MIME
   - Validate photo ≤ 10MB `image/*` MIME (if present)
   - Validate event_at within last 7 days, not future
   - Write files to Supabase Storage (`audio` and `photos` buckets)
   - Insert `reports` row with `status = 'new'`, blank `transcript_en`
   - Return `report_id`
8. Confirmation screen: `SR-000042` shown big, "Thank you" copy, "Close" CTA.

**Exit criterion:** Fill the full flow as a reporter on PNT-MUM-047. A new row appears in
`reports` table with `report_id` like `SR-000056`, audio file visible in Storage, status `new`.
Reporter sees the confirmation screen.

---

## Phase C — Manager flow (~5h)

**Goal:** Manager logs in with PIN, sees the inbox updating via 30s poll, opens a report,
acknowledges it, files a resolution.

**Steps:**
1. `/m/[sap_code]/page.tsx`: check `sr_mgr` cookie. If unset/invalid → render PIN keypad.
   If valid → render inbox.
2. `POST /api/auth/manager`: body `{ sap_code, pin }`. Look up `stores.pin_hash`,
   `bcrypt.compare`, on success issue signed JWT via `jose` with `{ sap_code, iat, exp }`,
   set as `sr_mgr` cookie (HttpOnly, SameSite=Lax, 7-day).
3. Three-strikes lockout: track in-memory for pilot (per SAP code, 15-min TTL).
4. Inbox: scrollable list of report cards sorted by `filed_at DESC`. Filter pills at top.
   Default filter = "New + Returned".
5. **Polling:** `useEffect` with `setInterval(fetch, 30_000)`. Gate by `document.visibilityState`.
   Clear on unmount and on tab blur.
6. Card shows: SR-ID, category icon + name, status badge, relative timestamp, first 80 chars
   of transcript, media glyphs (camera if photo, speaker if audio).
7. `/m/[sap_code]/r/[report_id]/page.tsx`: detail view.
   - Audio player with speed toggle (1x / 1.5x)
   - Transcript in Stone 100 card
   - Photo (tap to expand)
   - Context: event time, reporter role — **NOT name or phone** (exclude those columns at query time)
   - CTA depends on status
8. Resolution form: `what_was_done` (textarea 20–500 chars), `proof_photo` (optional),
   `action_taken` (radio group, one of five). POST to `/api/resolutions` with `report_id`
   and `attempt_no` (auto-increment from existing resolutions for this report).
9. On resolution submit: report status → `awaiting_ho`, redirect to inbox with success toast.

**Exit criterion:** Log in as manager on PNT-MUM-047. Submit a fresh report from another
browser. Within 30s the new report appears in the manager inbox. Open it, acknowledge,
file a resolution. Status progresses `new → acknowledged → awaiting_ho`.

---

## Phase D — HO dashboard (~5h)

**Goal:** HO user logs in, sees the approval queue, approves and returns resolutions,
sees analytics charts against real data.

**Steps:**
1. Set up Supabase Auth. Add email/password. Seed HO demo user via
   `npm run seed:ho-user` (creates auth user + `ho_users` row with scope = 'national').
2. `/ho/page.tsx`: four summary cards, approval queue table, category heatmap.
3. Cards pull from `v_store_metrics` (create this view in Phase A or now — SQL is in
   `supabase/schema.sql`).
4. Approval queue: all reports with `status = 'awaiting_ho'` within user scope,
   oldest first. Clickable rows.
5. `/ho/reports/[report_id]/page.tsx`: HO detail view. Identical to manager view, plus:
   - Reporter name + phone visible in Context section
   - Three CTAs if status = `awaiting_ho`: **Approve**, **Return for rework**, **Void**
   - Return requires 10–300 char comment
   - Void requires 20+ char audit reason, irreversible
6. On Approve: report status → `closed`, insert `ho_actions` row (`action_type = 'approve'`,
   actor_user_id = auth UUID).
7. On Return: report status → `returned`, insert `ho_actions` row (`action_type = 'return'`,
   comment), trigger notification (Phase E).
8. Analytics page: four charts with Recharts, filterable by date range + brand + city + category.
9. Store registry page: list all stores with status, editable via modal. CSV import:
   `POST /api/excel/stores` parses with SheetJS, upserts to `stores`.

**Exit criterion:** Log in as `ho@safereport.demo`. The report from Phase C in `awaiting_ho`
appears in the approval queue. Approve it — status flips to `closed`, manager sees it on next
poll. Return a second report — status flips to `returned`, manager sees it with HO comment.

---

## Phase E — Whisper + notifications (~3h)

**Goal:** Voice notes become English transcripts in the background. Notifications fire on
status transitions. NO realtime subscriptions anywhere.

**Steps:**
1. `/api/transcribe/route.ts`: accepts `{ report_id, audio_path }`. Downloads audio from
   Supabase Storage, calls `openai.audio.translations.create({ model: 'whisper-1', file: buffer,
   response_format: 'text' })`, writes result to `reports.transcript_en`.
2. In `/api/reports` POST, after inserting the row and returning the `report_id`, kick
   off the transcription in a fire-and-forget fashion (don't block the response). If Whisper
   errors, log and queue a retry (hourly for 6 hours max).
3. VAPID key pair: generate once with `npx web-push generate-vapid-keys`. Put in `.env.local`.
4. Manager push subscription: on first inbox load, prompt for notification permission.
   On grant, subscribe via Service Worker, `POST /api/push/subscribe` with endpoint + keys.
   Store in `push_subscriptions` keyed by `sap_code`.
5. Notification triggers:
   - New report filed → web push to all manager subscriptions for that SAP code
   - Resolution awaiting approval → email via Resend to all HO users in scope
   - Resolution returned → web push + email to manager
   - Resolution closed → web push to manager
   - Fatality reported → SMS via MSG91 + email to national HO
6. All notifications write a row to `notification_log` for audit.

**Exit criterion:** Record a voice note in Hindi on screen 3. Submit. Report confirmation
appears immediately (no Whisper wait). Within 15 seconds, the manager sees the transcript
in English. Web push notification fires on the manager's device. Resolution → email arrives
in the HO inbox.

---

## Phase F — Excel I/O (~2h)

**Goal:** HO can download .xlsx of reports and upload CSV of stores.

**Steps:**
1. `/api/excel/export`: query reports with filters (date range, brand, city, category).
   Build a workbook with SheetJS — one sheet per month in range. Columns per DESIGN.md §17.
   Stream back as `.xlsx` attachment.
2. `/api/excel/stores`: accept multipart CSV upload. Parse with SheetJS.
   Upsert to `stores` table. Hash plain-text PINs with bcrypt before writing.
3. HO analytics page: "Download" button that calls `/api/excel/export`.
4. HO stores page: "Upload CSV" button.

**Exit criterion:** Click Download on analytics. A .xlsx file downloads with the month's
reports. Open it — columns match DESIGN.md §17. Upload a two-row CSV of test stores.
Rows appear in the `stores` table with hashed PINs.

---

## Phase G — Deploy + smoke test (~2h)

**Goal:** Live at a custom domain. Ten QR posters printed. Ten test reports across the pilot
stores submitted and resolved.

**Steps:**
1. Push to GitHub.
2. Connect Railway to the repo. Configure env vars (copy from `.env.local`, inject VAPID,
   set `NEXT_PUBLIC_APP_URL` to the Railway preview URL initially).
3. Set up custom domain via CNAME. Update `NEXT_PUBLIC_APP_URL`.
4. Run `scripts/generate-qrs.ts` — produces a PDF with ten QR posters, one per pilot SAP code.
5. Print, laminate. Team distributes to pilot stores.
6. Smoke test: from ten different devices, scan each QR, submit a report per store.
   Manager acknowledges, resolves. HO approves (or returns one to test the rework path).
7. Monitor `notification_log` and Railway logs for errors during the smoke test.

**Exit criterion:** Ten reports filed across ten stores, all resolved through the full flow.
Zero errors in logs. Public URL works. QR posters ready for distribution.

---

## Design fidelity — hard rules

- Every status badge is `{icon} {label}` — never colour-only
- No component imports `green-*` or `red-*` Tailwind classes (grep as a lint check)
- The wheel picker implements the exact visual spec above — centre row bracket, three columns,
  five rows visible, the specified opacity gradient
- No Supabase Realtime subscription anywhere — search for `.channel(` and `.on('postgres_changes'`
  as a lint check
- Reporter name and phone NEVER appear in the manager's view of the data — exclude those
  columns at query time, not at render time
- All copy uses the exact microcopy from DESIGN.md (the "Your name is visible only to Head Office"
  line matters — do not paraphrase)

---

## If you get stuck

1. Re-read the relevant section of DESIGN.md
2. Check VISUAL_LANGUAGE.md for tokens
3. Check the v6 PDF for rationale
4. Ask the team — do not invent behaviour not specified in this brief

Good luck. Build the pilot. Don't overbuild.

— Team Alpha, IIM Mumbai · 17 April 2026
