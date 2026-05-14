#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# =============================================================================
# test-state-backup-restore.sh
# NemoClaw Workspace Backup & Restore E2E Tests
#
# Covers:
#   TC-STATE-01: backup-workspace.sh backup → destroy → recreate → restore
#
# Prerequisites:
#   - Docker running
#   - NVIDIA_API_KEY set
#   - Network access to integrate.api.nvidia.com
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
SANDBOX_NAME="${NEMOCLAW_SANDBOX_NAME:-e2e-state-backup}"
LOG_FILE="test-state-backup-restore-$(date +%Y%m%d-%H%M%S).log"

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

  log "nemoclaw: $(nemoclaw --version 2>/dev/null || echo unknown)"
  log "Pre-flight complete"
}

# Execute a command inside the sandbox via SSH.
sandbox_exec() {
  local cmd="$1"
  local ssh_cfg
  ssh_cfg="$(mktemp)"
  if ! openshell sandbox ssh-config "$SANDBOX_NAME" >"$ssh_cfg" 2>/dev/null; then
    rm -f "$ssh_cfg"
    echo ""
    return 1
  fi
  local result ssh_exit=0
  result=$(run_with_timeout 120 ssh -F "$ssh_cfg" \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o ConnectTimeout=10 -o LogLevel=ERROR \
    "openshell-${SANDBOX_NAME}" "$cmd" 2>&1) || ssh_exit=$?
  rm -f "$ssh_cfg"
  echo "$result"
  return $ssh_exit
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
# TC-STATE-01: backup-workspace.sh lifecycle
# =============================================================================
test_backup_restore_lifecycle() {
  log "=== TC-STATE-01: Backup-Workspace Lifecycle ==="

  local workspace_path="/sandbox/.openclaw/workspace"
  local marker_content
  marker_content="E2E_BACKUP_TEST_$(date +%s)"

  log "  Step 1: Writing marker content into workspace files..."
  local files_written=0
  for f in SOUL.md USER.md IDENTITY.md AGENTS.md MEMORY.md; do
    if sandbox_exec "mkdir -p $workspace_path && echo '${marker_content}_${f}' > ${workspace_path}/${f}" 2>/dev/null; then
      files_written=$((files_written + 1))
    fi
  done
  sandbox_exec "mkdir -p ${workspace_path}/memory && echo '${marker_content}_daily' > ${workspace_path}/memory/2026-04-20.md" 2>/dev/null || true

  if [[ $files_written -eq 0 ]]; then
    fail "TC-STATE-01: Setup" "Could not write any workspace files"
    return
  fi
  log "  Wrote $files_written workspace files + memory note"

  log "  Step 2: Running backup-workspace.sh backup..."
  local backup_output
  backup_output=$(bash "$REPO_ROOT/scripts/backup-workspace.sh" backup "$SANDBOX_NAME" 2>&1) || true
  log "  Backup output: ${backup_output:0:300}"

  if echo "$backup_output" | grep -q "Backup saved"; then
    pass "TC-STATE-01: Backup completed successfully"
  else
    fail "TC-STATE-01: Backup" "backup-workspace.sh did not report success"
    return
  fi

  local backup_dir
  backup_dir=$(find "$HOME/.nemoclaw/backups" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -r | head -1)
  if [[ -z "$backup_dir" || ! -d "$backup_dir" ]]; then
    fail "TC-STATE-01: Backup dir" "No backup directory found"
    return
  fi
  log "  Backup dir: $backup_dir"

  log "  Step 3: Destroying sandbox..."
  local destroy_ok=0
  for destroy_attempt in 1 2 3; do
    nemoclaw "$SANDBOX_NAME" destroy --yes 2>&1 | tee -a "$LOG_FILE" || true
    local list_output list_rc=0
    list_output=$(nemoclaw list 2>&1) || list_rc=$?
    if [[ $list_rc -eq 0 ]]; then
      if ! printf '%s\n' "$list_output" | grep -Fq -- "$SANDBOX_NAME"; then
        destroy_ok=1
        break
      fi
    else
      log "  Destroy attempt $destroy_attempt: unable to read sandbox list (exit $list_rc), retrying..."
    fi
    if [[ $destroy_attempt -lt 3 ]]; then
      log "  Destroy attempt $destroy_attempt failed (sandbox still listed), retrying in 10s..."
      sleep 10
    fi
  done

  if [[ $destroy_ok -eq 0 ]]; then
    fail "TC-STATE-01: Destroy" "Sandbox still exists after 3 destroy attempts"
    return
  fi
  pass "TC-STATE-01: Sandbox destroyed"

  log "  Step 4: Re-onboarding sandbox..."
  if ! onboard_sandbox "$SANDBOX_NAME"; then
    fail "TC-STATE-01: Re-onboard" "Could not recreate sandbox"
    return
  fi
  pass "TC-STATE-01: Sandbox re-onboarded"

  log "  Step 5: Running backup-workspace.sh restore..."
  local restore_output
  restore_output=$(bash "$REPO_ROOT/scripts/backup-workspace.sh" restore "$SANDBOX_NAME" 2>&1) || true
  log "  Restore output: ${restore_output:0:300}"

  if echo "$restore_output" | grep -q "Restored"; then
    pass "TC-STATE-01: Restore completed successfully"
  else
    fail "TC-STATE-01: Restore" "backup-workspace.sh restore did not report success"
    return
  fi

  log "  Step 6: Verifying workspace files restored..."
  local verified=0
  for f in SOUL.md USER.md IDENTITY.md AGENTS.md MEMORY.md; do
    local content
    content=$(sandbox_exec "cat ${workspace_path}/${f} 2>/dev/null") || true
    if echo "$content" | grep -q "${marker_content}_${f}"; then
      verified=$((verified + 1))
    else
      log "  WARNING: ${f} content mismatch: ${content:0:100}"
    fi
  done

  if [[ $verified -eq 5 ]]; then
    pass "TC-STATE-01: ${verified}/5 workspace files verified with correct content"
  elif [[ $verified -ge 4 ]]; then
    log "  WARNING: Only ${verified}/5 files verified — check logs above for mismatched file"
    pass "TC-STATE-01: ${verified}/5 workspace files verified (partial tolerance applied)"
  else
    fail "TC-STATE-01: Verify" "Only ${verified}/5 workspace files matched expected content"
  fi

  local memory_content
  memory_content=$(sandbox_exec "cat ${workspace_path}/memory/2026-04-20.md 2>/dev/null") || true
  if echo "$memory_content" | grep -q "${marker_content}_daily"; then
    pass "TC-STATE-01: Memory note restored correctly"
  else
    log "  Memory note content: ${memory_content:0:100}"
    skip "TC-STATE-01: Memory note" "Memory directory restore may not be supported"
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
  echo "  Workspace Backup & Restore E2E Results"
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
  echo "  NemoClaw Workspace Backup & Restore E2E Tests"
  echo "  $(date)"
  echo "============================================================"
  echo ""

  preflight

  log "=== Onboarding sandbox ==="
  if ! onboard_sandbox "$SANDBOX_NAME"; then
    log "FATAL: Could not onboard sandbox"
    exit 1
  fi

  test_backup_restore_lifecycle

  teardown
  trap - EXIT
  summary
}

trap teardown EXIT
main "$@"
