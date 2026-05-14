# SafeReport — Changelog

Substantive changes only — schema, auth, flow shape, ops. Doc-only edits go
elsewhere. Newest on top.

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
