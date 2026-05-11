<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# E2E Migration Tracker

This PR migrates all existing `test/e2e/test-*.sh` scripts into the
scenario-based runner introduced by PR #3290. Full deep migration
(Strategy B). Legacy scripts remain in the repo during this PR and run
in parallel for 1–2 nightly cycles after merge; a follow-up PR retires
them once parity is verified.

**Merge gate:** All 40 legacy entry points must have a scenario-based
equivalent that produces the same PASS/FAIL outcomes as the legacy
script in a side-by-side CI run.

## Status summary

| Bucket | Legacy LOC | Status |
|---|---:|---|
| Wave 0 — shared fixtures, asserts, setup split | — | ⬜ not started |
| Wave 1 — onboarding baseline | 1,101 | ⬜ |
| Wave 2 — onboarding lifecycle | 2,013 | ⬜ |
| Wave 3 — sandbox lifecycle | 2,891 | ⬜ |
| Wave 4 — rebuild / upgrade | 1,292 | ⬜ |
| Wave 5 — inference variants | 2,593 | ⬜ |
| Wave 6 — Hermes | 1,646 | ⬜ |
| Wave 7 — messaging | 3,397 | ⬜ |
| Wave 8 — security / policy | 2,241 | ⬜ |
| Wave 9 — runtime / platform services | 1,696 | ⬜ |
| Wave 10 — platform + remote | 1,589 | ⬜ |
| Wave 11 — misc | 405 | ⬜ |
| **Total** | **20,864** | **0 / 40 scripts migrated** |

## Per-script tracker

Legend: ⬜ not started · 🟨 in progress · ✅ migrated · 🔵 parity verified

### Wave 1 — onboarding baseline

- ⬜ `test-full-e2e.sh` (473) → `onboarding/happy-path/` + scenario `ubuntu-curl-cloud-openclaw`
- ⬜ `test-cloud-onboard-e2e.sh` (337) → `onboarding/public-installer/`
- ⬜ `test-cloud-inference-e2e.sh` (291) → extends `inference/cloud/`

### Wave 2 — onboarding lifecycle

- ⬜ `test-double-onboard.sh` (717) → `onboarding/double-onboard/`
- ⬜ `test-gpu-double-onboard.sh` (571) → `onboarding/double-onboard/` on GPU scenario
- ⬜ `test-onboard-repair.sh` (372) → `onboarding/repair/`
- ⬜ `test-onboard-resume.sh` (353) → `onboarding/resume/`

### Wave 3 — sandbox lifecycle

- ⬜ `test-sandbox-operations.sh` (828) → `sandbox/operations/`
- ⬜ `test-sandbox-survival.sh` (721) → `sandbox/survival/`
- ⬜ `test-snapshot-commands.sh` (281) → `sandbox/snapshot/`
- ⬜ `test-diagnostics.sh` (452) → `sandbox/diagnostics/`
- ⬜ `test-issue-2478-crash-loop-recovery.sh` (609) → `sandbox/crash-loop-recovery/`

### Wave 4 — rebuild / upgrade

- ⬜ `test-rebuild-openclaw.sh` (453) → `sandbox/rebuild-openclaw/` (uses `lib/fixtures/older-base-image.sh`)
- ⬜ `test-rebuild-hermes.sh` (401) → `sandbox/rebuild-hermes/`
- ⬜ `test-upgrade-stale-sandbox.sh` (241) → `sandbox/upgrade-stale/`
- ⬜ `test-sandbox-rebuild.sh` (197) → folded into `sandbox/rebuild-openclaw/`

### Wave 5 — inference variants

- ⬜ `test-gpu-e2e.sh` (565) → `inference/ollama-gpu/` (deep port)
- ⬜ `test-ollama-auth-proxy-e2e.sh` (548) → `inference/ollama-auth-proxy/` (deep port)
- ⬜ `test-inference-routing.sh` (715) → `inference/routing-errors/`
- ⬜ `test-kimi-inference-compat.sh` (765) → `inference/kimi-compat/`

### Wave 6 — Hermes

- ⬜ `test-hermes-e2e.sh` (591) → `onboarding/hermes/` (deep port; currently 1-step health)
- ⬜ `test-hermes-slack-e2e.sh` (537) → `messaging/slack/hermes/`
- ⬜ `test-hermes-discord-e2e.sh` (518) → `messaging/discord/hermes/`

### Wave 7 — messaging

- ⬜ `test-messaging-providers.sh` (1,677) → `messaging/providers/{telegram,discord,slack}/`
- ⬜ `test-token-rotation.sh` (575) → `messaging/token-rotation/`
- ⬜ `test-telegram-injection.sh` (475) → `security/telegram-injection/`
- ⬜ `test-messaging-compatible-endpoint.sh` (670) → `messaging/compatible-endpoint/`

### Wave 8 — security / policy

- ⬜ `test-shields-config.sh` (550) → `security/shields/`
- ⬜ `test-network-policy.sh` (579) → `security/network-policy/`
- ⬜ `test-credential-sanitization.sh` (810) → `security/credentials/sanitization/`
- ⬜ `test-credential-migration.sh` (302) → `security/credentials/migration/`

### Wave 9 — runtime / platform services

- ⬜ `test-runtime-overrides.sh` (272) → `sandbox/runtime-overrides/`
- ⬜ `test-overlayfs-autofix.sh` (537) → `sandbox/overlayfs-autofix/`
- ⬜ `test-device-auth-health.sh` (373) → `lifecycle/device-auth-health/`
- ⬜ `test-deployment-services.sh` (514) → `lifecycle/deployment-services/`

### Wave 10 — platform + remote

- ⬜ `test-spark-install.sh` (157) → `platform/spark/`
- ⬜ `test-launchable-smoke.sh` (589) → `platform/launchable/`
- ⬜ `brev-e2e.test.ts` (843) → `platform/brev-remote/`

### Wave 11 — misc

- ⬜ `test-skill-agent-e2e.sh` (244) → `onboarding/skill-agent/`
- ⬜ `test-docs-validation.sh` (161) → `lifecycle/docs-validation/`

## Parallel verification

Before merge, `.github/workflows/e2e-parity-compare.yaml` (Wave 0.F.1)
will run each migrated scenario next to its legacy counterpart and diff
PASS/FAIL per assertion via `test/e2e/parity-map.yaml` +
`scripts/e2e/compare-parity.sh`.

Merge gate: **zero divergence**. Documented flaky assertions are
compared as "both-pass-or-both-fail" rather than strict equality.

Internal plan document (not committed): `specs/2026-05-08_e2e-setup-scenario-matrix/migration-plan.md`.
