# SafeReport — Design Reference v6

Condensed design reference for Claude Code. For the full product design document
see `/mnt/user-data/outputs/SafeReport_Design_Document_v6.pdf` (49 pages).

---

## Product in one paragraph

A voice-first, icon-driven, anonymous-to-manager incident reporting system for ABFRL's
off-roll store workers. Reporter scans a QR near the back-of-house notice board, picks
a category icon, records a voice note in any Indian language, picks a time with an
Apple-style wheel picker, optionally attaches a photo, submits. Manager sees the report
(voice + English transcript + photo), acknowledges, resolves, files resolution to HO.
HO approves or returns. No priority tiers, no realtime subscriptions, no PII shown to
the store manager.

---

## Three surfaces

| Surface   | Route               | Auth                      | Users                        |
| --------- | ------------------- | ------------------------- | ---------------------------- |
| Reporter  | `/r/[sap_code]`     | None                      | Off-roll, on-roll, visitors  |
| Manager   | `/m/[sap_code]`     | Four-digit store PIN      | Store + deputy managers      |
| HO        | `/ho`               | Supabase email auth       | Cluster leads, safety team   |

---

## Reporter flow — six screens, 60-second target

### Screen 1 — Landing
- Name + phone + role (on-roll / off-roll / contractor / visitor)
- Autofilled from `localStorage` on repeat visits
- Micro-copy: "Your name is visible only to Head Office, never to the store manager"

### Screen 2 — Category
- 2×4 grid of icon tiles, 140×140 px
- Three Observation tiles (Slate 600 accent): near miss, unsafe act, unsafe condition
- Five Incident tiles (Amber 700 accent): first-aid, medical treatment, restricted work, lost-time, fatality
- Bilingual labels: local language on top, English underneath in Slate 600 12px

### Screen 3 — Voice
- Single 160×160 mic button, Indigo 700 fill, Stone 100 plate
- Live waveform + timer during recording
- 3-second min, 120-second max
- Playback + re-record after stop
- No text alternative on this screen (voice is primary)

### Screen 4 — Apple-style wheel picker
- **Three wheels:** Day (Today / Yesterday / 2 days ago / …up to 7 days), Hour (00–23), Minute (00 / 15 / 30 / 45)
- **Five visible rows per column**
- **Centre row is the selection:** Indigo 100 fill, Indigo 500 border bracket, Indigo 900 text at 14pt bold
- **Distance-1 rows:** Slate 600 at 11pt
- **Distance-2 rows:** Slate 400 at 9.5pt
- **Snap animation:** 180ms cubic-bezier(0.2, 0.9, 0.3, 1), no bounce
- **Haptic feedback** on selection change (compatible devices only)
- **Keyboard:** arrow keys move selection by 1, PageUp/PageDown by 3
- **Implementation:** `framer-motion` with `drag="y"` and custom snap modifier. Do NOT use a third-party date-picker library. Target ~180 lines of component code.

### Screen 5 — Photo
- Primary CTA: "Take photo" (`<input type="file" capture>`)
- Secondary link: "Skip — no photo"
- Client-side compressed to 1600px longest edge, 80% JPEG
- Stored as Blob, uploaded on Submit

### Screen 6 — Review and Submit
- Summary of category, voice, time, photo
- "Edit" returns to screen 2 with state preserved
- "Submit" POSTs multipart to `/api/reports`
- On success: confirmation with human ID (`SR-000042`), "Close" CTA

---

## Manager flow

### PIN login
- Four-digit PIN, bcrypt-hashed in `stores.pin_hash`
- On success: signed JWT cookie, HttpOnly, SameSite=Lax, 7-day TTL
- Three wrong attempts → 15-min lockout per SAP code

### Inbox
- Scrollable list of report cards, newest first
- Filter pills: All / New / Acknowledged / Awaiting HO / Closed / Returned
- Default filter: "New + Returned" (states that need manager action)
- Card shows: Report ID, category icon+name, status badge, relative timestamp, first 80 chars of transcript, media glyphs
- **No realtime subscription.** A 30-second `fetch` loop runs while the tab is visible and stops when backgrounded. Pull-to-refresh also works.

### Report detail
- Audio player with scrubber and 1x/1.5x speed toggle
- English transcript in a Stone 100 card below the audio
- Photo full-width, tap to expand
- Context: event time, reporter role (name/phone NOT shown)
- CTA depends on status:
  - New → **Acknowledge**
  - Acknowledged → **File resolution** (opens form)
  - Awaiting HO → read-only, "Waiting for HO approval" banner
  - Returned → **Revise resolution** (form pre-filled, HO comment shown)
  - Closed → read-only, "Resolution approved by HO" banner

### Resolution form
- What was done — multiline 20–500 chars, required
- Proof photo — optional, max 5MB
- Action taken — one of: Fixed on-site / Escalated to vendor / Policy change / Training issued / No action needed
- On submit → status = Awaiting HO, notification to HO cluster lead

---

## HO dashboard

### Auth
- Supabase Auth email + password
- `ho_users` table maps auth UUID → display_name + scope
- Scope values: `national`, `cluster:{ID}`, `store:{SAP_CODE}`
- All queries scoped at RLS level — dashboard code does not filter

### Landing
- Four summary cards:
  - Reports this month (Indigo 700, with sparkline)
  - Awaiting my approval (Sky 700, clickable)
  - Closed this month (Teal 700)
  - Returned this month (Orange 700, clickable)
- Approval queue table (sorted oldest-first)
- Category heatmap: 12 months × 8 categories

### Report detail (HO)
Same as manager view with additions:
- Reporter name + phone visible
- Approve / Return for rework / Void buttons (when applicable)
- Return requires 10–300 char comment
- Void requires 20+ char audit reason, irreversible

### Analytics
- Area chart: reports per week, stacked by status
- Bar chart: category mix, grouped by month
- Store leaderboard: top 20 by volume + first-attempt rate
- Heatmap: 12-month × 8-category density
- All built with Recharts, filterable by date/brand/city/category

### Refresh model
- **No Supabase Realtime subscriptions.**
- HO page fetches fresh on every navigation
- No background polling on HO (they respond to email / SMS notifications)
- All pages server-rendered so a refresh = latest state

---

## Status state machine

Five states, five transitions, no shortcuts:

```
NEW ──manager opens──▶ ACKNOWLEDGED ──resolution filed──▶ AWAITING HO ──HO approves──▶ CLOSED
                            ▲                                   │
                            │                                   │
                            └──────────rework──── RETURNED ◀────┘ HO returns
```

Colours:
- NEW → Slate 600
- ACKNOWLEDGED → Indigo 700
- AWAITING HO → Sky 700
- CLOSED → Teal 700  (terminal)
- RETURNED → Orange 700

Invariants:
- No state can be skipped (no NEW → CLOSED shortcut)
- Manager: NEW → ACK → AWAITING HO, and RETURNED → AWAITING HO
- HO: AWAITING HO → CLOSED, and AWAITING HO → RETURNED
- RETURNED does NOT create a new report; `resolutions.attempt_no` increments in place
- Reports are never deleted (only voided by HO with audit reason)

---

## Categories (eight, flat)

**Observations** (no injury, Slate 600):
- `near_miss` — event that could have caused injury but didn't
- `unsafe_act` — risky behaviour by a person
- `unsafe_condition` — risky physical state of the environment

**Incidents** (injury occurred, Amber 700):
- `first_aid_case` — treated on-site
- `medical_treatment_case` — beyond first aid
- `restricted_work_case` — modified duties
- `lost_time_injury` — ≥ 1 day away from work
- `fatality` — triggers SMS alert to national HO

No sub-categories, no severity, no priority. The manager does the risk assessment, not the reporter.

---

## Voice transcription (Whisper)

**Always use `openai.audio.translations.create` — not `transcriptions`.**

Rationale: translations always outputs English regardless of source language. Transcriptions
returns the source language, which managers cannot read. One API call, one endpoint, no
language-detection logic.

```ts
const transcript = await openai.audio.translations.create({
  model: 'whisper-1',
  file: audioBuffer,
  response_format: 'text',
})
```

Pipeline:
1. Client: `MediaRecorder` → `audio/webm` blob
2. Upload as multipart on Submit
3. Store in `audio` bucket at `{SAP_CODE}/{YEAR}/{MONTH}/{report_id}.webm`
4. Write report row (status `new`, transcript empty) — reporter sees confirmation immediately
5. Background job calls Whisper, writes result to `reports.transcript_en`
6. If Whisper fails, job retries hourly for 6 hours; report remains usable with audio only

---

## Notifications — non-realtime

| Trigger                       | Recipient              | Channel          |
| ----------------------------- | ---------------------- | ---------------- |
| New report filed              | Store manager          | Web push         |
| Resolution awaiting approval  | HO cluster lead        | Email            |
| Resolution returned           | Store manager          | Web push + email |
| Resolution closed             | Store manager          | Web push         |
| Fatality reported             | National HO + cluster  | SMS + email      |

- **Web push** via VAPID. Manager grants permission on first PIN login.
- **Email** via Resend (free tier covers pilot volume).
- **SMS** via MSG91 (pre-paid), used only for fatality alerts.
- **Nothing listens in-app for "something happened" events.** No websockets, no Supabase Realtime.

---

## Data model (summary)

Seven tables:

- `stores` — SAP-code keyed registry (name, brand, city, pin_hash, status)
- `reports` — the core record (SR-NNNNNN human ID, category, voice_path, transcript_en, event_at, status)
- `resolutions` — manager-filed, 1:many with reports (attempt_no, description, action_taken)
- `ho_actions` — HO approve/return/void audit trail
- `ho_users` — HO profile with scope
- `push_subscriptions` — web push endpoints per device
- `notification_log` — outbound notification audit

Views:
- `v_store_metrics` — per-store aggregates for the dashboard
- `v_store_first_attempt` — first-attempt resolution rate per store

Storage buckets: `audio`, `photos`, `resolutions` (each 10MB max).

RLS is deny-by-default on every table. The anon key cannot insert into `reports` directly —
all writes go through the service-role API routes.

---

## What's excluded from v6

- Realtime subscriptions (Supabase Realtime)
- Severity sliders, priority tiers, urgency flags
- Green and red in the UI
- Chat between reporter and manager
- Push-to-HO from the manager (HO responds to email/SMS instead)
- Gamification, leaderboards visible to reporters
- Dark mode
- AI triage or auto-classification

---

## Deliverable checklist

See `CLAUDE.md` Phase A–G for the build sequence.
See the full PDF for rationale, research, risk register, roadmap.
