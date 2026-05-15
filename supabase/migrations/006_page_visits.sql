-- SafeReport — Migration 006
-- Per-store reporter-landing visit tracking.
--
-- Why this exists: the HO analytics page can already see how many reports
-- were FILED per store, but it can't see how many people visited the
-- reporter QR landing without filing. That gap matters operationally —
-- a store with 200 visits and 4 reports is reaching staff but losing
-- them somewhere in the funnel (copy issue, trust issue, picky photo
-- requirement); a store with 0 visits is a poster-placement issue, not
-- a UX issue. Different intervention. We need both numbers to tell
-- them apart.
--
-- One row per landing-page hit. Inserted by a tiny beacon endpoint
-- (/api/visits/log) called from the reporter landing on mount, with
-- a short cookie throttle to keep refreshes from inflating counts.
--
-- `source` = 'qr' if the URL carried ?src=qr (we tag the QR poster URLs
-- with this), 'direct' otherwise. That gives HO a clean split between
-- "the printed poster is being scanned" and "someone arrived through
-- a shared link or bookmark".
--
-- `visitor_fingerprint` is a hash (sha-256 hex, first 16 chars) of the
-- visitor's User-Agent + a daily salt. Not PII — can't link back to a
-- person, can only count distinct devices per day. This is enough for
-- the "unique visitors" metric without touching identifiers.
--
-- Idempotent — safe to re-run.

create table if not exists public.page_visits (
  id           bigint generated always as identity primary key,
  sap_code     text   not null,
  visited_at   timestamptz not null default now(),
  source       text   not null check (source in ('qr','direct')),
  visitor_fingerprint text not null,
  user_agent_hash text  -- reserved for future bot-filtering, nullable for now
);

create index if not exists idx_page_visits_sap_visited
  on public.page_visits (sap_code, visited_at desc);

create index if not exists idx_page_visits_visited
  on public.page_visits (visited_at desc);

-- The reporter landing is unauthenticated, so the beacon endpoint uses
-- the service-role client to write. Lock anon out of direct table access
-- as a defence-in-depth measure; the only legitimate write path is the
-- /api/visits/log handler, which authenticates by SAP-code existence.
alter table public.page_visits enable row level security;

-- No policies for anon/authenticated = deny-all. service_role bypasses RLS.
-- HO reads happen through the ho-analytics route (also service-role).
-- If we ever expose read access to authenticated HO users via PostgREST,
-- add a policy here.
