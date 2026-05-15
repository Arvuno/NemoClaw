#!/bin/bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

# Containerized regression runner for issue #3396.
#
# Runs the existing full NVIDIA Endpoints E2E from an isolated copy of this
# checkout inside an Ubuntu 22.04 CUDA container so the OpenShell gateway process
# is launched from a glibc 2.35 userspace, even when the host OS is newer. The
# host still provides Docker and GPU access through the mounted Docker socket and
# `--gpus all`.
#
# Required:
#   NVIDIA_API_KEY=nvapi-... bash test/e2e/runtime/run-issue-3396-jammy-container.sh
#
# Optional overrides:
#   NEMOCLAW_3396_IMAGE          Container image (default: nvidia/cuda:12.4.1-base-ubuntu22.04)
#   NEMOCLAW_3396_HOME           Host temp HOME to mount into the container
#   NEMOCLAW_3396_KEEP_HOME=1    Preserve the generated temp HOME for diagnostics
#   NEMOCLAW_GATEWAY_PORT        Gateway port to use (default: 18080)
#   NEMOCLAW_SANDBOX_NAME        Sandbox name to use (default: issue-3396-jammy)

set -euo pipefail

info() { printf '\033[1;34m[issue-3396]\033[0m %s\n' "$*"; }
fail() {
  printf '\033[1;31m[issue-3396] ERROR:\033[0m %s\n' "$*" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ -z "${NVIDIA_API_KEY:-}" ]; then
  fail "NVIDIA_API_KEY must be set to a real nvapi- key for the NVIDIA Endpoints E2E"
fi

if ! command -v docker >/dev/null 2>&1; then
  fail "docker CLI is required"
fi

if ! docker info >/dev/null 2>&1; then
  fail "docker daemon is not reachable"
fi

if [ ! -S /var/run/docker.sock ]; then
  fail "/var/run/docker.sock must exist so the Jammy container can drive host Docker"
fi

IMAGE="${NEMOCLAW_3396_IMAGE:-nvidia/cuda:12.4.1-base-ubuntu22.04}"
CONTAINER_NAME="${NEMOCLAW_3396_CONTAINER_NAME:-nemoclaw-issue-3396-jammy}"
HOME_WAS_PROVIDED=0
if [ -n "${NEMOCLAW_3396_HOME:-}" ]; then
  TEST_HOME="$NEMOCLAW_3396_HOME"
  HOME_WAS_PROVIDED=1
  mkdir -p "$TEST_HOME"
else
  TEST_HOME="$(mktemp -d "${TMPDIR:-/tmp}/nemoclaw-3396-jammy-home.XXXXXX")"
fi

cleanup() {
  if [ "$HOME_WAS_PROVIDED" -eq 0 ] && [ "${NEMOCLAW_3396_KEEP_HOME:-0}" != "1" ]; then
    rm -rf "$TEST_HOME"
  else
    info "Preserving Jammy test HOME at $TEST_HOME"
  fi
}
trap cleanup EXIT

export NEMOCLAW_NON_INTERACTIVE=1
export NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE=1
export NEMOCLAW_FRESH="${NEMOCLAW_FRESH:-1}"
export NEMOCLAW_RECREATE_SANDBOX="${NEMOCLAW_RECREATE_SANDBOX:-1}"
export NEMOCLAW_PROVIDER="${NEMOCLAW_PROVIDER:-build}"
export NEMOCLAW_MODEL="${NEMOCLAW_MODEL:-nvidia/nemotron-3-super-120b-a12b}"
export NEMOCLAW_GATEWAY_PORT="${NEMOCLAW_GATEWAY_PORT:-18080}"
export NEMOCLAW_SANDBOX_NAME="${NEMOCLAW_SANDBOX_NAME:-issue-3396-jammy}"

info "Repo: $REPO_ROOT"
info "Image: $IMAGE"
info "Temp HOME: $TEST_HOME"
info "Gateway port: $NEMOCLAW_GATEWAY_PORT"
info "Sandbox: $NEMOCLAW_SANDBOX_NAME"

# Remove a stale container from an interrupted previous run.
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker run --rm \
  --name "$CONTAINER_NAME" \
  --gpus all \
  --network host \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "$REPO_ROOT:/mnt/nemoclaw-src:ro" \
  --volume "$TEST_HOME:$TEST_HOME" \
  --workdir "$TEST_HOME" \
  --env "HOME=$TEST_HOME" \
  --env NVIDIA_API_KEY \
  --env NEMOCLAW_NON_INTERACTIVE \
  --env NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE \
  --env NEMOCLAW_FRESH \
  --env NEMOCLAW_RECREATE_SANDBOX \
  --env NEMOCLAW_PROVIDER \
  --env NEMOCLAW_MODEL \
  --env NEMOCLAW_GATEWAY_PORT \
  --env NEMOCLAW_SANDBOX_NAME \
  --env NEMOCLAW_E2E_KEEP_SANDBOX \
  "$IMAGE" \
  bash -s <<'JAMMY_E2E'
set -euo pipefail

inner_info() { printf '\033[1;34m[jammy-glibc]\033[0m %s\n' "$*"; }
inner_fail() {
  printf '\033[1;31m[jammy-glibc] ERROR:\033[0m %s\n' "$*" >&2
  exit 1
}

export DEBIAN_FRONTEND=noninteractive
inner_info "Installing Jammy container prerequisites..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl docker.io git jq python3 rsync sudo xz-utils >/dev/null

inner_info "OS release"
cat /etc/os-release
# shellcheck source=/dev/null
. /etc/os-release
if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "22.04" ]; then
  inner_fail "expected Ubuntu 22.04 userspace, got ID=${ID:-unknown} VERSION_ID=${VERSION_ID:-unknown}"
fi

GLIBC_LINE="$(ldd --version | head -1)"
inner_info "glibc: $GLIBC_LINE"
if ! grep -q "2\.35" <<<"$GLIBC_LINE"; then
  inner_fail "expected glibc 2.35 userspace, got: $GLIBC_LINE"
fi

inner_info "Verifying GPU visibility from Jammy container..."
nvidia-smi

inner_info "Verifying mounted host Docker socket..."
docker version

docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi

WORKTREE="$HOME/NemoClaw"
inner_info "Copying repository into isolated worktree: $WORKTREE"
mkdir -p "$WORKTREE"
rsync -a --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude nemoclaw/node_modules \
  --exclude dist \
  /mnt/nemoclaw-src/ "$WORKTREE/"
cd "$WORKTREE"

INNER_E2E_EXIT=0
inner_info "Running full NVIDIA Endpoints E2E inside Jammy/glibc 2.35 userspace..."
bash test/e2e/test-full-e2e.sh || INNER_E2E_EXIT=$?

SEARCH_PATHS=(/tmp/nemoclaw-e2e-install.log "$HOME/.local/state/nemoclaw" "$HOME/.nemoclaw")
inner_info "Checking issue #3396 regression signatures..."

if ! grep -R -F "OpenShell gateway compatibility patch active" "${SEARCH_PATHS[@]}" >/dev/null 2>&1; then
  inner_fail "expected OpenShell gateway compatibility patch log was not found"
fi

if grep -R -F "Connection refused (os error 111)" "${SEARCH_PATHS[@]}" >/dev/null 2>&1; then
  inner_fail "unexpected issue #3396 Connection refused signature found"
fi

if grep -R -E "GLIBC_2\.3[89].*not found" "${SEARCH_PATHS[@]}" >/dev/null 2>&1; then
  inner_fail "unexpected OpenShell gateway GLIBC loader failure found"
fi

if [ "$INNER_E2E_EXIT" -ne 0 ]; then
  inner_fail "full E2E failed with exit $INNER_E2E_EXIT"
fi

inner_info "Issue #3396 Jammy/glibc container validation passed"
JAMMY_E2E
