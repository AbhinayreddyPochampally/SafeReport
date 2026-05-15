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
| ✓ | Reporter flow (6 screens) | `app/(reporter)/r/[sap_code]/*` | 2026-05-14 |
| ✓ | Wheel picker (4-col 12-hr) | `components/wheel-picker.tsx` | 2026-05-14 |
| ✓ | Translation pipeline (gpt-4o two-stage) | `app/api/transcribe/route.ts`, mig 003 | 2026-05-14 |
| ✓ | Reporter i18n (en + kn) | `lib/reporter-i18n.ts`, `lib/categories.ts` | 2026-05-14 |
| ✓ | HO console (light sidebar + Action Hero + queues + Reports + Analytics + Stores) | `app/(ho)/ho/*` | 2026-05-15 |
| ✓ | Manager surface (login, inbox 30s poll, detail, resolve) | `app/(manager)/m/[sap_code]/*` | 2026-05-14 |
| ✓ | Photo capture (camera + gallery split) | `components/photo-capture.tsx` | 2026-05-14 |
| ✓ | Web push + dispatch | `app/api/push/*`, `app/api/notifications/dispatch/route.ts` | 2026-05-14 |
| ✓ | PWA install prompt + SW | `components/pwa-install-prompt.tsx`, `public/sw.js` | 2026-05-14 |
| ✓ | PWA manifest (per-store) + icons | `app/(reporter)/r/[sap_code]/manifest.webmanifest/route.ts`, `app/manifest.ts`, `public/icons/*`, `scripts/gen_icons.py` | 2026-05-14 |
| ✓ | QR posters | `lib/poster.ts`, `app/api/qr/*` | 2026-05-14 |
| ✓ | Excel export | `app/api/excel/export/route.ts` | 2026-05-14 |
| ✓ | Smoke scripts | `scripts/smoke-api.sh`, `scripts/smoke-translate.ts` | 2026-05-14 |
| ✓ | Refresh model (polling, no Realtime) | grep `.channel(` / `postgres_changes` returns nothing | 2026-05-14 |
| ✓ | Palette (no green/red) | grep returns only `lib/poster.ts` (warm orange-600, allowed) | 2026-05-14 |
| ✓ | Schema migrations 002, 003, 004 | `supabase/migrations/*.sql` | 2026-05-14 |

---

## Open divergences

- **`components/pin-keypad.tsx` still on disk.** CLAUDE.md §"Phase C" says
  "the keypad component is gone". File exists with zero imports. Tracked in
  `STALE.md`.
- **`scripts/generate-qrs.ts` and `scripts/migrate-blobs.py` undocumented.**
  In the repo (one is in `package.json` as `npm run generate-qrs`) but not in
  CLAUDE.md. Decision: document or remove. Tracked in `STALE.md`.
