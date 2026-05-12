#!/usr/bin/env bash
#
# scripts/smoke-api.sh
#
# Hits the public-facing routes and asserts they don't 500. Designed to run
# against either the local dev server or the deployed Railway URL — set
# SR_BASE_URL accordingly.
#
# Usage:
#     SR_BASE_URL=http://localhost:3000 bash scripts/smoke-api.sh
#     SR_BASE_URL=https://safereport.up.railway.app bash scripts/smoke-api.sh
#     SR_TEST_SAP=PNT-MUM-047 bash scripts/smoke-api.sh
#
# What's covered:
#   - Reporter landing page renders for a real SAP code
#   - Manager landing page returns 200 (login screen) for a real SAP code
#   - Auth endpoint rejects bogus credentials with 401 (not 500)
#   - PIN payload is rejected with 410 (legacy guard)
#   - QR poster route requires HO auth (401)
#   - HO landing route requires HO auth (302/redirect)
#
# Anything not 2xx/3xx/expected-4xx breaks the build.

set -uo pipefail

BASE="${SR_BASE_URL:-http://localhost:3000}"
SAP="${SR_TEST_SAP:-PNT-MUM-047}"

PASS=0
FAIL=0
FAILED_CASES=()

# colours — only when stdout is a TTY
if [[ -t 1 ]]; then
  G=$'\e[32m'; R=$'\e[31m'; Y=$'\e[33m'; D=$'\e[0m'
else
  G=''; R=''; Y=''; D=''
fi

# check NAME EXPECTED_REGEX URL [-X METHOD] [-H HEADER] [-d BODY]
# Sends curl, captures status, asserts it matches EXPECTED_REGEX.
check() {
  local name="$1" expected="$2" url="$3"
  shift 3
  local status
  status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "$@" "$url" 2>/dev/null || echo "000")
  if [[ "$status" =~ $expected ]]; then
    printf "  ${G}✓${D}  %-58s  %s\n" "$name" "$status"
    PASS=$((PASS + 1))
  else
    printf "  ${R}✗${D}  %-58s  %s (expected %s)\n" "$name" "$status" "$expected"
    FAIL=$((FAIL + 1))
    FAILED_CASES+=("$name")
  fi
}

echo
echo "Smoke testing ${BASE} (sap=${SAP})"
echo

echo "Public reporter surface"
check "Reporter landing GET /r/${SAP}"          '^(200|304)$' "${BASE}/r/${SAP}"
check "Reporter landing GET /r/BOGUS"           '^(200|304)$' "${BASE}/r/BOGUS-CODE-9999"

echo
echo "Manager surface"
check "Manager landing GET /m/${SAP}"           '^(200|304)$' "${BASE}/m/${SAP}"

echo
echo "Manager auth (negative cases — must not 500)"
check "Auth POST bogus phone+password → 401"    '^401$' \
  "${BASE}/api/auth/manager" \
  -X POST -H "Content-Type: application/json" \
  -d '{"sap_code":"'"$SAP"'","phone":"+910000000000","password":"definitely-wrong"}'
check "Auth POST legacy pin payload → 410"      '^410$' \
  "${BASE}/api/auth/manager" \
  -X POST -H "Content-Type: application/json" \
  -d '{"sap_code":"'"$SAP"'","pin":"4729"}'
check "Auth POST malformed body → 400"          '^400$' \
  "${BASE}/api/auth/manager" \
  -X POST -H "Content-Type: application/json" \
  -d 'not-json'
check "Auth GET (no cookie) → 200 signed_in:false" '^200$' \
  "${BASE}/api/auth/manager"

echo
echo "HO surface (must require auth — never 500/200 to anonymous)"
check "QR route GET (no HO cookie) → 401"       '^401$' "${BASE}/api/qr/${SAP}"
check "QR bulk GET (no HO cookie) → 401"        '^401$' "${BASE}/api/qr/bulk?scope=new"
check "HO Stores PATCH (no cookie) → 401"       '^401$' \
  "${BASE}/api/ho-stores" \
  -X PATCH -H "Content-Type: application/json" -d '{"sap_code":"'"$SAP"'","name":"x"}'
check "HO landing /ho (no cookie) → 200/302"    '^(200|302|307)$' "${BASE}/ho"

echo
echo "Reports API (server-only writes)"
check "Reports POST (no body) → 4xx"            '^4(00|01|13|22)$' \
  "${BASE}/api/reports" -X POST

echo
echo "Static / health"
check "Root GET / → 200/302"                    '^(200|302|307)$' "${BASE}/"

echo
echo "----"
TOTAL=$((PASS + FAIL))
if [[ $FAIL -eq 0 ]]; then
  echo "${G}All ${TOTAL} checks passed.${D}"
  exit 0
else
  echo "${R}${FAIL}/${TOTAL} checks failed:${D}"
  for c in "${FAILED_CASES[@]}"; do
    echo "  - $c"
  done
  echo
  echo "${Y}Re-run with curl -v on the failing case for the full request/response.${D}"
  exit 1
fi
