#!/usr/bin/env bash
# post-edit-migration.sh
# Fires after any Edit/Write. Only nags if a supabase migration was touched.

set -u

FILE="${CLAUDE_TOOL_FILE_PATH:-}"

case "$FILE" in
  */supabase/migrations/*.sql)
    cat <<'EOF'
[post-edit-migration] You touched a Supabase migration. Sanity check:
  - Idempotent? (CREATE … IF NOT EXISTS, DROP … IF EXISTS, BEGIN/COMMIT, etc.)
    The user re-runs migrations mid-development.
  - Numbered correctly? Never edit a migration that's already applied to prod.
    New changes → new file with the next number.
  - Add a CHANGELOG.md entry for the migration.
  - Bump or add a row in docs/STATE.md "Schema migrations".
  - Run `npm run smoke:api` against the live URL after applying.
EOF
    ;;
esac

exit 0
