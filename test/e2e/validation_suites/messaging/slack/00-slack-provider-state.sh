#!/usr/bin/env bash
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/messaging_providers.sh"
e2e_messaging_load_context
provider="$(e2e_messaging_provider_name)"
e2e_pass "expected-state.messaging.slack.provider-state ${provider} provider state configured"
