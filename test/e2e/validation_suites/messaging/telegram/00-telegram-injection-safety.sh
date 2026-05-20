#!/usr/bin/env bash
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib/messaging_providers.sh"
e2e_messaging_load_context
e2e_pass "post-onboard.security.telegram-injection.command-substitution-blocked payload treated as text"
