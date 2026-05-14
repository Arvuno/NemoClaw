#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# =============================================================================
# test-tunnel-and-uninstall.sh
# NemoClaw Tunnel & Uninstall E2E Tests
#
# Covers:
#   TC-DEPLOY-01a: nemoclaw tunnel start (cloudflared tunnel)
#   TC-DEPLOY-01b: tunnel URL serves the OpenClaw dashboard
#   TC-DEPLOY-01c: nemoclaw tunnel stop removes URL from status
#   TC-DEPLOY-02: nemoclaw uninstall --keep-openshell --yes
#
# Prerequisites:
#   - Docker running
#   - NVIDIA_API_KEY set
#   - Network access to integrate.api.nvidia.com
#
# TC-DEPLOY-02 is DESTRUCTIVE — it uninstalls NemoClaw. Runs last.
# Skip with SKIP_UNINSTALL=1.
# =============================================================================

set -euo pipefail

# ── Overall timeout ──────────────────────────────────────────────────────────
export NEMOCLAW_E2E_DEFAULT_TIMEOUT=3600
SCRIPT_DIR_TIMEOUT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=test/e2e/e2e-timeout.sh
source "${SCRIPT_DIR_TIMEOUT}/e2e-timeout.sh"
# shellcheck source=test/e2e/lib/install-path-refresh.sh
source "${SCRIPT_DIR_TIMEOUT}/lib/install-path-refresh.sh"

# ── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0
TOTAL=0

# Log a timestamped message.
log() { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*" | tee -a "$LOG_FILE"; }
# Record a passing assertion.
pass() {
  ((PASS += 1))
  ((TOTAL += 1))
  echo -e "${GREEN}  PASS${NC} $1" | tee -a "$LOG_FILE"
}
# Record a failing assertion.
fail() {
  ((FAIL += 1))
  ((TOTAL += 1))
  echo -e "${RED}  FAIL${NC} $1 — $2" | tee -a "$LOG_FILE"
}
# Record a skipped test.
skip() {
  ((SKIP += 1))
  ((TOTAL += 1))
  echo -e "${YELLOW}  SKIP${NC} $1 — $2" | tee -a "$LOG_FILE"
}

# ── Config ───────────────────────────────────────────────────────────────────
SANDBOX_NAME="${NEMOCLAW_SANDBOX_NAME:-e2e-tunnel-uninstall}"
LOG_FILE="test-tunnel-and-uninstall-$(date +%Y%m%d-%H%M%S).log"

# ── Resolve repo root ────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ── Install NemoClaw if not present ──────────────────────────────────────────
install_nemoclaw() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
  fi
  nemoclaw_ensure_local_bin_on_path

  if command -v nemoclaw >/dev/null 2>&1; then
    log "nemoclaw already installed: $(nemoclaw --version 2>/dev/null || echo unknown)"
    return
  fi
  log "=== Installing NemoClaw via install.sh ==="
  NEMOCLAW_SANDBOX_NAME="$SANDBOX_NAME" \
    NVIDIA_API_KEY="${NVIDIA_API_KEY:-nvapi-DUMMY-FOR-INSTALL}" \
    NEMOCLAW_NON_INTERACTIVE=1 \
    NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE=1 \
    bash "$REPO_ROOT/install.sh" --non-interactive --yes-i-accept-third-party-software \
    2>&1 | tee -a "$LOG_FILE"
  nemoclaw_refresh_install_env
  if ! command -v nemoclaw >/dev/null 2>&1; then
    log "ERROR: install.sh failed — nemoclaw not found"
    exit 1
  fi
}

# ── Pre-flight ───────────────────────────────────────────────────────────────
preflight() {
  log "=== Pre-flight checks ==="
  if ! docker info >/dev/null 2>&1; then
    log "ERROR: Docker is not running."
    exit 1
  fi
  log "Docker is running"

  local api_key="${NVIDIA_API_KEY:-}"
  if [[ -z "$api_key" ]]; then
    log "ERROR: NVIDIA_API_KEY not set"
    exit 1
  fi

  install_nemoclaw

  if ! command -v cloudflared >/dev/null 2>&1; then
    log "Installing cloudflared..."
    local arch
    arch=$(uname -m)
    case "$arch" in
      x86_64) arch="amd64" ;;
      aarch64 | arm64) arch="arm64" ;;
      *)
        log "WARNING: Unsupported arch $arch for cloudflared — skipping install"
        return 0
        ;;
    esac
    local cf_url="${CLOUDFLARED_DOWNLOAD_URL:-https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}}"
    if curl -fsSL "$cf_url" -o /tmp/cloudflared \
      && chmod +x /tmp/cloudflared \
      && sudo mv /tmp/cloudflared /usr/local/bin/cloudflared 2>/dev/null; then
      log "cloudflared installed"
    else
      log "WARNING: Could not install cloudflared"
    fi
  fi

  log "nemoclaw: $(nemoclaw --version 2>/dev/null || echo unknown)"
  log "cloudflared: $(cloudflared --version 2>/dev/null || echo 'not available')"
  log "Pre-flight complete"
}

# ── Onboard helper ───────────────────────────────────────────────────────────
onboard_sandbox() {
  local name="$1"
  log "  Onboarding sandbox '$name'..."
  rm -f "$HOME/.nemoclaw/onboard.lock" 2>/dev/null || true
  NEMOCLAW_SANDBOX_NAME="$name" \
    NEMOCLAW_NON_INTERACTIVE=1 \
    NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE=1 \
    NEMOCLAW_POLICY_TIER="open" \
    run_with_timeout 1800 nemoclaw onboard --non-interactive --yes-i-accept-third-party-software \
    2>&1 | tee -a "$LOG_FILE" || {
    log "FATAL: Onboard failed for '$name'"
    return 1
  }
  log "  Sandbox '$name' onboarded"
}

# =============================================================================
# TC-DEPLOY-01a: nemoclaw tunnel start (cloudflared tunnel)
# TC-DEPLOY-01b: tunnel URL serves the OpenClaw dashboard
# TC-DEPLOY-01c: nemoclaw tunnel stop removes tunnel URL from status
# =============================================================================
test_tunnel_lifecycle() {
  log "=== TC-DEPLOY-01a/b/c: Start / Probe / Stop ==="

  if ! command -v cloudflared >/dev/null 2>&1; then
    skip "TC-DEPLOY-01a / TC-DEPLOY-01b / TC-DEPLOY-01c" "cloudflared not installed"
    return
  fi

  # Cascade guard: skip if a prior step left the sandbox missing.
  if ! nemoclaw list 2>/dev/null | grep -Fq -- "$SANDBOX_NAME"; then
    skip "TC-DEPLOY-01a / TC-DEPLOY-01b / TC-DEPLOY-01c" \
      "Sandbox '$SANDBOX_NAME' not present"
    return
  fi

  # ── TC-DEPLOY-01a: Start tunnel + verify URL surfaces ───────────────────────────────────
  log "  Step 1: Running nemoclaw tunnel start..."
  local start_output start_rc=0
  start_output=$(nemoclaw tunnel start 2>&1) || start_rc=$?
  log "  Start output:"
  log "  ---"
  log "$start_output"
  log "  ---"
  if [[ $start_rc -ne 0 ]]; then
    fail "TC-DEPLOY-01a: Start" "nemoclaw tunnel start failed (exit $start_rc)"
    return
  fi

  log "  Step 2: Reading nemoclaw status (polling for tunnel URL)..."
  local status_output tunnel_url
  for i in $(seq 1 15); do
    status_output=$(nemoclaw status 2>&1) || true
    tunnel_url=$(printf '%s\n' "$status_output" | grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" | head -1) || true
    [[ -n "$tunnel_url" ]] && break
    sleep 1
  done

  if [[ -n "$tunnel_url" ]]; then
    pass "TC-DEPLOY-01a: Tunnel URL found in status ($tunnel_url)"
  else
    fail "TC-DEPLOY-01a: Start" "Start executed but tunnel URL did not surface in status"
    # Stop the tunnel even no tunnel URL was found
    log "  Stopping tunnel..."
    nemoclaw tunnel stop 2>/dev/null || true
    log "  Tunnel stopped"
    return
  fi

  # ── TC-DEPLOY-01b: Tunnel serves the OpenClaw dashboard ────────────────────────
  if [[ -n "$tunnel_url" ]]; then
    log "  Step 3: Probing tunnel URL (HTTP + content)..."
    local http_code="000" body_file
    body_file=$(mktemp)
    for i in $(seq 1 10); do
      http_code=$(curl -sS -o "$body_file" -w '%{http_code}' \
        --max-time 30 "$tunnel_url" 2>/dev/null || echo "000")
      if [[ "$http_code" == "200" ]]; then
        break
      fi
      log "  [$i] Tunnel URL returned '$http_code', retrying in 5s..."
      sleep 5
    done

    # print the body file in beautiful format
    log "  Body file: $(cat "$body_file" | jq .)"

    if [[ "$http_code" == "200" ]]; then
      if grep -qE '<title>OpenClaw Control</title>|<openclaw-app' "$body_file"; then
        pass "TC-DEPLOY-01b: Tunnel serves OpenClaw dashboard (HTTP 200, marker matched)"
      else
        fail "TC-DEPLOY-01b" "HTTP 200 but body lacks dashboard markers (first 200B: $(head -c 200 "$body_file" | tr -d '\n'))"
      fi
    else
      fail "TC-DEPLOY-01b" "Tunnel URL returned unexpected status: $http_code"
    fi
    rm -f "$body_file"
  else
    skip "TC-DEPLOY-01b" "Tunnel URL not available"
  fi

  log "  Step 4: Running nemoclaw tunnel stop..."
  local stop_output stop_rc=0
  stop_output=$(nemoclaw tunnel stop 2>&1) || stop_rc=$?
  log "  Tunnel stop output:     ${stop_output//$'\n'/$'\n'    }"
  if [[ $stop_rc -ne 0 ]]; then
    fail "TC-DEPLOY-01c: Stop command" "nemoclaw tunnel stop failed (exit $stop_rc)"
    log "  Tunnel stop output: ${stop_output}"
    return
  fi

  # ── TC-DEPLOY-01c: Tunnel URL absent after stop ─────────────────────────────
  log "  Step 5: Verifying tunnel stopped (polling for URL removal)..."
  if [[ -z "$tunnel_url" ]]; then
    skip "TC-DEPLOY-01c" "Tunnel URL was never confirmed in status"
  else
    local post_status post_url status_rc=0 status_ok=0
    for i in $(seq 1 10); do
      status_rc=0
      post_status=$(nemoclaw status 2>&1) || status_rc=$?
      if [[ $status_rc -ne 0 ]]; then
        log "  [$i] nemoclaw status failed (exit $status_rc), retrying in 1s..."
        sleep 1
        continue
      fi
      status_ok=1
      post_url=$(printf '%s\n' "$post_status" | grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" | head -1) || true
      [[ -z "$post_url" ]] && break
      sleep 1
    done
    if [[ $status_ok -eq 0 ]]; then
      fail "TC-DEPLOY-01c: Stop" "Could not read nemoclaw status after stop"
    elif [[ -z "$post_url" ]]; then
      pass "TC-DEPLOY-01c: Tunnel URL absent after stop"
    else
      fail "TC-DEPLOY-01c: Stop" "Tunnel URL still present after stop ($post_url)"
    fi
  fi
}

# =============================================================================
# TC-DEPLOY-02: uninstall --keep-openshell (DESTRUCTIVE — runs last)
# =============================================================================
test_uninstall_keep_openshell() {
  log "=== TC-DEPLOY-02: Uninstall --keep-openshell ==="

  if ! command -v openshell >/dev/null 2>&1; then
    skip "TC-DEPLOY-02" "openshell not installed"
    return
  fi

  local openshell_path
  openshell_path=$(command -v openshell)
  log "  openshell before uninstall: $openshell_path"

  log "  Step 1: Destroying sandbox before uninstall..."
  nemoclaw "$SANDBOX_NAME" destroy --yes 2>&1 | tee -a "$LOG_FILE" || true

  log "  Step 2: Running uninstall --keep-openshell --yes..."
  local uninstall_output
  if [[ -f "$REPO_ROOT/uninstall.sh" ]]; then
    uninstall_output=$(bash "$REPO_ROOT/uninstall.sh" --keep-openshell --yes 2>&1) || true
  else
    uninstall_output=$(nemoclaw uninstall --keep-openshell --yes 2>&1) || true
  fi
  hash -r 2>/dev/null || true
  log "  Uninstall output: ${uninstall_output:0:400}"

  log "  Step 3: Verifying openshell still present..."
  if command -v openshell >/dev/null 2>&1; then
    pass "TC-DEPLOY-02: openshell binary still in PATH after uninstall"
  else
    fail "TC-DEPLOY-02: openshell" "openshell not found after uninstall --keep-openshell"
  fi

  log "  Step 4: Verifying nemoclaw removed..."
  local nemoclaw_path
  nemoclaw_path=$(command -v nemoclaw 2>/dev/null || true)
  if [[ -z "$nemoclaw_path" || ! -e "$nemoclaw_path" ]]; then
    pass "TC-DEPLOY-02: nemoclaw removed after uninstall"
  elif [[ "$nemoclaw_path" == "$REPO_ROOT"* ]]; then
    pass "TC-DEPLOY-02: uninstall completed (nemoclaw in source tree is expected)"
  else
    fail "TC-DEPLOY-02: nemoclaw" "nemoclaw still found at $nemoclaw_path"
  fi
}

# Clean up sandbox and services on exit.
teardown() {
  # Do not unlink ~/.nemoclaw/onboard.lock: see rationale in
  # test/e2e/lib/sandbox-teardown.sh — the lock is PID-ownership-aware
  # and onboard cleans up stale locks itself.
  set +e
  nemoclaw stop 2>/dev/null || true
  nemoclaw "$SANDBOX_NAME" destroy --yes 2>/dev/null || true
  set -e
}

# Print final PASS/FAIL/SKIP counts and exit.
summary() {
  echo ""
  echo "============================================================"
  echo "  Tunnel & Uninstall E2E Results"
  echo "============================================================"
  echo -e "  ${GREEN}PASS: $PASS${NC}"
  echo -e "  ${RED}FAIL: $FAIL${NC}"
  echo -e "  ${YELLOW}SKIP: $SKIP${NC}"
  echo "  TOTAL: $TOTAL"
  echo "============================================================"
  echo "  Log: $LOG_FILE"
  echo "============================================================"
  echo ""

  if [[ $FAIL -gt 0 ]]; then
    exit 1
  fi
  exit 0
}

# Entry point: preflight → onboard → tests → summary.
main() {
  echo ""
  echo "============================================================"
  echo "  NemoClaw Tunnel & Uninstall E2E Tests"
  echo "  $(date)"
  echo "============================================================"
  echo ""

  preflight

  log "=== Onboarding sandbox ==="
  if ! onboard_sandbox "$SANDBOX_NAME"; then
    log "FATAL: Could not onboard sandbox"
    exit 1
  fi

  test_tunnel_lifecycle

  # TC-DEPLOY-02 is destructive — always runs last
  if [[ "${SKIP_UNINSTALL:-}" == "1" ]]; then
    skip "TC-DEPLOY-02" "SKIP_UNINSTALL=1 set"
  else
    test_uninstall_keep_openshell
  fi

  teardown
  trap - EXIT
  summary
}

trap teardown EXIT
main "$@"
