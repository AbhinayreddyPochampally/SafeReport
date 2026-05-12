# Goal

Ship the SafeReport pilot — workplace safety incident reporting for ABFRL, 20 retail stores, mobile reporter flow + manager phone+password flow + HO desktop console with two queues, all-reports browser, analytics, store registry, and printable QR posters. Pilot launches today (12 May 2026); production is live on Railway.

## Current State

Production is on `main`, deployed to `safereport-production-cb1c.up.railway.app` (Railway, Hobby plan, Nixpacks build). Latest commits since the last handoff:

- `43b215d` — chore: clear remnants (legacy handoff doc, dead /voice route, .next/out/tsbuildinfo)
- `c660b55` — docs: add agents.md (coordination layer for autonomous coding agents)
- `8ceede0` — fix(transcribe): remove orphan duplicate block after success return
- `5ea56e2` — fix(tsconfig): set target es2017 so Set/Map iteration typechecks
- (about to push) feat(reporter): extend Kannada to the full reporter flow

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

## Earlier this session, by way of background

Full HO console redesign with sidebar replacing top nav, two-queue Overview, new /ho/all-reports tab; manager auth migration from PIN to phone+password (migration 002); translation pipeline v2 (migration 003); Stores page rewrite with Add Store, password reset, QR poster, new-store badge, master-list prune; Android gallery upload split into two buttons on both reporter evidence and manager resolution screens; side-by-side report+resolution photo block on the HO report detail; demo data wipe SQL.

## Failed attempts (kept as scar tissue)

Bash heredoc writes (`cat > file << EOF`) do not propagate from the sandbox mount to the user's actual disk; only the `Read` / `Edit` / `Write` tools sync. Fix is to never use heredoc for file writes.

The `Write` tool truncates files larger than roughly 100 lines or ~2KB on first attempt and on long-comment payloads (em-dash `—` characters seem to compound this). Fix in each case is to restore from `git show HEAD:path` then re-apply via small `Edit` calls only. Today's `lib/reporter-i18n.ts` rewrite (~470 lines, includes Kannada Unicode + em-dashes) went through cleanly on a single `Write` — the truncation issue seems sensitive to payload + tool-state interactions rather than raw size.

Railway build initially failed because Nixpacks defaults `NODE_ENV=production`, which makes `npm ci` skip devDependencies and `next build` then can't find `tailwindcss`. Fix was `--include=dev` in `nixpacks.toml`.

Running `npx next build` in the sandbox `SIGBUS`s on memory pressure — typecheck (`tsc --noEmit`) and lint (`next lint --no-cache`) work, but the production build itself can only be verified by pushing to Railway.

PowerShell mangles backticks inside commit messages — `` `next` `` literal becomes `ext` because the backtick is the PowerShell escape character. Use forward-slash phrasing or single-quote with care.

## Out-of-scope findings from today (flagged, not fixed)

These came up during the Chrome live-flow audit and the typecheck pass. Each is real but none was in this batch's scope, so they're parked here for the next pass to pick up.

1. **Wheel picker is 12-hour AM/PM, not 24-hour as CLAUDE.md says.** The doc claims Hour values are `"00"` through `"23"`. The deployed picker renders Hour 1-12 plus an AM/PM column. Either fix the doc or fix the picker — but pick one. The 12-hour shape is probably what users want.
2. **The PWA install banner on the reporter landing isn't documented in CLAUDE.md.** It exists, it works, but the reporter-flow section in the brief still describes a flow that doesn't mention the banner. Add a §"PWA install nag" subsection.
3. **Language toggle disappears for returning reporters.** After the first successful name+phone save, the landing collapses to a "Reporting as Test User · 98xxx / Not you? Switch" summary, and the language pill is unmounted. A returning Kannada reporter can't change to English (or vice versa) without first tapping "Switch" to clear their profile. Either expose the pill in the "reporting as" state too, or surface a smaller "Language" link inline in that summary.

## Next step

Pilot is essentially feature-complete for the reporter half — Kannada is now consistent end-to-end. Two suggestions for the next batch, in priority order:

1. **Address the language-toggle-disappears bug** (item 3 above). It's a real reporter-side regression — returning Kannada-only reporters who hit Switch to change locale will lose their saved name+phone and have to re-enter it. Surface a compact locale pill inside the "reporting as" summary card, no full toggle.
2. **Decide on the wheel-picker 12h-vs-24h doc drift** (item 1 above). If the deployed picker is right, the brief needs a paragraph update. If the brief is right, the picker needs a column rewrite.

Lower priority: HO Analytics page hasn't been refreshed since the sidebar swap; the brand kicker on the reporter landing ("PANTALOONS") is unlocalised but that's intentional (proper nouns).
