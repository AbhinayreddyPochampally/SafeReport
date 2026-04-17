# How to hand this off to Claude Code

This file answers: **"what do I give to Claude Code?"**

The short answer: you give it the scaffold (already done) and a short prompt
(below). The long brief lives in `CLAUDE.md` — Claude Code reads that itself.

---

## Step 1 — Get the repo onto your machine

1. Extract the tarball you were just given:
   ```bash
   tar -xzf safereport-scaffold.tar.gz
   cd safereport
   ```
2. Initialise git and push to a fresh GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Initial scaffold (Team Alpha, v6)"
   gh repo create safereport --private --source=. --push
   ```

## Step 2 — Create the Supabase project

1. Sign in at supabase.com → **New project** (free tier is fine for the pilot).
2. In the SQL Editor, run these four files **in order**:
   1. `supabase/schema.sql` — tables, enums, SR-ID generator, views
   2. `supabase/rls.sql` — row-level security policies
   3. `supabase/storage.sql` — three buckets (audio, photos, resolutions)
   4. `supabase/seed.sql` — 10 stores + ~55 demo reports
3. In **Authentication → Users**, add a user:
   - email: `ho@safereport.demo`
   - password: `SafeDemo2026!`
4. Copy these to `.env.local` (see `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Fill the remaining env vars: `OPENAI_API_KEY` (you have credits), `RESEND_API_KEY`,
   `SESSION_SECRET` (32 random bytes — `openssl rand -hex 32`).

> Note: `supabase/rls.sql` no longer enables Realtime on tables — v6 dropped realtime.
> If you see any `alter publication supabase_realtime add table ...` lines, skip them.

## Step 3 — Open the repo in Claude Code Desktop (or Cursor)

Open the `safereport/` folder. In the chat panel, paste this prompt verbatim:

---

```
Read CLAUDE.md end to end before writing any code.

Then execute Phase A only. Stop at the exit criterion and show me the
running localhost page so I can verify before you move to Phase B.

Do not deviate from the stack, palette, or architecture specified in
CLAUDE.md. No green, no red, no Supabase Realtime subscriptions
anywhere in the codebase.

When Phase A passes, I will tell you to proceed to Phase B, and so on
through Phase G. Commit at the end of each phase with the message
"[Phase X] <summary>".

If a phase overruns its time estimate by 50%, pause and tell me before
continuing. Do not silently roll work from one phase into another.

Start now with Phase A.
```

---

That's it. Claude Code reads `CLAUDE.md`, which points it at `docs/DESIGN.md` and
`docs/VISUAL_LANGUAGE.md` and the v6 PDF for context. It will install deps,
configure Tailwind with the v6 palette, set up Supabase clients, and land on the
Phase A exit criterion (reporter landing page renders with the store name).

## Step 4 — After Phase A passes

When Phase A is verified, reply in the Claude Code chat:

```
Phase A verified. Proceed to Phase B.
```

Repeat for each phase. Phase F is the last in-dev phase; Phase G is the Railway
deploy and smoke test and should only start once you're ready to distribute QR
posters to pilot stores.

## Step 5 — Before the Monday demo

1. Follow `DEMO_SCRIPT.md` line by line for your dry run.
2. Have the local screencast + backup Hindi voice note in place (see DEMO_SCRIPT.md
   §"What to have ready").
3. Pre-log in as HO on a second tab; pre-unlock manager PIN on the demo phone.

## If something goes sideways mid-build

- **Claude Code starts pulling in a date-picker library for screen 4:** stop it.
  The wheel picker is ~180 lines of framer-motion. The spec is in CLAUDE.md
  §"Wheel picker spec (Screen 4)".
- **Claude Code starts adding `bg-green-*` or `bg-red-*`:** stop it. Point at
  CLAUDE.md §"Palette rules".
- **Claude Code sets up Supabase Realtime subscriptions:** stop it. Point at
  CLAUDE.md §"Refresh model (no realtime)".
- **Phase runs over budget:** pause, scope-reduce, do not carry scope between phases.

## What's already done for you (in the tarball)

- `CLAUDE.md` — the full build brief (this is what Claude Code reads)
- `docs/DESIGN.md` — product spec (Claude Code reads when it needs detail)
- `docs/VISUAL_LANGUAGE.md` — palette, fonts, components
- `supabase/*.sql` — four SQL files you run on the Supabase SQL editor
- `DEMO_SCRIPT.md` — your Monday walkthrough
- `README.md` — quick-start
- `package.json` — dependencies pinned
- `.env.example` — env var template
- `scripts/create-ho-user.ts` — helper to bind HO auth UUID after Supabase user creation

## What Claude Code will produce

- A Next.js 14 app under `app/` with three route groups (reporter, manager, HO)
- 8 API routes under `app/api/`
- A working `<WheelPicker />` component
- Charts, Excel export, web-push notifications, Whisper background job
- A GitHub repo deploying to Railway at a live URL

Total build time from Phase A to Phase G, if nothing goes sideways: **~24 hours**
of Claude Code runtime spread across ~3 calendar days. You have that before Monday.

Good luck. See you on the other side.

— Team Alpha
