-- SafeReport — Migration 005
-- Stores-needing-attention dismiss state.
--
-- The HO Stores tab surfaces stores that match attention criteria —
-- never reported, low traffic, dormant tier — so HO can phone the store
-- manager offline and resolve the gap. Marking a row "resolved" needs
-- to be visible to every HO user (not per-client localStorage), so we
-- persist a single timestamp on the store row.
--
-- A NULL value means "not handled" — the row surfaces in the panel
-- whenever it matches attention criteria. A non-null value means
-- "HO has handled this recently"; the panel suppresses it until either
-- (a) the value is cleared, or (b) criteria re-trigger in a fresh way
-- the page-side rule decides is significant. v1 rule: if reset to null,
-- re-surface immediately; the simplest possible behaviour.
--
-- Also tracks who acted, for audit. attention_handled_by points at
-- ho_users.user_id (uuid). Nullable because the column may be back-
-- filled later without a known actor.
--
-- Idempotent. Run AFTER 004.

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS attention_handled_at timestamptz;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS attention_handled_by uuid;

-- Optional foreign-key on the actor. Permissive — set ON DELETE SET NULL
-- so removing an HO user doesn't cascade-clear the dismiss timestamps
-- (we lose the actor attribution but keep the handled state, which is
-- the right trade for an audit field).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = 'stores_attention_handled_by_fkey'
  ) THEN
    ALTER TABLE stores
      ADD CONSTRAINT stores_attention_handled_by_fkey
      FOREIGN KEY (attention_handled_by)
      REFERENCES ho_users(user_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Sanity check
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'stores'
  AND column_name LIKE 'attention_%'
ORDER BY column_name;
