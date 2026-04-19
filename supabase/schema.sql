-- SafeReport — Supabase Schema
-- Run this FIRST in the Supabase SQL Editor.
-- Safe to re-run; uses IF NOT EXISTS and DROP guards where appropriate.

-- =========================
-- Extensions
-- =========================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================
-- Enums
-- =========================
DO $$ BEGIN
  CREATE TYPE store_status AS ENUM ('active', 'temporarily_closed', 'permanently_closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE report_type AS ENUM ('observation', 'incident');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE report_category AS ENUM (
    'near_miss', 'unsafe_act', 'unsafe_condition',
    'first_aid_case', 'medical_treatment_case', 'restricted_work_case',
    'lost_time_injury', 'fatality'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM (
    'new', 'in_progress', 'awaiting_ho', 'returned', 'closed', 'voided'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- For DBs created before the D0 migration, add 'voided' if it's missing.
-- ALTER TYPE ... ADD VALUE can't run inside a transaction, so this is a
-- standalone statement rather than a DO block.
ALTER TYPE report_status ADD VALUE IF NOT EXISTS 'voided' AFTER 'closed';

DO $$ BEGIN
  CREATE TYPE ho_action_type AS ENUM ('approve', 'return', 'void');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TYPE ho_action_type ADD VALUE IF NOT EXISTS 'void' AFTER 'return';

DO $$ BEGIN
  CREATE TYPE notif_channel AS ENUM ('push', 'sms', 'email', 'inapp');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notif_recipient AS ENUM ('reporter', 'manager', 'ho');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =========================
-- Sequence for human-friendly report IDs (SR-000001, SR-000002, ...)
-- =========================
CREATE SEQUENCE IF NOT EXISTS report_seq START 1;

CREATE OR REPLACE FUNCTION next_report_id() RETURNS text AS $$
  SELECT 'SR-' || lpad(nextval('report_seq')::text, 6, '0');
$$ LANGUAGE sql;

-- =========================
-- Stores
-- =========================
CREATE TABLE IF NOT EXISTS stores (
  sap_code           text PRIMARY KEY,
  name               text NOT NULL,
  location           text,
  city               text NOT NULL,
  state              text NOT NULL,
  brand              text NOT NULL,
  manager_name       text,
  manager_phone      text,
  manager_pin_hash   text,                    -- bcrypt
  status             store_status NOT NULL DEFAULT 'active',
  opening_date       date,
  closing_date       date,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stores_brand  ON stores (brand);
CREATE INDEX IF NOT EXISTS idx_stores_city   ON stores (city);
CREATE INDEX IF NOT EXISTS idx_stores_state  ON stores (state);
CREATE INDEX IF NOT EXISTS idx_stores_status ON stores (status);

-- =========================
-- Reports
-- =========================
CREATE TABLE IF NOT EXISTS reports (
  id                 text PRIMARY KEY DEFAULT next_report_id(),
  store_code         text NOT NULL REFERENCES stores(sap_code) ON DELETE RESTRICT,
  type               report_type NOT NULL,
  category           report_category NOT NULL,
  reporter_name      text NOT NULL,
  reporter_phone     text NOT NULL,
  photo_url          text NOT NULL,
  audio_url          text,
  description        text,                    -- optional typed description
  transcript         text,                    -- filled by Whisper (English)
  transcript_error   text,                    -- populated on failure; null on success
  incident_datetime  timestamptz NOT NULL,
  reported_at        timestamptz NOT NULL DEFAULT now(),
  acknowledged_at    timestamptz,
  status             report_status NOT NULL DEFAULT 'new',
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_store       ON reports (store_code);
CREATE INDEX IF NOT EXISTS idx_reports_status      ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_type        ON reports (type);
CREATE INDEX IF NOT EXISTS idx_reports_category    ON reports (category);
CREATE INDEX IF NOT EXISTS idx_reports_reported_at ON reports (reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_store_status ON reports (store_code, status);

-- =========================
-- Resolutions (manager's fix attempts — 1 row per attempt)
-- =========================
CREATE TABLE IF NOT EXISTS resolutions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id       text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  attempt_number  int NOT NULL,
  photo_url       text NOT NULL,
  note            text NOT NULL,
  resolved_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_resolutions_report ON resolutions (report_id);

-- =========================
-- HO actions (approve / return decisions)
-- =========================
CREATE TABLE IF NOT EXISTS ho_actions (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id        text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  resolution_id    uuid REFERENCES resolutions(id) ON DELETE SET NULL,
  action           ho_action_type NOT NULL,
  rejection_reason text,
  actor_user_id    uuid,                      -- references auth.users.id
  acted_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ho_actions_report ON ho_actions (report_id);
CREATE INDEX IF NOT EXISTS idx_ho_actions_actor  ON ho_actions (actor_user_id);

-- =========================
-- HO users profile (auth handled by Supabase Auth)
-- =========================
CREATE TABLE IF NOT EXISTS ho_users (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text NOT NULL,
  role          text NOT NULL DEFAULT 'safety_officer',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- =========================
-- Push subscriptions (for PWA web push)
-- =========================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  role        notif_recipient NOT NULL,          -- manager | ho | reporter
  store_code  text REFERENCES stores(sap_code) ON DELETE CASCADE,
  user_id     uuid,                               -- for HO (auth.users.id)
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth_key    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_store ON push_subscriptions (store_code);
CREATE INDEX IF NOT EXISTS idx_push_user  ON push_subscriptions (user_id);

-- =========================
-- Notification log (durable audit trail)
-- =========================
CREATE TABLE IF NOT EXISTS notification_log (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id           text REFERENCES reports(id) ON DELETE CASCADE,
  recipient_type      notif_recipient NOT NULL,
  recipient_identifier text,                    -- phone, email, or user_id
  channel             notif_channel NOT NULL,
  event_type          text NOT NULL,           -- new_report, acknowledged, resolved, approved, returned, reminder
  payload             jsonb,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  delivery_status     text DEFAULT 'pending'   -- pending | sent | failed
);

CREATE INDEX IF NOT EXISTS idx_notif_report   ON notification_log (report_id);
CREATE INDEX IF NOT EXISTS idx_notif_sent_at  ON notification_log (sent_at DESC);

-- =========================
-- updated_at trigger
-- =========================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stores_updated_at ON stores;
CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_reports_updated_at ON reports;
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =========================
-- Helpful views for HO analytics
-- =========================
CREATE OR REPLACE VIEW v_store_metrics AS
SELECT
  s.sap_code,
  s.name,
  s.brand,
  s.city,
  s.state,
  s.status,
  COUNT(r.id)                                                        AS total_reports,
  COUNT(r.id) FILTER (WHERE r.status IN ('new', 'in_progress'))      AS open_tickets,
  COUNT(r.id) FILTER (WHERE r.status = 'awaiting_ho')                AS awaiting_ho,
  COUNT(r.id) FILTER (WHERE r.status = 'closed')                     AS closed_count,
  MAX(r.reported_at)                                                 AS last_report_at,
  AVG(EXTRACT(EPOCH FROM (
    (SELECT MAX(resolved_at) FROM resolutions WHERE report_id = r.id)
    - r.reported_at)) / 3600.0) FILTER (WHERE r.status = 'closed')  AS avg_resolution_hours
FROM stores s
LEFT JOIN reports r ON r.store_code = s.sap_code
GROUP BY s.sap_code;

-- First-attempt resolution rate per store
CREATE OR REPLACE VIEW v_store_first_attempt AS
SELECT
  s.sap_code,
  COUNT(*) FILTER (WHERE closed_with_attempts = 1)::numeric
    / NULLIF(COUNT(*), 0)::numeric AS first_attempt_rate
FROM stores s
LEFT JOIN (
  SELECT r.id, r.store_code,
         (SELECT MAX(attempt_number) FROM resolutions WHERE report_id = r.id) AS closed_with_attempts
  FROM reports r WHERE r.status = 'closed'
) t ON t.store_code = s.sap_code
GROUP BY s.sap_code;
