# Claude Code hooks

Five hooks that catch the things that have actually gone wrong on this repo.
Each is a shell script that fires at a Claude Code lifecycle point.

| Hook | Fires | What it does |
|---|---|---|
| `pre-commit-guard.sh` | `PreToolUse` on Bash matching `git push` or `git commit` | Runs `lint:guardrails` + `typecheck`. Aborts the command on failure. |
| `post-edit-claude-md.sh` | `PostToolUse` on Edit/Write of `CLAUDE.md` | Reminds you to update `docs/STATE.md` and `docs/CHANGELOG.md`. |
| `post-edit-migration.sh` | `PostToolUse` on Edit/Write of `supabase/migrations/*.sql` | Reminds about idempotency, palette-compliance, and STATE.md entry. |
| `session-start-status.sh` | `SessionStart` | Prints days-to-pilot + any open divergences from `docs/STATE.md`. |
| `stop-uncommitted-warning.sh` | `Stop` (Claude's turn finishes) | Warns if there are uncommitted changes to source-of-truth files. |

## Wiring

Copy the settings snippet into `.claude/settings.local.json` and the scripts
into `.claude/hooks/`:

```bash
mkdir -p .claude/hooks
cp docs/hooks/scripts/*.sh .claude/hooks/
chmod +x .claude/hooks/*.sh
# Then merge docs/hooks/settings.example.json into .claude/settings.local.json
```

If `.claude/settings.local.json` already exists, merge the `hooks` keys
manually rather than replacing the whole file.

## Disabling individual hooks

Comment out the entry in `.claude/settings.local.json`, or `chmod -x` the
script so it falls through silently.

## Why these five

Each one corresponds to a known way this project has bitten itself:

- **pre-commit-guard:** the deploy advice in CLAUDE.md is "run `lint:guardrails && tsc --noEmit` locally before pushing." The last failed Railway deploy was a single stray unused import — strict-mode Next build rejected it. This hook makes that check non-skippable.
- **post-edit-claude-md:** the auth doc-drift incident that triggered this entire maintenance system. Editing CLAUDE.md without bumping STATE.md is exactly the slip.
- **post-edit-migration:** migrations have to be idempotent (the user re-runs them mid-development) and palette-compliant (we've shipped non-idempotent migrations before).
- **session-start-status:** the pilot launches tomorrow. The first thing every session should see is "how many days, what's broken."
- **stop-uncommitted-warning:** the autonomous-push memory says to commit + push after every clean batch. This hook surfaces uncommitted SOT-file changes so they don't slip.
