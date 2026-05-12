# Goal

Ship the SafeReport pilot — workplace safety incident reporting for ABFRL, 20 retail stores, mobile reporter flow + manager phone+password flow + HO desktop console with two queues, all-reports browser, analytics, store registry, and printable QR posters. Pilot launches today (12 May 2026); production is live on Railway.

## Current State

Production is at commit `592a7c5` on `main`, deployed to `safereport-production-cb1c.up.railway.app` (Railway, Hobby plan, Nixpacks build). Schema is at migrations 001 + 002 (manager_password_hash + qr_downloaded_at) + 003 (transcript_source columns) + 004 (manager_session_epoch). Smoke (`scripts/smoke-api.sh`) returns 12/13 — the single failing check is the manager landing 404 for stores with no password set, which is correct guard behaviour.

What ships and works: phone+password manager auth with per-store session-epoch invalidation; gpt-4o-transcribe → gpt-4o-mini translate pipeline with a Hinglish-resistant English-skip gate; HO sidebar console with two-queue Overview, Reports tab (URL-driven filters, sticky-header table, pagination), Analytics, Stores; Add Store + inline password reset + per-store QR poster + bulk poster PDF; CSV import with parallel bcrypt and SAP-code dedupe; Kannada toggle on the reporter landing; PWA install + notification prompt persistent on every reporter visit; voice recorder with 1-second pre-roll and a larger orange stop button; Tailwind palette extended to full 50-900 ramps.

What does not yet ship: 20 stores have not been seeded (waiting on user data), Kannada strings only cover the landing screen (later screens still English), HO Analytics page hasn't been refreshed since the sidebar swap.

## Files in flight

Nothing actively edited mid-batch. Last batch (poster Helvetica sanitisation) committed and pushed at `592a7c5`. No uncommitted changes on disk.

## Changed

This session shipped, in commit order: full Tailwind 50-900 ramps (`c29df9e`); Hinglish detection tightening + CSV bcrypt parallel + CSV SAP-code dedupe + pagination busy state and empty-page copy (`81d08d1`); voice recorder 1s pre-roll + bigger orange stop button + HO sidebar counts wrapped in Suspense (`7ea4c86`); PWA install and notification persistent prompt mounted on the reporter landing with manifest.ts and service-worker registration (`02f59f8`); session epoch invalidation in manager-auth.ts, /api/auth/manager, and /api/ho-stores (`f23fba3`); poster store-name sanitisation for the standard Helvetica encoding plus 70-char truncation (`592a7c5`).

Earlier this session also: full HO console redesign with sidebar replacing top nav, two-queue Overview, new /ho/all-reports tab; manager auth migration from PIN to phone+password (migration 002); translation pipeline v2 (migration 003); Stores page rewrite with Add Store, password reset, QR poster, new-store badge, master-list prune; Android gallery upload split into two buttons on both reporter evidence and manager resolution screens; side-by-side report+resolution photo block on the HO report detail; demo data wipe SQL.

## Failed attempts

Bash heredoc writes (`cat > file << EOF`) do not propagate from the sandbox mount to the user's actual disk; only the `Read` / `Edit` / `Write` tools sync. Discovered after pushing changes the user's `git status` couldn't see — fix is to never use heredoc for file writes.

The `Write` tool truncates files larger than roughly 100 lines or ~2KB on first attempt and on long-comment payloads (em-dash `—` characters seem to compound this). Initial Tailwind config rewrite truncated mid-stone-definition three times until I switched to a compact single-line-per-scale format. Same pattern hit `manager-auth.ts`, `/api/auth/manager/route.ts`, `/api/ho-stores/route.ts`, and `/api/transcribe/route.ts` — fix in each case was to restore from `git show HEAD:path` then re-apply changes via small `Edit` calls only.

Railway build initially failed because Nixpacks defaults `NODE_ENV=production`, which makes `npm ci` skip devDependencies and `next build` then can't find `tailwindcss`. The webpack error cascade reported as "Module not found: Can't resolve '@/lib/categories'" which was misleading — fix was `--include=dev` in `nixpacks.toml`. The next deploy then failed because a botched heredoc append had left an orphan `}T${time}+05:30` ` block at the bottom of `app/(ho)/ho/all-reports/page.tsx`; fix was an `Edit` to remove the duplicate.

Running `npx next build` in the sandbox `SIGBUS`s on memory pressure — typecheck (`tsc --noEmit`) and lint (`next lint --no-cache`) work, but the production build itself can only be verified by pushing to Railway.

## Next step

Extend Kannada strings to all reporter screens (currently only the landing has them). The `lib/reporter-i18n.ts` `STRINGS` map needs entries for the category, sub-category, when, voice, evidence, review, and confirm screens; each screen then swaps its hard-coded English copy for `t(locale, '...')` calls. Without this the Kannada toggle on the landing reads as a broken promise — the user reaches the next screen and the language reverts to English.
