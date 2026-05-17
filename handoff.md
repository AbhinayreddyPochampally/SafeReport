# SafeReport — Handoff

Last updated: 2026-05-18 (Phase 10 shipped, audit complete, divergence batch (a)
— structural flow-order fixes — shipped. Batches (b)–(g) still queued).

This is the operational handoff. CLAUDE.md is the authoritative spec; this file
captures the live state, what's already wrong against the mockup spec, and the
queue of things the next person should pick up.

---

## Where things stand

Production is `safereport-production-cb1c.up.railway.app` (Railway, Hobby plan,
Nixpacks build, auto-deploy from `main`). Source of truth is
`github.com/AbhinayreddyPochampally/SafeReport`. Latest commit on main:
`7d8e6fa` — "Phase 10: drop name+phone from landing, plain-tone triage,
/language route, APP icon on manager login, no session memory."

The 20 pilot stores are seeded in Supabase. Valid SAP codes are 4-digit numbers
like `4587` (Allen Solly · 100 Feet Road Indira Nagar, Bangalore). Five stores
are flagged "Active" in HO, the rest are "Never" (no scans yet). All twenty are
in Bangalore, Karnataka, across four brands: Allen Solly, Louis Philippe,
Peter England, Van Heusen. The reporter landing for any of them is reachable
at `/r/<sap_code>`.

Manager auth is on migration 004 — email + phone, no password. Both must match
the store row (email case-insensitive, phone compared on the trailing 10 digits).
Three-strikes lockout per SAP code, 15-minute TTL, lives in process memory.
HO auth is unchanged: Supabase Auth email + password, gated by middleware on
`/ho/*`.

Translation pipeline is the two-stage v2: `gpt-4o-transcribe` (fallback
`whisper-1`) for transcription, `gpt-4o-mini` for translation, with
`transcript_source` + `transcript_source_lang` columns persisted for audit.

Note that the CLAUDE.md runbook still references the bare `safereport.up.railway.app`
in a couple of places. That domain returns "Application not found" — the live
URL is the `safereport-production-cb1c.up.railway.app` one above. Patch the
runbook URLs in the next doc-only pass.

## What was shipped in Phases 1–10

Phases 1 through 8 (mid-May 2026) added the cinematic intro, plain-language
category labels, split the old Evidence screen into Photo + Describe, moved
Identity to after Describe, replaced the manager PIN keypad with the post-login
install + notification onboarding overlay, wired the post-submit Sent screen
for managers, and built the notification dispatch infrastructure (web-push
subscriptions, VAPID, `/api/notifications/dispatch`).

Phase 9 (reporter push subscription + SLA nudge cron) is deferred.

Phase 10 (this session) addressed the four specific gaps the user flagged from
the live deploy: the name+phone form was removed from the landing (identity now
collected only at Step 6 after evidence), triage labels were rewritten to plain
language with easy icons, a dedicated `/r/[sap]/language` route was added so a
non-English reporter can find the picker without reading English first, and the
manager login screen now uses the canonical APP icon (rounded indigo-700 tile
with white ShieldCheck and drop shadow) instead of the soft indigo-100 outline
circle. `lib/reporter-state.ts.clearDraft()` now wipes the reporter profile
alongside the draft so each new submission starts blank — there is no session
memory across reports.

All Phase 1–10 commits passed both local `tsc --noEmit` and Railway's
Next.js build.

## The audit — what diverges from the mockup spec

The full audit lives in the conversation transcript and in `mockups/`. The
canonical spec files are `reporter_intro_flow_v6.html` (intro animation),
`reporter_flow_v14.html` (reporter Screens 1–12), `manager_flow_v3.html`
(manager flow), and `install_notification_design_v3.html` (install + notification
ask design). All other mockups in `mockups/` are intermediate iterations.

Critical structural divergences:

The Language picker is the first forced screen in v14 but only reachable as a
"Change language" side-link in live. The `reporter-form.tsx` name+phone form
still injects below the landing Get-started CTA for first-time visitors —
Phase 10 removed it from the directly-rendered landing but the old form
component is still mounted via `app/(reporter)/r/[sap_code]/page.tsx`. The
manager Allow-Notifications step in `components/manager-onboarding.tsx` is
gated on `isStandalone` so a manager logged in via browser never sees the ask;
mockup puts it between Login and Inbox unconditionally. Neither reporter nor
manager surface enforces a phone-only viewport — reporter uses `max-w-xl` and
manager inbox uses `max-w-7xl` with a desktop two-pane master/detail at `lg+`,
contrary to the "phone-only ~375px" rule in CLAUDE.md.

High-severity content and copy divergences:

Triage cards are stripped down — mockup has kind eyebrow + bold tagline +
italic description + examples row + a 7-dot progress indicator; live cards are
flat horizontal rows with only title + 1-line subtitle. Sub-category renders
as N rounded shadowed tiles rather than one container with internal hairlines.
The 7-dot progress indicator is missing on every screen post-Welcome (live
uses a small "Step N of 6" text label instead). The brand bar only appears
on the landing and `/language` — every other reporter screen drops it. The
locale set is incoherent across four sources: the picker offers en/hi/kn/te,
the intro overlay's language pills show en/kn/ta/hi, v14's picker mockup
shows en/kn/ta, and the text-mode placeholder lists en/kn/hi/te. Tamil is in
marketing copy but absent from the picker; Telugu is in the picker but absent
from marketing. The identity helper says "Anonymous to store manager" — CLAUDE.md
flags this exact line as a hard verbatim rule with the mandatory text being
"Your name is visible only to Head Office." The review screen heading reads
"One last check." rather than mockup's "Ready to submit?". The manager inbox
filter pills use labels (Needs action / In progress / Awaiting HO / Closed)
that differ from the mockup's All / New + Returned / Acknowledged / Awaiting
HO / Closed. The manager report-detail page doesn't render the Stone-100 audio
plate with indigo play button + scrubber that the mockup specifies — none of
those tokens grep up in `report-detail.tsx`.

Low-severity polish: intro overlay `padding-top: 124px` vs mockup's 74px so
the rising-icon lands further from the title; the Confirm screen bubble is
`bg-teal-700/10` instead of slate-100; the Photo screen sub copy drifted from
"understand the issue" to "understand what you saw"; the Describe heading
stays "Tell us what happened" during recording instead of switching to
"Recording — tap to stop"; the manager login uses center-stacked hero with
icon-in-input fields rather than the mockup's left-aligned store card with
plain bordered inputs.

The user explicitly said "the entire flow itself" needs rectifying, so the
above isn't a polish list — it's the next-up queue. Triage decision is open;
no fixes have been started since the audit completed.

## Operational gotchas

The Railway URL changed at some point. CLAUDE.md says `safereport.up.railway.app`;
the actual reachable host is `safereport-production-cb1c.up.railway.app`. The
bare domain returns "Application not found" from Railway's router. Don't waste
debug time on what looks like a failed deploy — check the URL first. The
Railway dashboard project name is `charming-upliftment` under the personal
workspace `abhinayreddypochampally's Projects`.

The bash workspace mount (`/sessions/<id>/mnt/2nd Attempt - SafeReport/`) is
read-only-ish and serves stale views of large files after the user saves
locally. Use the file tools (Read/Write/Edit) for file operations and
Windows-MCP PowerShell for git operations. Bash mount is fine for `npx tsc
--noEmit` and `npx eslint`, but `npm run build` will fail to clean `.next/`
because of permission denials. To get a real production build verification,
use Windows-MCP PowerShell: `cd "C:\Users\VICTUS\Desktop\2nd Attempt -
SafeReport"; npm run build`.

The Windows-MCP PowerShell tool times out after roughly 60 seconds at the MCP
layer even when the underlying command is still running. If a tool returns
"Request timed out", that doesn't mean the operation failed — re-poll the
filesystem (look for `.next/BUILD_ID`, `git log --oneline -1`, etc.) to see
whether it finished. The fresh Next.js build on this machine takes ~75 seconds.

The reporter intro overlay (`components/reporter-intro.tsx`) gates on
`localStorage.sr_intro_seen`. For testing, clear it via Chrome devtools or
`javascript: localStorage.removeItem('sr_intro_seen'); location.reload()`. The
overlay also has a "Skip" affordance top-right that's always tappable.

Chrome's `resize_window` MCP tool resizes the OS window frame but doesn't
necessarily propagate to the viewport — confirmed via `window.innerWidth`
reading 1536 even after a successful 412-px resize. Windows DPI scaling at
1.25 may be the culprit. To test phone-width rendering reliably, use Chrome
devtools device mode rather than `resize_window`.

The Phase 10 commit narrowly avoided a Railway build failure caused by an
unused `useRouter` import + assignment in `category/page.tsx`. Strict-mode
ESLint blocks the build on unused-vars. The Phase 5 round of commits hit
similar failures on unused imports and unescaped `"` in JSX. Run `npx eslint
<paths> --max-warnings 0` against any modified files before pushing.

## Suggested next-up queue

Triage decisions (locked 2026-05-18):
  - **Flow order** — Intro → Language → flow. Cinematic intro plays first
    in English; "Get started" routes the reporter to the Language picker;
    pick a locale; land on Welcome; tap Get started; into the Triage flow.
  - **Locale set canonical** — en + kn + hi + ta + te. Tamil strings still
    need drafting (not in `lib/reporter-i18n.ts.STRINGS` yet) — see batch
    (d). Today's batch only added Tamil as a structural target, not a
    rendered locale.
  - **First batch to ship** — (a) flow-order fixes. Done; see below.

Batch (a) — flow order + missing screens — **shipped 2026-05-18**:
  - Reporter intro overlay (`components/reporter-intro.tsx`) now accepts a
    `sap_code` prop and, on dismiss, routes to `/r/[sap_code]/language`
    instead of just hiding. A migration path is wired for returning
    reporters with `sr_intro_seen=1` but no `sr_locale` — they skip the
    intro entirely and go straight to the picker. After the locale is
    chosen, the picker routes back to the Welcome landing.
  - Orphaned `app/(reporter)/r/[sap_code]/reporter-form.tsx` deleted (was
    not mounted anywhere; flagged in the prior audit as a residual identity
    form on the landing — it was already off the mount path, just dead code
    on disk).
  - Manager onboarding (`components/manager-onboarding.tsx`) Allow-
    Notifications step is no longer gated on standalone mode. New helper
    `transitionPostInstall()` decides notif-vs-hidden based on
    `Notification` API availability + `Notification.permission === "default"`
    + `STORAGE_NOTIF_KEY` decision. Called from `skipInstall()`,
    `handleInstall()` success setTimeout, AND from the startup `useEffect`
    when in browser mode with install already decided. Browser-mode
    managers now see the notif ask between Login and Inbox (the mockup
    `install_notification_design_v3.html` shape).

Remaining batches:
  - (b) triage card content rebuilt to mockup spec (kind eyebrow + tagline
    + description + examples + 7-dot progress dots)
  - (c) brand bar persistence on every reporter screen
  - (d) locale set reconciliation: draft Tamil strings, complete any
    partial Hindi/Telugu strings, extend `LOCALES` in `lib/reporter-i18n.ts`
    to `["en","hi","kn","ta","te"]`, add Tamil to `LOCALE_LABELS` /
    `LOCALE_ENGLISH_NAMES` / `LOCALE_BCP47` / the language picker
    page. Tamil font is already wired in the intro overlay's
    Scene 2 (`.sr-lang-ta { font-family: 'Noto Sans Tamil', ... }`)
    and the language picker page has an inline `Noto Sans` fallback
    style switch that needs a Tamil branch.
  - (e) verbatim copy corrections per CLAUDE.md hard rules
  - (f) phone-viewport enforcement on both reporter and manager surfaces
  - (g) manager inbox single-column rewrite + filter-pill relabel + Stone-
    100 audio plate on the detail page

Phase 9 (reporter push subscription + SLA nudge cron) is still open and
unrelated to the divergence work — it needs a schema migration to add
`push_subscriptions.report_id` and a cron job for the 24-hour-no-acknowledge
nudge. The DESIGN.md update for "voice-primary with text fallback (mandatory
either way)" is also still pending.

If the user asks for the PRD + System/Process docs in two versions (Railway
current + Azure full plan) that the prior `AskUserQuestion` round was about to
clarify, the question stub captured three decisions: output format (.docx vs
.md vs both), cleanup aggressiveness (delete vs archive vs leave), and Azure
depth (full migration with cost + cutover vs architecture-and-cost-only vs
architecture-only). Those need answers before drafting begins.

## Mockup → code map

The current state of the `mockups/` directory is a long history of iterations.
The canonical specs are: `reporter_intro_flow_v6.html` is the spec for
`components/reporter-intro.tsx`. `reporter_flow_v14.html` is the spec for the
twelve reporter screens — Language (`app/(reporter)/r/[sap_code]/language/page.tsx`),
Welcome (`r/[sap_code]/page.tsx` + `reporter-form.tsx`), Triage (`category/page.tsx`),
Subcategory (`category/[kind]/page.tsx`), When (`when/page.tsx` + `components/wheel-picker.tsx`),
Photo (`photo/page.tsx` + `components/photo-capture.tsx`), Describe in idle/recording/text
modes (`describe/page.tsx` + `components/voice-recorder.tsx`), Identity
(`identity/page.tsx`), Review (`review/page.tsx`), Confirm
(`confirm/[report_id]/page.tsx` + `components/reporter-confirm-asks.tsx`).
`manager_flow_v3.html` is the spec for the manager flow — Login
(`m/[sap_code]/manager-login.tsx`), the Allow-Notifications overlay
(`components/manager-onboarding.tsx`), Inbox (`m/[sap_code]/manager-inbox.tsx`),
Detail (`r/[report_id]/page.tsx` + `report-detail.tsx`), Resolve
(`r/[report_id]/resolve/resolve-form.tsx`), Sent (`r/[report_id]/sent/page.tsx`).
`install_notification_design_v3.html` is the spec for both the manager
onboarding overlay and the reporter post-submit ask card.

The other 22 mockup files (`reporter_flow_v2.html` through `v13.html`,
`manager_flow_v1.html` and `v2.html`, `install_notification_design_v1.html`
and `v2.html`, `reporter_intro_flow_v1.html` through `v5.html`) are
intermediate iterations kept for paper trail. They can be archived under
`docs/archive/mockups/` or deleted outright in a future cleanup pass.

## Files in flight

Nothing actively edited mid-batch. Phase 10 commit `7d8e6fa` is the head of
`main`. The audit findings are in conversation context only; if the next
session is a fresh conversation, the next person should re-read the four
canonical mockup files alongside the live code paths above before deciding
which divergence to fix first.
