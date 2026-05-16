#!/usr/bin/env bash
# session-start-status.sh
# Fires at the start of every Claude Code session. Prints a status banner.

set -u

cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0

PILOT_DATE="2026-05-15"  # update this if the pilot date shifts
TODAY="$(date +%Y-%m-%d)"

# Day delta — works on GNU date (Linux) and BSD date (macOS); falls back gracefully
if days_to_pilot=$(python3 -c "from datetime import date;a=date.fromisoformat('$PILOT_DATE');b=date.fromisoformat('$TODAY');print((a-b).days)" 2>/dev/null); then
  :
else
  days_to_pilot="?"
fi

echo "────────────────────────────────────────────────────────"
echo "  SafeReport · $TODAY · $days_to_pilot day(s) to pilot"
echo "────────────────────────────────────────────────────────"

if [ -f docs/STATE.md ]; then
  # Extract the Open divergences block — everything between the heading and
  # the next heading or end-of-file.
  divs=$(awk '/^## Open divergences/{flag=1;next} /^## /{flag=0} flag' docs/STATE.md | sed '/^$/d')
  if [ -n "$divs" ]; then
    echo "Open divergences:"
    echo "$divs"
    echo "────────────────────────────────────────────────────────"
  else
    echo "STATE.md: no open divergences."
    echo "────────────────────────────────────────────────────────"
  fi
fi

exit 0
