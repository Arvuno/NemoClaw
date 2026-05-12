#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Policy-preset assertion.
#
# Verifies that the active gateway policy set matches the caller's declared
# presets. Shells out to `nemoclaw policies list` and compares against the
# expected preset ids (order-independent).
#
# Usage:
#   e2e_assert_policy_preset_applied <preset-id>...

_E2E_POL_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../runtime/lib" && pwd)"
# shellcheck source=../../runtime/lib/env.sh
. "${_E2E_POL_LIB_DIR}/env.sh"

e2e_assert_policy_preset_applied() {
  if [[ $# -eq 0 ]]; then
    echo "FAIL: e2e_assert_policy_preset_applied: no preset ids given" >&2
    return 2
  fi
  local expected=("$@")
  e2e_env_trace "assert:policy-preset-applied" "${expected[*]}"

  if ! command -v nemoclaw >/dev/null 2>&1; then
    echo "FAIL: nemoclaw CLI not on PATH" >&2
    return 1
  fi
  local active
  if ! active="$(nemoclaw policies list 2>/dev/null)"; then
    echo "FAIL: 'nemoclaw policies list' failed" >&2
    return 1
  fi
  local missing=()
  local p
  for p in "${expected[@]}"; do
    # Match lines that start with the literal preset id (possibly followed by
    # whitespace / a description / a marker column). Use awk string matching
    # instead of grep -E so regex metacharacters in preset ids stay literal.
    if ! printf '%s\n' "${active}" | awk -v preset="${p}" '
      index($0, preset) == 1 {
        nextChar = substr($0, length(preset) + 1, 1)
        if (nextChar == "" || nextChar ~ /[[:space:]]/) found = 1
      }
      END { exit found ? 0 : 1 }
    '; then
      missing+=("${p}")
    fi
  done
  if ((${#missing[@]} > 0)); then
    echo "FAIL: policy presets not applied: ${missing[*]}" >&2
    echo "  active:" >&2
    printf '%s\n' "${active}" | sed 's/^/    /' >&2
    return 1
  fi
  return 0
}
