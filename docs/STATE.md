# SafeReport — Live State Tracker

Per-subsystem ledger. Status (✓ in sync · ⚠ divergence · ✗ stale), source of
truth, last-verified date. `doc-doctor` refreshes the dates; humans own the
prose.

---

## Subsystem ledger

| Status | Subsystem | Source of truth | Verified |
|---|---|---|---|
| ✓ | Manager auth (email + phone, mig 004) | `app/api/auth/manager/route.ts`, `supabase/migrations/004_manager_email.sql` | 2026-05-14 |
| ✓ | HO auth (Supabase email + password) | `app/api/auth/ho/route.ts`, `/ho/*` middleware | 2026-05-14 |
| ✓ | Session epoch (cookie invalidation) | `lib/manager-auth.ts`, `stores.manager_session_epoch` | 2026-05-14 |
| ✓ | Reporter flow (5 screens — photo → describe → when → identity → review; AI classifies post-submit) | `app/(reporter)/r/[sap_code]/*` | 2026-05-19 |
| ✓ | Wheel picker (4-col 12-hr) | `components/wheel-picker.tsx` | 2026-05-14 |
| ✓ | Translation pipeline (gpt-4o two-stage) | `app/api/transcribe/route.ts`, mig 003 | 2026-05-14 |
| ✓ | AI category classification (gpt-4o-mini text-only, json_schema, voice-only) | `lib/classify.ts`, `app/api/classify/route.ts`, mig 007 | 2026-05-19 |
| ✓ | HO category confirmation + severity floor (LTI/Fatality dropdown-only) | `app/(ho)/ho/reports/[report_id]/report-detail.tsx`, `app/api/ho-actions/route.ts`, `lib/category-derive.ts` | 2026-05-19 |
| ✓ | Reporter i18n (en + kn + hi + ta + te — UI always renders en after mig 007; voice transcription auto-detects) | `lib/reporter-i18n.ts`, `lib/categories.ts` | 2026-05-19 |
| ✓ | HO console (light sidebar + Action Hero + queues + Reports + Analytics + Stores) | `app/(ho)/ho/*` | 2026-05-15 |
| ✓ | Manager surface (login, inbox 30s poll, detail, resolve — Resolve is the only manager write action; see CLAUDE.md §"Manager actions — Resolve only") | `app/(manager)/m/[sap_code]/*` | 2026-05-15 |
| ✓ | Photo capture (camera + gallery split) | `components/photo-capture.tsx` | 2026-05-14 |
| ✓ | Web push + dispatch | `app/api/push/*`, `app/api/notifications/dispatch/route.ts` | 2026-05-14 |
| ✓ | PWA install prompt + SW | `components/pwa-install-prompt.tsx`, `public/sw.js` | 2026-05-14 |
| ✓ | PWA manifest (per-store) + icons | `app/(reporter)/r/[sap_code]/manifest.webmanifest/route.ts`, `app/manifest.ts`, `public/icons/*`, `scripts/gen_icons.py` | 2026-05-14 |
| ✓ | QR posters | `lib/poster.ts`, `app/api/qr/*` | 2026-05-14 |
| ✓ | Excel export | `app/api/excel/export/route.ts` | 2026-05-14 |
| ✓ | Smoke scripts | `scripts/smoke-api.sh`, `scripts/smoke-translate.ts` | 2026-05-14 |
| ✓ | Refresh model (polling, no Realtime) | grep `.channel(` / `postgres_changes` returns nothing | 2026-05-14 |
| ✓ | Palette (no green/red) | grep returns only `lib/poster.ts` (warm orange-600, allowed) | 2026-05-14 |
| ✓ | Schema migrations 002, 003, 004, 005, 006, 007 | `supabase/migrations/*.sql` | 2026-05-19 |

---

## Open divergences

- **`components/pin-keypad.tsx` still on disk.** CLAUDE.md §"Phase C" says
  "the keypad component is gone". File exists with zero imports. Tracked in
  `STALE.md`.
- **`scripts/generate-qrs.ts` and `scripts/migrate-blobs.py` undocumented.**
  In the repo (one is in `package.json` as `npm run generate-qrs`) but not in
  CLAUDE.md. Decision: document or remove. Tracked in `STALE.md`.
