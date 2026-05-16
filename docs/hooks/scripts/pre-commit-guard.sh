#!/usr/bin/env bash
# pre-commit-guard.sh
# Fires before any Bash command. Only acts on `git commit` / `git push`.
# Reads the proposed command from $CLAUDE_TOOL_INPUT (Claude Code env var).
# Exits non-zero to abort the command; exit 0 to allow it through.

set -u

CMD="${CLAUDE_TOOL_INPUT:-}"

# Only trigger for git commit / git push
if ! echo "$CMD" | grep -qE 'git[[:space:]]+(commit|push)'; then
  exit 0
fi

cd "$(git rev-parse --show-toplevel)" || exit 0

echo "[pre-commit-guard] running lint:guardrails…"
if ! npm run lint:guardrails --silent; then
  echo "[pre-commit-guard] BLOCKED: lint:guardrails failed."
  exit 1
fi

echo "[pre-commit-guard] running typecheck…"
if ! npx tsc --noEmit; then
  echo "[pre-commit-guard] BLOCKED: typecheck failed."
  exit 1
fi

echo "[pre-commit-guard] ok"
exit 0
