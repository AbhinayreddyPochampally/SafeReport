# agents.md — SafeReport agent orchestration

This file tells autonomous coding agents (Claude Code, Cursor, Aider, Codex CLI,
custom orchestrators) how to work on the SafeReport repo without stepping on
each other. It is the **coordination layer**. The build brief lives in
`CLAUDE.md` — read that first, end-to-end, before any agent touches code.

Order of precedence when documents disagree:

1. `CLAUDE.md` — the locked stack, palette, hard rules, runbook
2. `handoff.md` — the live "what shipped, what's in flight, what's next"
3. `docs/DESIGN.md` and `docs/VISUAL_LANGUAGE.md` — product + visual tokens
4. This file — orchestration rules

If a directive here ever conflicts with `CLAUDE.md`, `CLAUDE.md` wins.

---

## Ground rules (all agents, no exceptions)

The five hard rules below are the ones that come back to bite when agents
ignore them. They are restated from `CLAUDE.md` so they're impossible to miss.

- **Palette is locked.** No `green-*`, `red-*`, `rose-*`, `crimson-*`,
  `lime-*`, `emerald-*` Tailwind classes anywhere. Observations are Slate 600,
  incidents are Amber 700, CLOSED is Teal 700, RETURNED is Orange 700.
  `scripts/lint-guardrails.mjs` is the lint check — never disable it.
- **No Supabase Realtime.** No `.channel(...)`, no `.on('postgres_changes', ...)`.
  Manager inbox polls every 30s gated on `document.visibilityState`. HO is
  navigation-fresh (`dynamic = "force-dynamic"`). The guardrails lint catches
  Realtime introductions too.
- **No new library for the wheel picker.** It is a ~180-line framer-motion
  component (`components/wheel-picker.tsx`). Adding `react-mobile-picker` /
  `react-spring` / any third-party date picker is a regression — reject.
- **Reporter PII never reaches the manager view.** Exclude `reporter_name` and
  `reporter_phone` at query time when fetching for the manager surface, not at
  render time. Test this when touching any `/m/` route.
- **Do not collapse the two photo-capture buttons.** The split "Take photo" +
  "From gallery" pair exists because Android WebView treats `capture` as a hint
  that hides the gallery picker on some OEMs. Collapsing them silently breaks
  uploads on a subset of pilot devices — this was a real incident, see the
  PhotoCapture comment block.

Two more invariants:

- **No heredoc writes** for any file the user's git also sees. The sandbox
  mount does not propagate `cat > file <<EOF` payloads to the user's disk —
  changes appear in the bash mount but not in `git status`. Use the file tools
  (`Read`/`Write`/`Edit`) instead.
- **Verify against the live Supabase project before changing schema.** No
  speculative migration files. If you need new columns, propose the SQL in
  chat first, get user sign-off, then add a numbered migration under
  `supabase/`.

---

## Agent roster

These are roles, not always-on processes. A single Claude Code session can
take any of them; an orchestrator can dispatch several in parallel as long as
each agent stays in its lane.

### `frontend-ui`
- **Owns:** `app/(reporter)/*`, `app/(manager)/*`, `app/(ho)/*`, `components/*`,
  `tailwind.config.ts`, `lib/reporter-i18n.ts`, `lib/categories.ts`
- **Reads only:** `lib/supabase/*`, `lib/*-auth.ts`, the API routes (for response
  shapes)
- **Hard limits:** Cannot edit API routes, cannot touch SQL, cannot change
  the wheel-picker behaviour without the user reading the diff
- **Smoke:** `npm run lint:guardrails` + visual check in the dev server.
  For viewport-sensitive work, render parallel HTML mockups first (see
  *Design verification* below) — do not skip that step on UI changes

### `backend-api`
- **Owns:** `app/api/*`, `lib/manager-auth.ts`, `lib/ho-auth.ts`,
  `lib/report-submit.ts`, `middleware.ts`
- **Reads only:** `components/*`, schema definitions
- **Hard limits:** No edits to React components. No SQL migrations (those
  go through `db-schema`). Authentication-touching changes ping the user
  before merging — auth is the load-bearing thing for the pilot
- **Smoke:** `npm run smoke:api` against local AND against the live Railway URL

### `db-schema`
- **Owns:** `supabase/*.sql`, the migration sequence
- **Reads only:** the API routes that consume the schema
- **Hard limits:** Migrations are numbered (`001_`, `002_`, …). Never edit a
  migration that's already been applied to the live project. New changes go in
  a new file. Migrations must be idempotent (`if not exists` etc.) because
  the user re-runs them mid-development. The `rls.sql` policies do not enable
  Realtime — keep it that way
- **Smoke:** apply against the staging Supabase branch, then run
  `npm run smoke:api`

### `voice-pipeline`
- **Owns:** `app/api/transcribe/route.ts`, related prompt strings in `lib/`,
  `scripts/smoke-translate.ts`
- **Reads only:** the `reports` table shape, the manager and HO detail screens
  that surface transcripts
- **Hard limits:** The pipeline is two-stage —
  `gpt-4o-transcribe` (whisper-1 fallback) → `gpt-4o-mini` translate.
  Do not collapse it to a single call. Stage A's prompt biases the decoder
  toward retail-floor vocabulary — preserve that. The English-skip gate is
  Hinglish-resistant; do not loosen it
- **Smoke:** `npm run smoke:translate` against the fixture audio

### `qa-smoke`
- **Owns:** `scripts/smoke-api.sh`, `scripts/smoke-translate.ts`,
  `scripts/lint-guardrails.mjs`
- **Reads only:** anything, but writes only smoke / lint
- **Hard limits:** Smoke runs against local + the live Railway URL. The single
  expected failure today is the manager landing 404 for stores with no
  password set (that's a correct guard, not a regression). 12/13 == green.
  Anything else is a regression to investigate before shipping

### `design-verifier`
- **Owns:** the disposable HTML mockup pass that runs BEFORE any UI work
- **Reads only:** the visual language doc, the existing components for tone
- **Hard limits:** Generates two mockups with *distinct philosophies*
  (e.g. dense vs. calm, dark vs. light, formal vs. friendly), saves them to
  a local-only scratch folder (gitignored), and waits for the user to pick
  one. Never commits mockups. Never proceeds to coding without the user's
  pick. This was a hard-earned working agreement and skipping it has cost
  the team time

### `release-engineer`
- **Owns:** `nixpacks.toml`, the Railway deploy, the smoke matrix
- **Reads only:** `package.json`, the build output
- **Hard limits:** Target Port in the Railway service settings must match the
  `$PORT` the Next.js server binds to (`npm run start` resolves to
  `next start -H 0.0.0.0 -p ${PORT:-3000}`). Node 20 is pinned in
  `nixpacks.toml`. Rollback is the Deployments tab → previous build →
  Redeploy. Don't revert on `main` under pressure — redeploy is faster

---

## Orchestration patterns

These are the dispatch patterns that have actually worked on this project.
Each one is a recipe an orchestrator (or a single developer driving Claude
Code through plan mode) can apply.

### Pattern A — Parallel design exploration (UI work)
1. Dispatch two `design-verifier` agents in parallel with **distinct visual
   philosophies** in their prompts.
2. Render the two mockups to disk under `design-mockups/` (gitignored).
3. Pause and surface both to the user — let them pick one, or pull the best
   from each.
4. Only then hand off to `frontend-ui` to write the production component.

This is the user's documented working preference. Skipping step 1-3 to go
straight to code is a regression of the workflow itself.

### Pattern B — Schema change with API consumers
1. `db-schema` writes a new numbered migration with a draft of the SQL.
   Stops before applying.
2. User reviews the SQL. After sign-off, `db-schema` applies it to the live
   Supabase project (development branch if one exists; main otherwise).
3. `backend-api` updates the consuming routes — same commit batch.
4. `qa-smoke` runs `smoke:api` against local and against the deployed URL
   before push.

### Pattern C — Cross-surface feature (touches reporter + manager + HO)
Do **not** dispatch three agents simultaneously to the three surfaces. They
share types in `lib/categories.ts`, `lib/reporter-state.ts`, and the report
status enum. Serialise instead:
1. `frontend-ui` updates shared types + the reporter surface
2. `frontend-ui` re-spawns for the manager surface (consumes new shape)
3. `frontend-ui` re-spawns for the HO surface (consumes new shape)
4. `qa-smoke` runs smoke against all three

### Pattern D — Voice pipeline tweak
1. `voice-pipeline` makes the change.
2. Runs `npm run smoke:translate` against the fixture.
3. If pass, commits + pushes. The pipeline is fired-and-forgotten from
   `/api/reports`, so the reporter's flow doesn't break even if a translation
   call regresses — but the HO surface will start showing the
   "Transcription failed" banner. Watch the next live report to confirm.

### Pattern E — Single-file fix
Do not over-orchestrate small fixes. If the change is one file under 30 lines,
a single Claude Code session handles it without invoking the roster. Use
the roster when the work cuts across files or roles.

---

## Hand-off discipline

When one agent finishes a batch and hands off to another (or to the user):

- **Update `handoff.md`** with what changed, what's in flight, what's next.
  This file is the live state-of-the-build — agents read it on resume.
- **Commit + push autonomously** per the user's working agreement. Use
  Windows-MCP PowerShell from Cowork, or `git` from the local shell.
  Do not ask the user to push.
- **Surface pre-existing issues** found in passing as separate follow-up
  notes — do not silently fix them in the same commit. The user wants to
  see scope changes explicitly. (Example today: `app/api/transcribe/route.ts`
  carries an orphan `{ error: ... }` block after the success return — a
  remnant of a botched prior edit on `main` since `81d08d1`. Flag it for
  user decision, don't sneak the fix in.)
- **One commit per logical batch.** Don't bundle unrelated changes. The
  commit message format is short and present-tense:
  - `feat: …` new behaviour
  - `fix: …` bug fix
  - `chore: …` housekeeping (no behaviour change)
  - `refactor: …` internal restructure, no behaviour change
  - `db: …` schema migration
  - Optional surface tag in brackets: `feat(ho): …`, `fix(reporter): …`

---

## Stop-the-line conditions

If any of these are tripped, an agent halts and pings the user instead of
self-healing:

- A guardrails lint failure that the agent cannot resolve without
  reintroducing a forbidden colour or Realtime call.
- A schema change that would break an existing deployed migration's invariant.
- A smoke regression on the deployed URL (not just local).
- A typecheck failure in a file the agent didn't open this session — that's
  preexisting and the user needs to decide whether to fix it in this batch.
- Any auth-path change that isn't explicitly approved.
- Anything that requires deleting a tracked file the agent didn't add itself.

The pilot has 20 live stores and a fatality-grade workflow downstream — bias
to "stop and ask" over "ship and see".

---

## Local sandbox quirks (Cowork-specific)

For agents running inside Cowork / Claude Code with a Linux sandbox + Windows
host:

- The bash sandbox can read and edit files in the mount but cannot delete
  files Windows is holding open. If `rm` returns "Operation not permitted",
  fall through to `Windows-MCP PowerShell` and run `Remove-Item -Force`.
- `npx next build` in the sandbox `SIGBUS`es on memory pressure. Use
  `npx tsc --noEmit` + `npm run lint:guardrails` locally — the production
  build is verified by pushing to Railway.
- The `Write` tool truncates on long payloads (especially ones with em-dash
  `—` runs). For files larger than ~100 lines, write in two passes or use
  `Edit` for incremental changes.
- Inline `SR_BASE_URL=...` env-var syntax does not work in PowerShell. From
  Git Bash it does, so smoke runs go through Git Bash:
  `SR_BASE_URL=https://… bash scripts/smoke-api.sh`.

---

## Where to look first

| If you need …                                | Read first              |
| -------------------------------------------- | ----------------------- |
| The build brief, palette, hard rules         | `CLAUDE.md`             |
| What just shipped / what's in flight         | `handoff.md`            |
| Product flows, microcopy, screen behaviour   | `docs/DESIGN.md`        |
| Tokens, fonts, component conventions         | `docs/VISUAL_LANGUAGE.md` |
| Day-1 ops, deploy, rollback                  | `CLAUDE.md` § RUNBOOK   |
| How to set up the repo from scratch          | `README.md`             |

— Team Alpha · maintained by the agent roster
