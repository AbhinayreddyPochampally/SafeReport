-- SafeReport — Migration 007
-- AI-classified categories: reporter no longer picks; AI suggests, HO confirms.
--
-- Run AFTER 002_manager_password.sql, 003_transcript_source.sql,
-- 004_manager_email.sql, 005_store_attention.sql, and 006_page_visits.sql.
--
-- Flow change (pilot, May 2026):
--   * Reporter flow drops the triage + sub-category screens. Submissions
--     arrive with no category and no type set.
--   * /api/classify (text-in-text-out, gpt-4o-mini) runs after voice
--     transcription completes and writes a suggested_category +
--     confidence + category_source='ai'.
--   * HO confirms or overrides on the report-detail page. The hard rule
--     for Fatality / Lost Time Injury is that they can only be set via
--     the dropdown — single-button "confirm AI's pick" is disabled for
--     those two. Enforced in the app layer; this migration only carries
--     the columns.
--
-- Schema deltas:
--   * reports.category              → made NULLABLE. Filled when HO confirms
--                                     (or overrides) on the detail page.
--   * reports.type                  → made NULLABLE. Derived from the final
--                                     category at confirm time (3 observations
--                                     + 5 incidents — pinned in the app code,
--                                     not the schema, so the taxonomy can
--                                     evolve without a migration).
--   * reports.suggested_category    (NEW) — AI's pick. Null when no voice
--                                           was attached (photo-only or
--                                           text-only reports skip AI in
--                                           the pilot) or when classify
--                                           failed.
--   * reports.confidence            (NEW) — AI confidence 0..100. Null when
--                                           suggested_category is null.
--   * reports.category_source       (NEW) — origin of the final category:
--                                           'ai'            → HO hasn't
--                                                             touched it yet
--                                                             (transitional;
--                                                             we don't seal
--                                                             a report at
--                                                             this state)
--                                           'ho-confirmed'  → HO clicked
--                                                             confirm on the
--                                                             AI's pick (or
--                                                             selected the
--                                                             same value
--                                                             from the
--                                                             dropdown)
--                                           'ho-corrected'  → HO selected
--                                                             a different
--                                                             value from
--                                                             the dropdown
--                                                             (or AI never
--                                                             ran and HO
--                                                             picked from
--                                                             scratch)
--
-- The pilot starts with a fresh dataset (no historical reports needing
-- backfill). No data migration is needed.
--
-- Idempotent — every statement uses IF EXISTS / IF NOT EXISTS guards.

BEGIN;

-- 1. Relax NOT NULL on category + type so /api/reports can insert
--    "pending classification" rows. The app layer guards against any
--    surface ever displaying a NULL category to a user — pending rows
--    render as "Awaiting classification" / "AI: <category>".
ALTER TABLE reports
  ALTER COLUMN category DROP NOT NULL;

ALTER TABLE reports
  ALTER COLUMN type DROP NOT NULL;

-- 2. Confidence enum: keep it as a small int 0..100 rather than a new
--    PostgreSQL enum because we may want to migrate to a continuous
--    probability later, and integer columns survive that without a
--    rewrite. CHECK constraint pinned in the same statement.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS suggested_category report_category;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS confidence smallint;

-- 3. category_source — new enum. Use a DO block for idempotency on
--    re-runs (CREATE TYPE has no IF NOT EXISTS).
DO $$ BEGIN
  CREATE TYPE category_source AS ENUM ('ai', 'ho-confirmed', 'ho-corrected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS category_source category_source;

-- 4. CHECK: confidence is 0..100 when set. Drop-then-create so the
--    migration is rerunnable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'reports' AND constraint_name = 'reports_confidence_range_chk'
  ) THEN
    ALTER TABLE reports DROP CONSTRAINT reports_confidence_range_chk;
  END IF;
END $$;

ALTER TABLE reports
  ADD CONSTRAINT reports_confidence_range_chk
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100));

-- 5. Index suggested_category so the "AI-suggested LTI / Fatality awaiting
--    review" filter on the HO console (post-pilot) doesn't seq-scan reports
--    once volume grows.
CREATE INDEX IF NOT EXISTS idx_reports_suggested_category
  ON reports (suggested_category);

CREATE INDEX IF NOT EXISTS idx_reports_category_source
  ON reports (category_source);

COMMIT;
