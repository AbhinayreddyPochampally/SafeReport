-- SafeReport — Migration 003
-- Translation pipeline v2: keep both the source-language transcript and
-- the English translation. Lets HO audit the translator, and lets us
-- re-translate on prompt iteration without re-transcribing (Whisper /
-- gpt-4o-transcribe is the expensive call).
--
-- Idempotent.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS transcript_source text;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS transcript_source_lang text;

-- Sanity check
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'reports'
  AND column_name LIKE 'transcript%'
ORDER BY column_name;
