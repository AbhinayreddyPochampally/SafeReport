#!/usr/bin/env bash
# post-edit-claude-md.sh
# Fires after any Edit/Write. Only nags if CLAUDE.md was the file touched.

set -u

FILE="${CLAUDE_TOOL_FILE_PATH:-}"

case "$FILE" in
  *CLAUDE.md)
    cat <<'EOF'
[post-edit-claude-md] You edited CLAUDE.md. Two follow-ups:
  1. Add an entry to docs/CHANGELOG.md if the change was substantive
     (schema, auth, flow shape — not a typo fix).
  2. Bump the Verified date in docs/STATE.md for the affected subsystem,
     or flip its status to ⚠ if you introduced a divergence.
EOF
    ;;
esac

exit 0
