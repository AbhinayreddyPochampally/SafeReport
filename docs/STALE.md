# SafeReport — Stale Items Queue

Known-obsolete-but-retained. Each item has a removal trigger. `doc-pruner`
adds candidates; humans approve deletion.

---

## Active queue

### `stores.manager_password_hash` column
- **Flagged:** 2026-05-14 · **Why retained:** rollback safety after mig 004 cutover
- **Trigger:** email+phone auth runs clean in prod through 2026-05-21
- **Cleanup:** ship as `005_drop_manager_password_hash.sql` — `ALTER TABLE stores DROP COLUMN IF EXISTS manager_password_hash;`

### `stores.manager_pin_hash` column (re-check)
- **Flagged:** 2026-05-14 · **Why retained:** mig 002 dropped it but it was hot-patched back briefly
- **Trigger:** confirm absent on live DB
- **Cleanup:** `ALTER TABLE stores DROP COLUMN IF EXISTS manager_pin_hash;`

### `MSG91_AUTH_KEY` env var
- **Flagged:** 2026-05-14 · **Why retained:** stubbed for fatality SMS, unused at pilot runtime
- **Trigger:** pilot ends without the codepath being wired, OR codepath ships and var becomes load-bearing
- **Cleanup:** keep for now; remove from `.env.example` if pilot closes without it

### `components/pin-keypad.tsx`
- **Flagged:** 2026-05-14 · **Why retained:** unclear — orphan from PIN→password cutover
- **Trigger:** none — safe to delete now (two migrations past PIN)
- **Cleanup:** `git rm components/pin-keypad.tsx` then `npm run lint:guardrails && npx tsc --noEmit`

### `scripts/generate-qrs.ts`
- **Flagged:** 2026-05-14 · **Why retained:** wired as `npm run generate-qrs` but undocumented
- **Trigger:** decision — document in RUNBOOK or confirm redundant with `/api/qr/bulk`
- **Cleanup:** depends on decision

### `scripts/migrate-blobs.py`
- **Flagged:** 2026-05-14 · **Why retained:** one-shot helper, likely from Phase M Supabase swap
- **Trigger:** confirm via `git log` it hasn't been touched and no upcoming migration needs it
- **Cleanup:** `git rm scripts/migrate-blobs.py`

---

## Removed

*(empty — log moves here with date + commit SHA when an item is actually removed)*
