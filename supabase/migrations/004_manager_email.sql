-- SafeReport — Migration 004
-- Switch manager auth from phone+password to email+phone.
-- Run AFTER 002_manager_password.sql and 003_transcript_source.sql.
--
-- HO credentials are unchanged (Supabase Auth email+password).
-- Only the per-store manager login flow changes.
--
-- Auth flow before:  manager submits phone + password; password compared
--                    against stores.manager_password_hash (bcrypt).
-- Auth flow after:   manager submits email + phone; both must match the
--                    stored values exactly (email case-insensitive, phone
--                    on trailing 10 digits). No password.
--
-- Schema deltas:
--   * stores.manager_email           (NEW)        — case-insensitive email used
--                                                   alongside phone as the
--                                                   per-store identity pair.
--   * stores.manager_password_hash   (DEPRECATED) — kept around for one cutover
--                                                   window in case we need to
--                                                   roll auth back. New API
--                                                   code does not read it. A
--                                                   later migration drops it.
--
-- Idempotent.

BEGIN;

-- 1. Add the email column. Nullable initially so the migration can run on
--    a live table with existing rows; HO fills email in via the Stores tab
--    before flipping auth over. The application layer (api/ho-stores and
--    the Stores form) enforces "required at create time".
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS manager_email text;

-- 2. Light-touch format check. Deliberately permissive — we're not trying
--    to validate RFC 5322, just catch the most obvious typos. The app
--    layer does the same check before write, so this is belt-and-braces.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_manager_email_format'
  ) THEN
    ALTER TABLE stores
      ADD CONSTRAINT stores_manager_email_format
      CHECK (
        manager_email IS NULL
        OR manager_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      );
  END IF;
END $$;

-- 3. Convenience index for case-insensitive email lookups. Pilot scale
--    doesn't need it for performance, but it doubles as a hint to future
--    devs that lookups are case-insensitive by design.
CREATE INDEX IF NOT EXISTS stores_manager_email_lower_idx
  ON stores (lower(manager_email));

COMMIT;

-- Sanity check — should show manager_email present + the new constraint.
SELECT
  column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'stores'
  AND column_name IN ('manager_email', 'manager_password_hash')
ORDER BY column_name;

SELECT conname, contype
FROM pg_constraint
WHERE conname = 'stores_manager_email_format';
