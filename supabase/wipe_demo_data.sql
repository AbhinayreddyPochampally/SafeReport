-- SafeReport — Demo data wipe
-- Run in Supabase SQL Editor before reseeding with the 20 production stores.
--
-- What this does:
--   * Removes every row from reports, resolutions, ho_actions, notification_log,
--     push_subscriptions, and stores. Uses TRUNCATE ... CASCADE in a single
--     statement so foreign keys don't trip the order.
--   * Resets the SR-NNNNNN sequence so production reports start at SR-000001.
--   * Leaves ho_users alone (existing HO logins keep working for the pilot).
--
-- Storage objects: the SQL seed used external picsum.photos URLs, so no orphans
-- there. If you've been testing real submissions, the audio/ and photos/ buckets
-- will hold leftover blobs — clear them from Supabase Studio → Storage if you
-- want a fully clean slate. They won't break anything if left in place.
--
-- Wrapped in a transaction so a partial failure rolls back cleanly.

BEGIN;

TRUNCATE TABLE
  notification_log,
  ho_actions,
  resolutions,
  push_subscriptions,
  reports,
  stores
RESTART IDENTITY CASCADE;

-- The SR-NNNNNN sequence is a standalone SEQUENCE, not a SERIAL column,
-- so RESTART IDENTITY above doesn't touch it. Reset explicitly.
ALTER SEQUENCE report_seq RESTART WITH 1;

COMMIT;

-- Sanity check — every count should be 0 and next_report_seq should be 1
SELECT
  (SELECT COUNT(*) FROM stores)             AS stores,
  (SELECT COUNT(*) FROM reports)            AS reports,
  (SELECT COUNT(*) FROM resolutions)        AS resolutions,
  (SELECT COUNT(*) FROM ho_actions)         AS ho_actions,
  (SELECT COUNT(*) FROM notification_log)   AS notifications,
  (SELECT COUNT(*) FROM push_subscriptions) AS push_subs,
  (SELECT last_value FROM report_seq)       AS next_report_seq;
