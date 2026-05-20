#!/usr/bin/env bash
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/messaging_providers.sh"
e2e_messaging_load_context
key="$(e2e_messaging_config_key)"
e2e_messaging_assert_placeholder_configured "token=\${${key}}" "${key}"
