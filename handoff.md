# Goal

Ship the SafeReport pilot — workplace safety incident reporting for ABFRL, 20 retail stores, mobile reporter flow + manager phone+password flow + HO desktop console with two queues, all-reports browser, analytics, store registry, and printable QR posters. Pilot launches today (12 May 2026); production is live on Railway.

## Current State

Production is on `main`, deployed to `safereport-production-cb1c.up.railway.app` (Railway, Hobby plan, Nixpacks build). Latest commits since the last handoff:

- `43b215d` — chore: clear remnants (legacy handoff doc, dead /voice route, .next/out/tsbuildinfo)
- `c660b55` — docs: add agents.md (coordination layer for autonomous coding agents)
- `8ceede0` — fix(transcribe): remove orphan duplicate block after success return
- `5ea56e2` — fix(tsconfig): set target es2017 so Set/Map iteration typechecks
- `924f623` — feat(reporter): extend Kannada to the full reporter flow
- `6057b34` — fix(reporter): keep locale pill visible for returning reporters
- (about to push) docs: align CLAUDE.md with deployed reality — 4-col wheel picker, PWA install nag section, dual locale toggle

Schema is at migrations 001 + 002 (manager_password_hash + qr_downloaded_at) + 003 (transcript_source columns) + 004 (manager_session_epoch). Smoke (`scripts/smoke-api.sh`) returns 12/13 — the single failing check is the manager landing 404 for stores with no password set, which is correct guard behaviour.

What ships and works: phone+password manager auth with per-store session-epoch invalidation; gpt-4o-transcribe → gpt-4o-mini translate pipeline with a Hinglish-resistant English-skip gate; HO sidebar console with two-queue Overview, Reports tab (URL-driven filters, sticky-header table, pagination), Analytics, Stores; Add Store + inline password reset + per-store QR poster + bulk poster PDF; CSV import with parallel bcrypt and SAP-code dedupe; **Kannada localisation across the full reporter flow** (landing → triage → sub-category → when → evidence → review → confirm, plus the store-not-found fallback and the PhotoCapture / VoiceRecorder / PwaInstallPrompt components, plus category labels and blurbs); PWA install + notification prompt persistent on every reporter visit; voice recorder with 1-second pre-roll and a larger orange stop button; Tailwind palette extended to full 50-900 ramps.

What does not yet ship: 20 stores have not been seeded (waiting on user data); manager and HO surfaces remain English-only by design.

## Files in flight

Nothing actively edited mid-batch. Last batch (Kannada full-flow + doc updates) is staged and about to commit.

## Changed (this session)

- **Cleanup pass.** Deleted `.next/` (110 MB), `out/`, `tsconfig.tsbuildinfo`, the empty `next` file, and `design-mockups/`. `git rm`-ed `HANDOFF_TO_CLAUDE_CODE.md` (legacy scaffold instructions) and `app/(reporter)/r/[sap_code]/voice/page.tsx` (dead redirect route, comment marked it for removal, no inbound links).
- **agents.md added** at repo root — coordination doc for autonomous coding agents (Claude Code, Cursor, Aider, Codex CLI). Defines a seven-role agent roster (`frontend-ui`, `backend-api`, `db-schema`, `voice-pipeline`, `qa-smoke`, `design-verifier`, `release-engineer`), five orchestration patterns, hand-off discipline, stop-the-line conditions, and Cowork-specific sandbox quirks. Peer to CLAUDE.md, not a duplicate.
- **Transcribe pipeline fixed.** Removed 21 lines of orphan/duplicate code after the success return in `app/api/transcribe/route.ts` — botched paste from `81d08d1` that Railway's Nixpacks build never typechecked.
- **tsconfig.json target.** Added `"target": "es2017"` so standalone `tsc --noEmit` no longer rejects `for...of` over `Set<string>` in `app/api/excel/stores/route.ts`. Was masked by stale `tsbuildinfo`; surfaced after cleanup.
- **Kannada full reporter flow.**
  - `lib/reporter-i18n.ts` expanded from a landing-only surface (~15 keys) to the full reporter copy (~110 keys) covering triage / sub-category / when / evidence / review / confirm / unavailable / photo-capture / voice-recorder / pwa-install + per-category label + blurb. Added a `useReporterLocale()` React hook so screens don't each re-implement the `sr:locale` event subscription.
  - `lib/categories.ts` — each `CategoryDef` now carries `labelKey` + `blurbKey` pointing into the i18n map; `labelFor(cat, locale)` and `blurbFor(cat, locale)` helpers added. `cat.label` and `cat.blurb` retained as English fallbacks for manager / HO / Excel consumers.
  - Every reporter screen (`app/(reporter)/r/[sap_code]/**/page.tsx`) converted to use `useReporterLocale()` + `t()`. The store-not-found fallback was extracted to its own `store-unavailable.tsx` client component because the parent landing is an async server component.
  - `components/photo-capture.tsx`, `components/voice-recorder.tsx`, `components/pwa-install-prompt.tsx` — all three subscribe to locale via the hook and pull all user-facing strings from the i18n map.
  - Wheel-picker preview and review-screen timestamp now call `toLocaleString("kn-IN", …)` when locale is Kannada so weekday and month render in Kannada script on Chrome / iOS Safari.
  - CLAUDE.md §"Reporter landing — language toggle" rewritten to reflect the expanded scope.
- **Returning-reporter locale pill (`6057b34`).** The Reporting-as summary card on the landing now carries a compact locale toggle on a slate-50 strip beneath the name+phone row. Closes the regression where a returning Kannada reporter had to tap Switch (clearing their saved profile) to change locale.
- **Doc alignment pass (about to commit).**
  - CLAUDE.md §"Wheel picker spec (Screen 4)" rewritten from 3-column 24-hour to the deployed 4-column 12h+AM/PM shape. Notes that the PDF reference still shows the old layout.
  - CLAUDE.md routes block — `voice/page.tsx` removed from the reporter directory listing (file was deleted in `43b215d`).
  - CLAUDE.md §"Reporter localisation" extended to document the dual-instance pattern (full toggle for first visit + compact pill inside the Reporting-as card for returning reporters).
  - New CLAUDE.md §"PWA install nag (reporter landing)" describes the two-gate state machine, iOS Safari fallback, per-session dismiss, and co-located service-worker registration.

## Earlier this session, by way of background

Full HO console redesign with sidebar replacing top nav, two-queue Overview, new /ho/all-reports tab; manager auth migration from PIN to phone+password (migration 002); translation pipeline v2 (migration 003); Stores page rewrite with Add Store, password reset, QR poster, new-store badge, master-list prune; Android gallery upload split into two buttons on both reporter evidence and manager resolution screens; side-by-side report+resolution photo block on the HO report detail; demo data wipe SQL.

## Failed attempts (kept as scar tissue)

Bash heredoc writes (`cat > file << EOF`) do not propagate from the sandbox mount to the user's actual disk; only the `Read` / `Edit` / `Write` tools sync. Fix is to never use heredoc for file writes.

The `Write` tool truncates files larger than roughly 100 lines or ~2KB on first attempt and on long-comment payloads (em-dash `—` characters seem to compound this). Fix in each case is to restore from `git show HEAD:path` then re-apply via small `Edit` calls only. Today's `lib/reporter-i18n.ts` rewrite (~470 lines, includes Kannada Unicode + em-dashes) went through cleanly on a single `Write` — the truncation issue seems sensitive to payload + tool-state interactions rather than raw size.

Railway build initially failed because Nixpacks defaults `NODE_ENV=production`, which makes `npm ci` skip devDependencies and `next build` then can't find `tailwindcss`. Fix was `--include=dev` in `nixpacks.toml`.

Running `npx next build` in the sandbox `SIGBUS`s on memory pressure — typecheck (`tsc --noEmit`) and lint (`next lint --no-cache`) work, but the production build itself can only be verified by pushing to Railway.

PowerShell mangles backticks inside commit messages — `` `next` `` literal becomes `ext` because the backtick is the PowerShell escape character. Use forward-slash phrasing or single-quote with care.

## Out-of-scope findings from the Chrome live-flow audit (now resolved)

All three findings from the previous handoff have shipped. Keeping them
here as a paper trail so a future agent can see the cleanup path.

1. ~~**Wheel picker is 12-hour AM/PM, not 24-hour as CLAUDE.md says.**~~
   Resolved in the doc-alignment commit: the deployed 4-column picker
   (Day · Hour 1-12 · Minute 00/15/30/45 · AM/PM) is now the documented
   spec. The PDF reference still shows the old 3-column shape; the
   CLAUDE.md section notes that the deployed component supersedes it.
2. ~~**The PWA install banner on the reporter landing isn't documented
   in CLAUDE.md.**~~ Resolved: new §"PWA install nag (reporter landing)"
   section covers the two-gate state machine (notifications +
   home-screen install), the iOS Safari fallback, the per-session
   dismiss via `sessionStorage`, and the co-located service-worker
   registration.
3. ~~**Language toggle disappears for returning reporters.**~~ Resolved
   in `6057b34`. A compact locale pill (smaller padding, same indigo-700
   active state) now sits inside the "Reporting as …" summary card on
   a slate-50 strip beneath the name+phone row. Both the full toggle
   (first visit) and the compact pill (returning) flip via the same
   `sr:locale` event. CLAUDE.md §"Reporter localisation" describes the
   dual-instance pattern and notes that they should not be collapsed.

## Next step

Pilot is essentially feature-complete for the reporter half. Suggested
priorities for the next batch, lowest-friction first:

1. **HO Analytics refresh.** The page hasn't been touched since the
   nav switched from top bar to sidebar. Likely still functional, but
   the surrounding shell expects a sidebar-shell layout while
   Analytics may still render with the old top-bar assumptions.
   Worth a visual audit + structural alignment to the rest of the HO
   console.
2. **Seed the 20 pilot stores.** Waiting on the SAP-code list + manager
   phone/name data from ABFRL. The Stores page already supports CSV
   import (`POST /api/excel/stores`) with the optional master-list
   prune flag, so the actual ingest is a one-command operation once
   the CSV lands.
3. **PDF design doc realignment.** `docs/SafeReport_Design_Document_v6.pdf`
   page 18 still illustrates the 3-column 24-hour wheel picker. Either
   regenerate that page from the current component or add a "v7
   addendum" page noting the 4-column shape. Not blocking, but it'll
   be the next confusion source for anyone reading the doc cold.

Out-of-scope but worth noting: the brand kicker on the reporter
landing ("PANTALOONS" / "ALLEN SOLLY" etc) is intentionally not
localised — those are proper nouns and they show up in the store
identity card alongside the city. Don't localise.
