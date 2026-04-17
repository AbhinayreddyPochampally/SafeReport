-- SafeReport — Storage Buckets
-- Run AFTER schema.sql and rls.sql, OR create these in the Supabase dashboard UI
-- (Storage → New bucket). SQL version included here for reproducibility.

-- Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('photos',      'photos',      true,  10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('audio',       'audio',       true,  10485760, ARRAY['audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav']),
  ('resolutions', 'resolutions', true,  10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Policy: anyone can READ (needed for <img> src= to work without signed URLs in the demo)
DO $$ BEGIN
  DROP POLICY IF EXISTS "public read photos"      ON storage.objects;
  DROP POLICY IF EXISTS "public read audio"       ON storage.objects;
  DROP POLICY IF EXISTS "public read resolutions" ON storage.objects;
END $$;

CREATE POLICY "public read photos"      ON storage.objects FOR SELECT USING (bucket_id = 'photos');
CREATE POLICY "public read audio"       ON storage.objects FOR SELECT USING (bucket_id = 'audio');
CREATE POLICY "public read resolutions" ON storage.objects FOR SELECT USING (bucket_id = 'resolutions');

-- Writes: only service_role (used from our API routes) — so no explicit INSERT policy
-- for anon/authenticated. The service role key bypasses RLS.
--
-- In production, add a signed-URL flow instead of public read, but for the
-- demo this is correct and saves us from juggling signed URLs in React.
