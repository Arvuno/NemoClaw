#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Install dispatcher. Routes by install-method / profile id to one of four
# split helpers (install-repo.sh, install-curl.sh, install-ollama.sh,
# install-launchable.sh). Honors E2E_DRY_RUN.
#
# Accepts both legacy install-method names (repo-checkout,
# curl-install-script) and the new profile-centric names used by
# scenarios.yaml (repo-current, public-installer, ollama, launchable).

_E2E_INSTALL_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=../env.sh
. "${_E2E_INSTALL_LIB_DIR}/env.sh"
# shellcheck source=install-repo.sh
. "${_E2E_INSTALL_LIB_DIR}/setup/install-repo.sh"
# shellcheck source=install-curl.sh
. "${_E2E_INSTALL_LIB_DIR}/setup/install-curl.sh"
# shellcheck source=install-ollama.sh
. "${_E2E_INSTALL_LIB_DIR}/setup/install-ollama.sh"
# shellcheck source=install-launchable.sh
. "${_E2E_INSTALL_LIB_DIR}/setup/install-launchable.sh"

e2e_install() {
  local method="${1:-}"
  if [[ -z "${method}" ]]; then
    echo "e2e_install: missing install method" >&2
    return 2
  fi
  e2e_env_trace "install:${method}"
  case "${method}" in
    repo-checkout | repo-current)
      e2e_install_repo
      ;;
    curl-install-script | public-installer)
      e2e_install_curl
      ;;
    ollama)
      e2e_install_ollama
      ;;
    launchable)
      e2e_install_launchable
      ;;
    *)
      echo "e2e_install: unsupported install method: ${method}" >&2
      return 2
      ;;
  esac
}

# Legacy entrypoints kept for compatibility with callers that pre-dated
# the four-way split. They forward to the new helpers.
e2e_install_from_repo_checkout() { e2e_install_repo "$@"; }
e2e_install_from_public_curl()   { e2e_install_curl "$@"; }
