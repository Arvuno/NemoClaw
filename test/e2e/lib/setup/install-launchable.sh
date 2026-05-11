#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Install via a Brev launchable (launchable profile).
#
# This profile assumes the launchable has already provisioned the runner.
# We verify the nemoclaw binary is present and refresh PATH; no download
# step is performed. Full launchable orchestration lives in the Brev
# workflow, not in the E2E helper.

_E2E_INST_LNCH_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../env.sh
. "${_E2E_INST_LNCH_LIB_DIR}/env.sh"
# shellcheck source=../install-path-refresh.sh
. "${_E2E_INST_LNCH_LIB_DIR}/install-path-refresh.sh"

e2e_install_launchable() {
  e2e_env_trace "install-launchable"
  if e2e_env_is_dry_run; then
    echo "[dry-run] install-launchable (skipped)"
    return 0
  fi
  nemoclaw_refresh_install_env
  if ! command -v nemoclaw >/dev/null 2>&1; then
    echo "e2e_install_launchable: nemoclaw not on PATH after launchable boot" >&2
    return 1
  fi
}
