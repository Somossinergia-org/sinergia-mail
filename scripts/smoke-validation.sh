#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Smoke Validation Script — Sinergia Go-Live
# ═══════════════════════════════════════════════════════════════════════════════
#
# Usage:
#   ./scripts/smoke-validation.sh <BASE_URL> [AUTH_COOKIE]
#
# Examples:
#   ./scripts/smoke-validation.sh http://localhost:3000 "next-auth.session-token=abc123"
#   ./scripts/smoke-validation.sh https://staging.somossinergia.es "next-auth.session-token=xyz"
#
# Requirements: curl, jq
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
AUTH_COOKIE="${2:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'

PASSED=0
FAILED=0
WARNINGS=0

# ─── Helpers ──────────────────────────────────────────────────────────────────

check_deps() {
  for cmd in curl jq; do
    if ! command -v "$cmd" &>/dev/null; then
      echo -e "${RED}ERROR: $cmd is required but not installed${NC}"
      exit 1
    fi
  done
}

api_get() {
  local path="$1"
  local url="${BASE_URL}${path}"
  if [[ -n "$AUTH_COOKIE" ]]; then
    curl -sS --max-time 10 -H "Cookie: ${AUTH_COOKIE}" "$url"
  else
    curl -sS --max-time 10 "$url"
  fi
}

api_patch() {
  local path="$1"
  local body="$2"
  local url="${BASE_URL}${path}"
  if [[ -n "$AUTH_COOKIE" ]]; then
    curl -sS --max-time 10 -X PATCH -H "Content-Type: application/json" -H "Cookie: ${AUTH_COOKIE}" -d "$body" "$url"
  else
    curl -sS --max-time 10 -X PATCH -H "Content-Type: application/json" -d "$body" "$url"
  fi
}

pass() {
  echo -e "  ${GREEN}✓${NC} $1"
  PASSED=$((PASSED + 1))
}

fail() {
  echo -e "  ${RED}✗${NC} $1"
  FAILED=$((FAILED + 1))
}

warn() {
  echo -e "  ${YELLOW}⚠${NC} $1"
  WARNINGS=$((WARNINGS + 1))
}

# ─── Checks ──────────────────────────────────────────────────────────────────

check_deps

echo ""
echo -e "${BOLD}═══ Sinergia Smoke Validation ══════════════════════════════════════${NC}"
echo -e "  Target: ${BASE_URL}"
echo -e "  Auth:   ${AUTH_COOKIE:+configured}${AUTH_COOKIE:-NOT SET (will get 401)}"
echo ""

# ── 1. Basic Connectivity ──────────────────────────────────────────────────
echo -e "${BOLD}[1/7] Basic Connectivity${NC}"

HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "${BASE_URL}/" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "000" ]]; then
  fail "Cannot reach ${BASE_URL} (connection refused/timeout)"
elif [[ "$HTTP_CODE" =~ ^[23] ]]; then
  pass "Server reachable (HTTP ${HTTP_CODE})"
else
  warn "Server returned HTTP ${HTTP_CODE}"
fi

# ── 2. Sanity Check Endpoint ──────────────────────────────────────────────
echo -e "${BOLD}[2/7] Sanity Check Endpoint${NC}"

if [[ -z "$AUTH_COOKIE" ]]; then
  warn "No AUTH_COOKIE — skipping authenticated endpoints"
else
  SANITY=$(api_get "/api/operations/sanity-check" 2>/dev/null || echo '{"error":"request_failed"}')
  SANITY_OK=$(echo "$SANITY" | jq -r '.ok // empty' 2>/dev/null)

  if [[ "$SANITY_OK" == "true" ]]; then
    TOTAL=$(echo "$SANITY" | jq -r '.summary.totalChecks // 0')
    PASS_COUNT=$(echo "$SANITY" | jq -r '.summary.passed // 0')
    pass "Sanity check passed (${PASS_COUNT}/${TOTAL} checks)"
  elif [[ "$SANITY_OK" == "false" ]]; then
    FAILURES=$(echo "$SANITY" | jq -r '.checks[] | select(.status=="fail") | .name' 2>/dev/null | tr '\n' ', ')
    fail "Sanity check failed: ${FAILURES}"
  else
    ERROR=$(echo "$SANITY" | jq -r '.error // "unknown"' 2>/dev/null)
    fail "Sanity check request failed: ${ERROR}"
  fi

  # Show environment info
  MODE=$(echo "$SANITY" | jq -r '.environment.operationMode // "unknown"' 2>/dev/null)
  HAS_ENC=$(echo "$SANITY" | jq -r '.environment.hasEncryptionKey // false' 2>/dev/null)
  echo -e "    Mode: ${MODE} | Encryption: ${HAS_ENC}"
fi

# ── 3. Operational Health ─────────────────────────────────────────────────
echo -e "${BOLD}[3/7] Operational Health${NC}"

if [[ -z "$AUTH_COOKIE" ]]; then
  warn "Skipped (no auth)"
else
  HEALTH=$(api_get "/api/operations/health" 2>/dev/null || echo '{"error":"request_failed"}')
  HEALTH_ERR=$(echo "$HEALTH" | jq -r '.error // empty' 2>/dev/null)

  if [[ -z "$HEALTH_ERR" ]]; then
    TOTAL_CASES=$(echo "$HEALTH" | jq -r '.cases.total // 0')
    STALE=$(echo "$HEALTH" | jq -r '.cases.stale // 0')
    BLOCKS=$(echo "$HEALTH" | jq -r '.lastHour.blocks // 0')
    pass "Health endpoint OK — ${TOTAL_CASES} cases, ${STALE} stale, ${BLOCKS} blocks/1h"
  else
    fail "Health endpoint error: ${HEALTH_ERR}"
  fi
fi

# ── 4. Runtime Switches ───────────────────────────────────────────────────
echo -e "${BOLD}[4/7] Runtime Switches${NC}"

if [[ -z "$AUTH_COOKIE" ]]; then
  warn "Skipped (no auth)"
else
  SWITCHES=$(api_get "/api/operations/switches" 2>/dev/null || echo '{"error":"request_failed"}')
  SW_ERR=$(echo "$SWITCHES" | jq -r '.error // empty' 2>/dev/null)

  if [[ -z "$SW_ERR" ]]; then
    SW_COUNT=$(echo "$SWITCHES" | jq -r '.switches | length // 0' 2>/dev/null)
    pass "Switches endpoint OK — ${SW_COUNT} switches configured"

    # Verify critical kill switches exist
    KILL_ALL=$(echo "$SWITCHES" | jq -r '.switches[] | select(.key=="KILL_BLOCK_ALL_COMMS") | .value // empty' 2>/dev/null)
    if [[ "$KILL_ALL" == "false" || "$KILL_ALL" == "" ]]; then
      pass "KILL_BLOCK_ALL_COMMS = false (comms enabled)"
    elif [[ "$KILL_ALL" == "true" ]]; then
      warn "KILL_BLOCK_ALL_COMMS = true (ALL external comms blocked!)"
    fi
  else
    fail "Switches endpoint error: ${SW_ERR}"
  fi
fi

# ── 5. Cases List ─────────────────────────────────────────────────────────
echo -e "${BOLD}[5/7] Cases API${NC}"

if [[ -z "$AUTH_COOKIE" ]]; then
  warn "Skipped (no auth)"
else
  CASES=$(api_get "/api/operations/cases" 2>/dev/null || echo '{"error":"request_failed"}')
  CASES_ERR=$(echo "$CASES" | jq -r '.error // empty' 2>/dev/null)

  if [[ -z "$CASES_ERR" ]]; then
    CASE_COUNT=$(echo "$CASES" | jq -r '.cases | length // 0' 2>/dev/null)
    pass "Cases endpoint OK — ${CASE_COUNT} cases returned"
  else
    fail "Cases endpoint error: ${CASES_ERR}"
  fi
fi

# ── 6. Activity Endpoint ──────────────────────────────────────────────────
echo -e "${BOLD}[6/7] Activity / Audit${NC}"

if [[ -z "$AUTH_COOKIE" ]]; then
  warn "Skipped (no auth)"
else
  ACTIVITY=$(api_get "/api/operations/activity" 2>/dev/null || echo '{"error":"request_failed"}')
  ACT_ERR=$(echo "$ACTIVITY" | jq -r '.error // empty' 2>/dev/null)

  if [[ -z "$ACT_ERR" ]]; then
    EVT_COUNT=$(echo "$ACTIVITY" | jq -r '.events | length // 0' 2>/dev/null)
    pass "Activity endpoint OK — ${EVT_COUNT} recent events"
  else
    fail "Activity endpoint error: ${ACT_ERR}"
  fi
fi

# ── 7. Response Times ─────────────────────────────────────────────────────
echo -e "${BOLD}[7/7] Response Times${NC}"

if [[ -n "$AUTH_COOKIE" ]]; then
  for endpoint in "/api/operations/sanity-check" "/api/operations/health" "/api/operations/switches"; do
    TIME_MS=$(curl -sS -o /dev/null -w "%{time_total}" --max-time 10 -H "Cookie: ${AUTH_COOKIE}" "${BASE_URL}${endpoint}" 2>/dev/null || echo "99")
    TIME_MS_INT=$(echo "$TIME_MS * 1000" | bc 2>/dev/null | cut -d. -f1 || echo "?")

    if [[ "$TIME_MS_INT" =~ ^[0-9]+$ ]] && [[ "$TIME_MS_INT" -lt 3000 ]]; then
      pass "${endpoint} — ${TIME_MS_INT}ms"
    elif [[ "$TIME_MS_INT" =~ ^[0-9]+$ ]]; then
      warn "${endpoint} — ${TIME_MS_INT}ms (>3s, slow!)"
    else
      warn "${endpoint} — timing unavailable"
    fi
  done
else
  warn "Skipped (no auth)"
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══ Summary ════════════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}Passed:${NC}   ${PASSED}"
echo -e "  ${RED}Failed:${NC}   ${FAILED}"
echo -e "  ${YELLOW}Warnings:${NC} ${WARNINGS}"
echo ""

if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ✓ SMOKE VALIDATION PASSED — System ready for go-live phase${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}${BOLD}  ✗ SMOKE VALIDATION FAILED — ${FAILED} critical check(s) failed${NC}"
  echo ""
  exit 1
fi
