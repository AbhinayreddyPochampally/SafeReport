-- SafeReport — Migration 002
-- Replace manager 4-digit PIN with phone+password auth.
-- Run AFTER schema.sql, AFTER wipe_demo_data.sql if you're starting fresh.
--
-- HO credentials are unchanged (Supabase Auth email+password).
-- Only the per-store manager login flow is migrated.
--
-- Schema deltas:
--   * stores.manager_password_hash  (NEW)  — bcrypt hash of the manager password
--   * stores.qr_downloaded_at        (NEW) — first time HO downloaded the store's QR
--                                            (used to mark "new" stores in the UI)
--   * stores.manager_pin_hash        (DROPPED) — superseded by password
--
-- Idempotent.

BEGIN;

-- 1. Add the password column. nullable while we backfill.
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS manager_password_hash text;

-- 2. Add the QR download timestamp.
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS qr_downloaded_at timestamptz;

-- 3. Drop the old PIN column. Comment this out if you want to keep both for a
--    cutover window — but the runtime code no longer reads it.
ALTER TABLE stores
  DROP COLUMN IF EXISTS manager_pin_hash;

COMMIT;

-- Sanity check
SELECT
  column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'stores'
  AND column_name IN ('manager_password_hash', 'qr_downloaded_at', 'manager_pin_hash')
ORDER BY column_name;
