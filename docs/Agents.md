# Agents — master catalogue

All agents available on this repo, grouped by purpose. Definitions live in
the linked files; this file is the index.

---

## Coding agents — `agents.md` (repo root)

Roles for writing/changing code. Each owns specific paths and runs specific
smoke checks. Read `agents.md` end-to-end before dispatching.

| Agent | Owns | Smoke |
|---|---|---|
| `frontend-ui` | `app/(reporter|manager|ho)/*`, `components/*`, `lib/reporter-i18n.ts`, `lib/categories.ts` | `lint:guardrails` + visual check |
| `backend-api` | `app/api/*`, `lib/*-auth.ts`, `middleware.ts` | `smoke:api` local + Railway |
| `db-schema` | `supabase/*.sql`, migration sequence | apply on staging, then `smoke:api` |
| `voice-pipeline` | `app/api/transcribe/route.ts`, `scripts/smoke-translate.ts` | `smoke:translate` |
| `qa-smoke` | `scripts/smoke-*.{sh,ts}`, `scripts/lint-guardrails.mjs` | itself |
| `design-verifier` | disposable HTML mockups before any UI work | parallel mockups → user picks |
| `release-engineer` | `nixpacks.toml`, Railway deploy | smoke matrix |

Orchestration patterns (A–E) in `agents.md` cover the dispatch shapes that
have actually worked: parallel design exploration, schema change with API
consumers, cross-surface features (serialised), voice pipeline tweaks,
single-file fixes (no orchestration).

---

## Doc maintenance — `docs/agents/`

| Agent | Job | Edits |
|---|---|---|
| [`doc-doctor`](agents/doc-doctor.md) | Verify CLAUDE.md vs code; refresh STATE.md timestamps; flag divergences | `STATE.md`, `STALE.md` |
| [`doc-pruner`](agents/doc-pruner.md) | Find stale refs (dead code, removed env vars, broken commands) | `STALE.md` |

See `docs/agents/README.md` for cadence and wiring.

---

## Operations — `docs/agents/`

| Agent | Job |
|---|---|
| [`launch-checklist`](agents/launch-checklist.md) | Run the full pre-launch verification matrix (lint + typecheck + smoke + readiness) |
| [`i18n-parity`](agents/i18n-parity.md) | Verify Kannada strings match every English key across the reporter flow |
| [`schema-vs-api`](agents/schema-vs-api.md) | Verify columns referenced in API routes exist in the current schema + migration set |

---

## Wiring into Claude Code

```bash
mkdir -p .claude/agents
cp docs/agents/*.md .claude/agents/
```

The frontmatter `name:` is what the Task tool matches on. Dispatch with
phrasings like "use the launch-checklist subagent to ...".

---

## When to dispatch which

- **Before a deploy:** `launch-checklist`. Doubles as `qa-smoke` + `release-engineer` preflight.
- **After a feature ships:** `doc-doctor`. Bumps STATE.md and flags any new divergence.
- **Weekly + after migrations:** `doc-pruner`. Catches what survived the cleanup.
- **Touching reporter copy:** `i18n-parity` after the change.
- **Touching API or migrations:** `schema-vs-api` after the change.
- **Writing code:** the coding roster in `agents.md`.
