# SafeReport — Changelog

Substantive changes only — schema, auth, flow shape, ops. Doc-only edits go
elsewhere. Newest on top.

---

## 2026-05-15 · Doc: Manager actions clarified to Resolve-only

Doc-only edit, but flagged here because it corrected a recurring misread of
the manager surface that had started bleeding into onboarding copy. The
manager has **one terminal write action: Resolve.** Return and Void are
HO-only and live behind `/api/ho-actions`. The `returned` status on the
manager's inbox is HO-initiated rework, not a manager-set state.

Added a new top-level **§Manager actions — Resolve only** section to
`CLAUDE.md` (after §Manager auth) spelling out what the manager can and
cannot do, with the rationale: pilot reporters are off-roll and the system
isn't built for round-trip clarification, so "send back to reporter" is not
a valid flow. Cross-referenced from the Reported Queue description so
anyone reading about the `returned` rows there gets routed to the right
section.

`docs/DESIGN.md` §Manager flow also rewritten: PIN login replaced with the
current email+phone shape (mig 004), and the CTA-per-status table reworded
so it's clear every CTA routes into the single resolution form (fresh or
rework mode). The status state-machine block was already correct and was
left as-is.

Adjacent stale-comment fixes in CLAUDE.md route-group listing: the
`(manager)/m/[sap_code]/page.tsx` and `auth/manager/route.ts` inline
comments both said "phone+password", carryover from mig 002 — now
"email+phone".

No code changes, no migrations.

---

## 2026-05-15 · Sidebar tone + brand mark + snappier nav

Follow-up tweaks on top of the redesign earlier today.

**Sidebar — indigo → teal gradient + brand SVG.**

Reviewer asked for the colour back on the rail and for the SafeReport
SVG icon (the same mark on QR posters + PWA tiles) instead of the "SR"
monogram tile I'd swapped in. Done:

- `bg-gradient-to-b from-indigo-700 via-indigo-700 to-teal-600` on the
  sidebar shell. Teal-600 reads as the "green" end of the spectrum
  while staying inside the palette (the no-green rule excludes
  `green-*` / `emerald-*` / `lime-*` — `teal-*` is in bounds).
- Active nav row: white/15 fill + amber-300 left accent rail (echoing
  the SafeReport icon's alert-dot colour). Urgent badges (Action with
  breached count > 0): orange-500 with a ring.
- Brand band: `<Image src="/icons/safereport-icon.svg">` with
  `priority` so the LCP element on /ho is the brand mark, not a
  velocity tile.

**Branding — ABFRL → ABF.**

Reviewer asked to drop the "RL" everywhere in source + docs. 14 source
files, 3 docs. The design PDF in `docs/SafeReport_Design_Document_v6.pdf`
still says ABFRL — that's a binary and the next regen will pick up the
new name from the markdown sources.

**Snappier nav — cache TTL doubled.**

All three HO server caches (`ho-overview-data`, `ho-sidebar-counts`,
`ho-stores-data`) bumped from 30s to 60s revalidate. Halves cold-cache
misses across a typical HO session. Mutating endpoints still call
`revalidateTag()` on the relevant key, so users never see stale state
on their own write.

Plus a missing `app/(ho)/ho/action/loading.tsx` skeleton — Action was
the only HO tab without one, which meant cold navs into the inbox
showed a blank pane during data fetch. The skeleton mirrors the
master-detail two-column layout so the swap-in is invisible. The
stores loading skeleton's gradient header band also flattened to
match the page proper.

`npx tsc --noEmit --skipLibCheck` clean, `npm run lint:guardrails`
clean.

---

## 2026-05-15 · HO console redesign (Claude Design handoff)

Implemented the redesign produced via Claude Design (project bundle
`SafeReport - 3`). The diagnosis matched what reviewers had been
flagging for weeks: five different gradients per screen with no shared
rhythm, every panel carrying its own card shape, and the primary job
(act on the queue) buried under analytics. This rev unifies the visual
language and re-orders the page so Action leads.

**Visual language (shell + cards).**

- Removed every `bg-gradient-to-br` / `bg-gradient-to-r` / `bg-gradient-to-b`
  utility from the HO console. Page bg, card bg, icon swatches, summary
  tiles, queue headers — all flat fills now. VISUAL_LANGUAGE.md's
  "no gradients" rule the codebase had drifted from.
- Sidebar: navy gradient → white panel with a 1px slate-200 border.
  Active nav item: indigo-50 wash + indigo-900 text + indigo-700 badge.
  Urgent (Action + breached): orange-700 badge fill.
- Cards unified to one shape: white, 1px slate-200, 12px radius, subtle
  shadow. Eyebrow (10.5px bold uppercase) + display title (15px IBM Plex)
  + thin slate-100 rule.

**Overview reorder (lead with action).**

- Added an **Action Hero** band at the top: total items waiting,
  breach-past-48h subcount, the oldest awaiting row preview, and a
  one-click into `/ho/action`. Sky-tinted by default, orange-tinted
  when there's an SLA breach; empty state ("You're caught up") uses
  the calm white card.
- Trend chart promoted above the Pulse row so it reads as the follow-up
  to the velocity tiles ("blip or trend?").
- Today panel renamed to "Today · activity feed" and now also surfaces
  up to 3 recent HO actions (approve / return / void from `ho_actions`)
  and manager acks (reports.acknowledged_at events) from the last 24h.
  Two new queries fire in the same `Promise.all` as the existing batch.

**Reports — saved-view chips.**

Added a top-row of preset chips above the existing filter card: All
reports / Open only / Awaiting HO / Past 48h (urgent tone) / Returned /
Incidents only / + New view (stub). Each preset bulk-sets existing URL
filter params via the existing `apply()` callback — no new server
query path. "Past 48h" is a UI affordance only: it narrows to
awaiting_ho and relies on the row renderer's orange age tint to
surface the breached rows. A future migration could add a server-side
age filter.

**Analytics — engagement diagnoses + flat fills.**

Added a "Per-store engagement" section above the existing
`StoreAnalyticsTable`, with three diagnosis tiles computed from the
existing `LeaderboardRow.visits` field:

- Stores with zero scans this period (orange-50)
- High visits, low submit rate (sky-50)
- Healthy engagement (teal-50)

Existing `InsightCard` / `StoreTierCards` switched from per-tone gradient
washes to flat tinted fills. Header switched to the eyebrow + title
pattern.

**Stores — same flat-fill cleanup.**

Page header switched to eyebrow + title. `SummaryTile` per-tone cards
flattened. The "Stores needing attention" alert banner kept its
orange-50 wash but dropped the orange-50 → amber-50 gradient and the
inner orange-200 → orange-300 icon-circle gradient.

**Files touched.**

- `app/(ho)/ho/layout.tsx` — light sidebar shell, flat page bg
- `app/(ho)/ho/sidebar-nav.tsx` — light variant active states
- `app/(ho)/ho/page.tsx` — Action Hero + flat panels + activity feed
- `app/(ho)/ho/queue-list.tsx` — flat fills, eyebrow + title pattern
- `app/(ho)/ho/all-reports/all-reports-client.tsx` — flat fills,
  saved-view chips
- `app/(ho)/ho/analytics/analytics-client.tsx` — engagement diagnoses,
  flat fills
- `app/(ho)/ho/stores/stores-client.tsx` — flat fills, eyebrow + title

**Not implemented (per scope discussion).**

- Tweaks panel (Density / Accent / Sidebar / Scenario / module toggles)
  — prototype-only convention; production runs on the default settings.
- "+ New view" chip on Reports is a disabled stub. Save-current-filters
  flow would need a per-user pinned-views table — separate backend
  follow-up.

`npx tsc --noEmit` clean, `npm run lint:guardrails` clean (no green-*
or red-* utilities, no Supabase Realtime).

---

## 2026-05-14 · PWA install actually installs

Pilot smoke surfaced that neither desktop Chrome nor Android Chrome
nor iOS Safari were offering Add to Home Screen / Install app for the
reporter landing — the prompt's CTA always fell through to the manual
hint. Two unrelated gaps:

1. **Service worker had no `fetch` event listener.** Chromium's PWA
   installability criteria require one even if the SW does no caching
   — the listener's presence is what tells the browser "this site can
   handle navigations offline-ish, so it qualifies for install". Without
   it `beforeinstallprompt` never fires and the Install entry silently
   disappears from the browser menu. Added a no-op fetch listener to
   `public/sw.js` (does not call `respondWith`, so requests pass
   through to the network as before).
2. **iOS standalone meta tags missing.** No `apple-mobile-web-app-capable`
   anywhere, so iPhone users who ran Share → Add to Home Screen got an
   icon that opened inside Safari chrome — and our prompt's standalone
   detection (`window.navigator.standalone === true`) never resolved,
   leaving the install gate stuck pending. Added `appleWebApp.capable`
   in `app/layout.tsx` via Next's Metadata API, which renders the
   `apple-mobile-web-app-capable: yes` meta tag globally.

Bonus cleanup: the push-notification handler in `public/sw.js`
referenced `/icon-192.png`, but the icon ships at `/icons/icon-192.png`
(under the `icons/` subdir the manifest also points at). Fixed.

To pick up the change in a browser that already has the old SW
registered: open the reporter landing once and reload — the SW byte
diff triggers an update on the next navigation. DevTools →
Application → Service Workers → Unregister forces it immediately.

Files: `public/sw.js`, `app/layout.tsx`. CLAUDE.md §PWA section
gained two paragraphs noting the fetch-listener requirement and the
iOS meta-tag dependency.

---

## 2026-05-14 · HO Overview redesigned around velocity + trend

The Overview no longer leads with four passive summary cards. The four
"Reports this month / Awaiting / Closed / Returned" tiles duplicated state
that was already visible in the queues directly below them — pretty
numbers, no decision-relevant signal.

The new layout:

1. **Velocity strip (4 tiles).** Median time to acknowledge, median time
   to close, % closed within 48h, first-attempt fix rate — each with a
   WoW delta and polarity-aware colouring (teal-700 improving, orange-700
   worsening). Same data shape and visual rhythm as the Analytics page's
   matching tiles, so the two surfaces feel like the same family.
2. **Pulse row (Today / Coverage / Category mix).** Last 24h activity
   list (5 most recent reports, click-through to detail), donut showing
   distinct stores reporting this week over total active stores, and a
   top-5 categories bar with WoW arrows.
3. **14-day trend chart.** Server-rendered inline SVG with two lines —
   median ack (slate-600) + median resolution (teal-700) — and a dashed
   orange-300 48h SLA reference. Lifted from the Analytics page so HO
   can see whether this week's velocity is a blip or a real trend
   without leaving the landing.
4. **Approval + Pipeline queues** (unchanged).

The "Stores needing attention" panel that previously sat above the queues
was removed in the same rev. The past-48h-waiting subsection duplicated
the Approval queue's SLA-breach pill, and the quiet-stores subsection
didn't drive any action HO was actually taking. The Stores tab still
carries the same data for anyone who wants it.

Velocity, coverage, today, and trend all share a single 14-day
`reports` query in `fetchLandingData` — partitioned in-process for each
panel. Pilot-scale only (hundreds of rows at most); if it ever grows we
move to a SQL view.

Files: `app/(ho)/ho/page.tsx` (full rewrite of the upper page —
imports + types + `fetchLandingData` + render + 5 new components
including a server-rendered SVG trend chart). Typecheck + lint
guardrails + Next ESLint all pass.

---

## 2026-05-14 · PWA install → per-store manifest + real icons

The home-screen install used to drop reporters onto `/` (the dev landing
page) instead of their store's reporter surface. Two parts to the fix:

1. **Per-store manifest** at `/r/[sap_code]/manifest.webmanifest`. Each
   reporter landing now overrides metadata to advertise its own manifest,
   whose `start_url` and `id` are bound to that SAP code. Tapping the
   installed icon reopens the same store. Two stores → two distinct
   installs that don't fight over a single slot. Implemented as a route
   handler with a SAP-code regex guard + a `v_store_public` lookup so we
   refuse to mint manifests for unknown / closed stores.

2. **Real PWA icons.** `public/icons/icon-{192,512}.png`, a 60%-safe-zone
   maskable variant for Android adaptive icons, and an
   `apple-touch-icon.png` at 180×180. SR monogram on indigo-700, generated
   from `scripts/gen_icons.py` (DejaVu Sans Bold; IBM Plex isn't in the
   build env, and the launcher tile isn't subject to the design-system
   runtime font anyway). The root `app/manifest.ts` now points at the
   same PNGs so QA installs at `/` get a respectable icon too.

Files: `app/(reporter)/r/[sap_code]/manifest.webmanifest/route.ts`,
`app/(reporter)/r/[sap_code]/page.tsx` (added `generateMetadata`),
`app/manifest.ts`, `public/icons/*`, `public/apple-touch-icon.png`,
`scripts/gen_icons.py`.

---

## 2026-05-14 · Manager auth → email + phone (mig 004)

Replaced the phone+password manager flow with a two-factor identity check:
email + phone, no password. Pilot decision — password recall friction wasn't
worth the cryptographic guarantee for a 20-store low-sensitivity workflow.
`stores.manager_password_hash` retained as rollback safety net; drop queued
in `STALE.md`.

Same day: Manager desktop two-pane shell + PWA prompt + filter chips;
Overview side-by-side queues; QR poster rebuilt against the reference
design; Stores page filter bar simplified.

Commits: `9e5daf4`, `656c49d`, `a931cf2`, `5ea0d3b`, `e194bb9`.

Doc maintenance system (`STATE.md` / `CHANGELOG.md` / `STALE.md` / `docs/agents/`)
built alongside this change.

---

## 2026-05-13 · HO console polish + Kannada extended

HO picked up sparklines, leaderboard columns, J/K keyboard nav, inline
master-detail on Reports, Action Required tab, Time Analytics. Reporter
Kannada strings extended from landing-only to the full flow. CLAUDE.md
rewritten to match deployed reality (4-column 12-hour wheel picker, PWA
behavior, dual locale).

Commits: `c1c5c32`, `13710ca`, `b7cfbd3`, `46ffecc`, `924f623`, `fea4694`.

---

## 2026-05-12 · Pilot upgrade megacommit

`369e339` — single largest checkpoint after initial build (+4913/-697 across
32 files):

- HO console moved from top-nav to 240px sidebar; two-queue Overview;
  `/ho/all-reports` server-paged Reports tab
- QR posters via `lib/poster.ts` + `/api/qr/[sap_code]` + `/api/qr/bulk`
- Manager auth migrated PIN → phone + password (mig 002 — adds
  `manager_password_hash`, `qr_downloaded_at`; drops `manager_pin_hash`)
- Translation pipeline: single-stage Whisper-1 → two-stage gpt-4o-transcribe
  + gpt-4o-mini (mig 003 — adds `transcript_source`, `transcript_source_lang`)
- Kannada landing toggle (extended to full flow May 13)
- Smoke scripts: `smoke:api`, `smoke:translate`

Follow-ups same day: P0 audit (`4326cd7`), P1 hardening (`81d08d1`),
Tailwind 50–900 ramps (`c29df9e`), session epoch for cookie invalidation
(`f23fba3`), PWA install prompt (`02f59f8`), voice recorder UX (`7ea4c86`),
poster Latin sanitization (`592a7c5`).

---

## 2026-04-19 · Phase A→G complete — pilot live on Railway

Phases D / E / F / G all squashed and pushed; pilot went live at
`safereport-production-cb1c.up.railway.app`.

- Phase D — HO surface, `/api/ho-actions`, Analytics, Stores + CSV import (`c970674`)
- Phase E — Whisper transcription, web push + VAPID, notification dispatch (`02bc2b5`)
- Phase F — Excel export with per-month sheets (`ff36c38`)
- Phase G — `nixpacks.toml`, Node 20 pinned, `next start` bound to `$PORT` + `0.0.0.0`
- Phase M — Supabase project migration to production
- Next 14.2.35 bump for CVE-2025-55184 / CVE-2025-67779 (`ad77689`)

---

## 2026-04-18 · Phase A scaffold

`16412b2` — blank Next.js 14 App Router, Supabase wrappers, Tailwind palette,
`next/font` setup, reporter landing renders store name from DB.
