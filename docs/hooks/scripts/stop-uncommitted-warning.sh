#!/usr/bin/env bash
# stop-uncommitted-warning.sh
# Fires when Claude's turn finishes. Warns if any source-of-truth files
# have uncommitted changes — these are the files where drift causes problems.

set -u

cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0

SOT_PATHS="CLAUDE.md docs/STATE.md docs/CHANGELOG.md docs/STALE.md supabase/migrations"

dirty=$(git status --porcelain -- $SOT_PATHS 2>/dev/null)

if [ -n "$dirty" ]; then
  echo "[stop-uncommitted] Source-of-truth files have uncommitted changes:"
  echo "$dirty" | sed 's/^/  /'
  echo "Consider committing before the next session — these are the files"
  echo "where drift causes real problems."
fi

exit 0
