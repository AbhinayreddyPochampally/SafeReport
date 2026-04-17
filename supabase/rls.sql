-- SafeReport — Row Level Security
-- Run AFTER schema.sql.
--
-- Design philosophy:
--  * Reporter flow is unauthenticated (design §12.1). Inserts into `reports` go
--    through an API route using the service-role key — RLS is *bypassed* there.
--    So public-facing clients cannot talk to these tables directly with the anon key.
--  * Managers authenticate via a custom PIN flow, not Supabase Auth. Their session
--    cookie is checked in our own API routes. They also never hit the DB directly.
--  * Only HO users (Supabase Auth users) can read via the anon key in the browser,
--    and only because they're logged in.
--
-- For the demo we are conservative: DENY everything by default via RLS, and rely on
-- the service-role key used in `src/lib/supabase/admin.ts` for all writes and
-- privileged reads. HO dashboard reads go through Next.js server components that
-- use the authenticated Supabase client (cookie-bound) — those users are granted
-- read access if they have a row in `ho_users`.

-- Enable RLS
ALTER TABLE stores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolutions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ho_actions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ho_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log   ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an HO user?
CREATE OR REPLACE FUNCTION is_ho_user() RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM ho_users WHERE user_id = auth.uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Stores: HO can read everything.
DROP POLICY IF EXISTS stores_ho_read ON stores;
CREATE POLICY stores_ho_read ON stores
  FOR SELECT TO authenticated USING (is_ho_user());

-- Allow any public (anon) caller to read ONLY the non-sensitive columns of a single
-- store (used by the reporter page to check status). To keep this simple, we expose
-- a view with just the safe columns:
CREATE OR REPLACE VIEW v_store_public AS
  SELECT sap_code, name, brand, city, state, status FROM stores;

GRANT SELECT ON v_store_public TO anon, authenticated;

-- Reports: HO can read & update status fields.
DROP POLICY IF EXISTS reports_ho_read ON reports;
CREATE POLICY reports_ho_read ON reports
  FOR SELECT TO authenticated USING (is_ho_user());

-- Resolutions: HO read.
DROP POLICY IF EXISTS resolutions_ho_read ON resolutions;
CREATE POLICY resolutions_ho_read ON resolutions
  FOR SELECT TO authenticated USING (is_ho_user());

-- HO actions: HO read, insert self.
DROP POLICY IF EXISTS ho_actions_ho_read ON ho_actions;
CREATE POLICY ho_actions_ho_read ON ho_actions
  FOR SELECT TO authenticated USING (is_ho_user());

DROP POLICY IF EXISTS ho_actions_ho_insert ON ho_actions;
CREATE POLICY ho_actions_ho_insert ON ho_actions
  FOR INSERT TO authenticated
  WITH CHECK (is_ho_user() AND actor_user_id = auth.uid());

-- HO users: self-read.
DROP POLICY IF EXISTS ho_users_self ON ho_users;
CREATE POLICY ho_users_self ON ho_users
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Push subs: HO can manage their own subs.
DROP POLICY IF EXISTS push_subs_self ON push_subscriptions;
CREATE POLICY push_subs_self ON push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Notification log: HO read.
DROP POLICY IF EXISTS notif_log_ho_read ON notification_log;
CREATE POLICY notif_log_ho_read ON notification_log
  FOR SELECT TO authenticated USING (is_ho_user());

-- v6 note: Supabase Realtime is NOT used in this pilot.
-- The manager inbox polls every 30s when visible; the HO dashboard refreshes on navigation.
-- Do not add tables to the supabase_realtime publication — see CLAUDE.md §"Refresh model".
