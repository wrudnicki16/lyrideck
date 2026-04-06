#!/usr/bin/env bash
set -euo pipefail

# ── Isolated Maestro Test Runner ──
# Runs test groups with clear state between each group.
# Usage:
#   EXPO_URL=exp://192.168.4.55:8081 ./run-maestro-tests.sh
#   EXPO_URL=exp://... ./run-maestro-tests.sh --group navigation
#   EXPO_URL=exp://... ./run-maestro-tests.sh --test import-csv-deck

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAESTRO_DIR="$SCRIPT_DIR/.maestro"
SETUP_DIR="$MAESTRO_DIR/setup"

# ── Require EXPO_URL ──
if [[ -z "${EXPO_URL:-}" ]]; then
  echo "ERROR: EXPO_URL is required."
  echo "Usage: EXPO_URL=exp://IP:PORT $0 [--group <name>|--test <name>]"
  exit 1
fi
export EXPO_URL

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Result tracking ──
PASSED=0
FAILED=0
FAILURES=""
TIMINGS=""

add_failure() {
  if [[ -n "$FAILURES" ]]; then
    FAILURES="$FAILURES|$1"
  else
    FAILURES="$1"
  fi
}

add_timing() {
  local entry="$1"
  if [[ -n "$TIMINGS" ]]; then
    TIMINGS="$TIMINGS|$entry"
  else
    TIMINGS="$entry"
  fi
}

format_duration() {
  local secs="$1"
  if (( secs >= 60 )); then
    printf "%dm%02ds" $((secs / 60)) $((secs % 60))
  else
    printf "%ds" "$secs"
  fi
}

# ── Group definitions ──
# Returns "setup|test1,test2,..." for a group name
group_def() {
  case "$1" in
    fresh-app)    echo "|import-csv-deck,import-apkg-deck,spotify-auth" ;;
    navigation)   echo "import-deck|card-queue-navigation,filter-pills,search-field-toggle,export-empty,playlist-cancel" ;;
    capture)      echo "import-deck|select-track-for-card,mark-at-zero,manual-timestamp-capture,search-different-track,manage-clips" ;;
    match)        echo "import-deck|match-cards-flow" ;;
    skip)         echo "import-deck|skip-card-review" ;;
    playlist)     echo "import-deck,match-cards|create-playlist,playlist-with-filters,export-csv" ;;
    destructive)  echo "import-deck|delete-deck" ;;
    now-playing)  echo "import-deck,play-spotify-track|now-playing-flow,now-playing-controls,now-playing-from-deck,now-playing-card-match,now-playing-fallback-search" ;;
    now-playing-no-music) echo "import-deck|now-playing-no-playback" ;;
    filters)      echo "import-deck|saved-filters" ;;
    playlist-new) echo "import-deck|playlist-creation" ;;
    manual-create) echo "|create-deck-manual,add-card-manual" ;;
    sample-deck)  echo "|sample-deck-seeded" ;;
    *) return 1 ;;
  esac
}

ALL_GROUPS="fresh-app navigation capture match skip playlist destructive now-playing now-playing-no-music filters playlist-new manual-create sample-deck"

# ── Helpers ──

run_flow() {
  local flow_path="$1"
  local label="$2"
  echo -e "  ${CYAN}▶${NC} $label"
  if maestro-runner test -e EXPO_URL="$EXPO_URL" "$flow_path"; then
    return 0
  else
    return 1
  fi
}

run_setup() {
  local setup_name="$1"
  local flow_path="$SETUP_DIR/${setup_name}.yaml"
  if [[ ! -f "$flow_path" ]]; then
    echo -e "  ${RED}✗${NC} Setup flow not found: $flow_path"
    return 1
  fi
  run_flow "$flow_path" "setup: $setup_name"
}

run_test() {
  local test_name="$1"
  local flow_path="$MAESTRO_DIR/${test_name}.yaml"
  if [[ ! -f "$flow_path" ]]; then
    echo -e "  ${RED}✗${NC} Test flow not found: $flow_path"
    FAILED=$((FAILED + 1))
    add_failure "$test_name (not found)"
    add_timing "$test_name:0:fail"
    return 1
  fi
  local start_time=$SECONDS
  if run_flow "$flow_path" "$test_name"; then
    local duration=$((SECONDS - start_time))
    echo -e "  ${GREEN}✓${NC} $test_name ($(format_duration $duration))"
    PASSED=$((PASSED + 1))
    add_timing "$test_name:$duration:pass"
  else
    local duration=$((SECONDS - start_time))
    echo -e "  ${RED}✗${NC} $test_name ($(format_duration $duration))"
    FAILED=$((FAILED + 1))
    add_failure "$test_name"
    add_timing "$test_name:$duration:fail"
  fi
}

clear_state() {
  echo -e "  ${YELLOW}⟳${NC} Clearing app state..."
  maestro-runner test "$SETUP_DIR/clear-state.yaml" > /dev/null 2>&1 || true
}

run_group() {
  local group_name="$1"
  local def
  def=$(group_def "$group_name") || {
    echo "ERROR: Unknown group '$group_name'"
    return 1
  }

  local setups="${def%%|*}"
  local tests="${def#*|}"

  echo ""
  echo -e "${BOLD}━━━ Group: ${group_name} ━━━${NC}"

  # 1. Clear state
  clear_state

  # 2. Run setup flows
  if [[ -n "$setups" ]]; then
    IFS=',' read -r -a SETUP_LIST <<< "$setups"
    for setup in "${SETUP_LIST[@]}"; do
      if ! run_setup "$setup"; then
        echo -e "  ${RED}Setup failed, skipping group${NC}"
        IFS=',' read -r -a TEST_LIST <<< "$tests"
        for test in "${TEST_LIST[@]}"; do
          FAILED=$((FAILED + 1))
          add_failure "$test (setup failed)"
        done
        return 1
      fi
    done
  fi

  # 3. Run test flows sequentially
  IFS=',' read -r -a TEST_LIST <<< "$tests"
  for test in "${TEST_LIST[@]}"; do
    run_test "$test"
  done
}

print_summary() {
  local total=$((PASSED + FAILED))
  echo ""
  echo -e "${BOLD}━━━ Summary ━━━${NC}"
  echo -e "  Total:  $total"
  echo -e "  ${GREEN}Passed: $PASSED${NC}"
  echo -e "  ${RED}Failed: $FAILED${NC}"

  if [[ -n "$TIMINGS" ]]; then
    echo ""
    echo -e "${BOLD}Timings:${NC}"
    local total_secs=0
    IFS='|' read -r -a TIMING_LIST <<< "$TIMINGS"
    for entry in "${TIMING_LIST[@]}"; do
      local name="${entry%%:*}"
      local rest="${entry#*:}"
      local secs="${rest%%:*}"
      local status="${rest#*:}"
      total_secs=$((total_secs + secs))
      if [[ "$status" == "pass" ]]; then
        echo -e "  ${GREEN}✓${NC} $(format_duration $secs)  $name"
      else
        echo -e "  ${RED}✗${NC} $(format_duration $secs)  $name"
      fi
    done
    echo -e "  ────────────"
    echo -e "  ${BOLD}$(format_duration $total_secs)  total${NC}"
  fi

  if [[ -n "$FAILURES" ]]; then
    echo ""
    echo -e "${RED}Failed tests:${NC}"
    IFS='|' read -r -a FAIL_LIST <<< "$FAILURES"
    for f in "${FAIL_LIST[@]}"; do
      echo -e "  - $f"
    done
  fi

  echo ""
  if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}All tests passed!${NC}"
  else
    echo -e "${RED}${BOLD}Some tests failed.${NC}"
  fi
}

# ── Find which group a test belongs to ──
find_test_group() {
  local test_name="$1"
  for group in $ALL_GROUPS; do
    local def
    def=$(group_def "$group")
    local tests="${def#*|}"
    IFS=',' read -r -a TEST_LIST <<< "$tests"
    for test in "${TEST_LIST[@]}"; do
      if [[ "$test" == "$test_name" ]]; then
        echo "$group"
        return 0
      fi
    done
  done
  return 1
}

# ── Parse arguments ──
MODE="all"
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --group)
      MODE="group"
      TARGET="${2:-}"
      shift 2
      ;;
    --test)
      MODE="test"
      TARGET="${2:-}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: EXPO_URL=exp://IP:PORT $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --group <name>  Run a single group"
      echo "  --test <name>   Run a single test with its required setup"
      echo "  -h, --help      Show this help"
      echo ""
      echo "Groups:"
      for g in $ALL_GROUPS; do
        def=$(group_def "$g")
        echo "  $g: ${def#*|}"
      done
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# ── Main ──
echo -e "${BOLD}Maestro Isolated Test Runner${NC}"
echo -e "EXPO_URL: $EXPO_URL"

case "$MODE" in
  all)
    for group in $ALL_GROUPS; do
      run_group "$group"
    done
    ;;
  group)
    group_def "$TARGET" > /dev/null || {
      echo "ERROR: Unknown group '$TARGET'"
      echo "Available groups: $ALL_GROUPS"
      exit 1
    }
    run_group "$TARGET"
    ;;
  test)
    group=$(find_test_group "$TARGET") || {
      echo "ERROR: Test '$TARGET' not found in any group"
      exit 1
    }
    echo -e "Test '$TARGET' belongs to group '$group'"

    echo ""
    echo -e "${BOLD}━━━ Setup for: ${TARGET} ━━━${NC}"
    clear_state

    def=$(group_def "$group")
    setups="${def%%|*}"
    if [[ -n "$setups" ]]; then
      IFS=',' read -r -a SETUP_LIST <<< "$setups"
      for setup in "${SETUP_LIST[@]}"; do
        if ! run_setup "$setup"; then
          echo -e "  ${RED}Setup failed${NC}"
          FAILED=1
          add_failure "$TARGET (setup failed)"
          print_summary
          exit 1
        fi
      done
    fi

    run_test "$TARGET"
    ;;
esac

print_summary

# Exit with failure code if any tests failed
[[ $FAILED -eq 0 ]]
