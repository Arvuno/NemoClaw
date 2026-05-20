# Validation Plan: Messaging Provider Scenario Suite Migration

Generated from: `specs/2026-05-20_messaging-provider-scenario-migration/spec.md`
Test Spec: `specs/2026-05-20_messaging-provider-scenario-migration/tests.md`

## Overview

**Feature**: Migrate messaging-provider legacy E2E coverage into NemoClaw's layered scenario framework with stable assertion IDs, parity-map classification, and plan-only compatibility.

**Available Tools**: Vitest, Bash, `test/e2e/runtime/run-scenario.sh`, scenario framework tests, `gh` CLI.

**Completion Criteria**:
1. Validation is complete when the PR is opened and all added tests are passing.
2. Existing legacy E2E onboarding coverage has been re-reviewed and found to have 100% or greater parity in test coverage.

## Coverage Summary

- Happy Paths: 10 scenarios
- Sad Paths: 5 scenarios
- Total: 15 scenarios

---

## Phase 1: Messaging Primitive Library - Validation Scenarios

### Scenario 1.1: Helper library supports local fixture contexts [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Happy Path

**Given**: A synthetic `$E2E_CONTEXT_DIR/context.env` for each supported messaging provider and agent.
**When**: The new `messaging_providers.sh` helpers are sourced and invoked through scenario framework tests.
**Then**: Provider names, channel keys, config paths, placeholder checks, and no-secret-leak checks resolve without live infrastructure.

**Validation Steps**:
1. **Setup**: Bash/Vitest: Create temporary context fixtures for Telegram, Discord, Slack bot/app, WhatsApp QR-only, OpenClaw, and Hermes.
2. **Execute**: Vitest: Run the helper tests in `test/e2e/scenario-framework-tests/e2e-lib-helpers.test.ts`.
3. **Verify**: Vitest: Confirm all helper assertions pass and no Docker/OpenShell/provider token is required.

**Tools Required**: Vitest, Bash.

### Scenario 1.2: Missing context fails clearly [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Sad Path

**Given**: No `$E2E_CONTEXT_DIR/context.env` exists.
**When**: A context-dependent messaging helper is invoked.
**Then**: The command exits non-zero with a diagnostic naming the missing context requirement.

**Validation Steps**:
1. **Setup**: Bash: Unset `E2E_CONTEXT_DIR` or point it at an empty temporary directory.
2. **Execute**: Bash/Vitest: Invoke the context loader helper.
3. **Verify**: Vitest: Assert non-zero exit and a clear `E2E_CONTEXT_DIR`/`context.env` error.

**Tools Required**: Vitest, Bash.

## Phase 2: Provider Expected-State Suites - Validation Scenarios

### Scenario 2.1: Messaging provider suites replace generic smoke aliases [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Happy Path

**Given**: `messaging-telegram`, `messaging-discord`, and `messaging-slack` suites exist in `test/e2e/validation_suites/suites.yaml`.
**When**: Scenario framework schema, suite runner, and resolver tests inspect suite definitions.
**Then**: Each suite references messaging-domain validation scripts and emits stable messaging assertion IDs.

**Validation Steps**:
1. **Setup**: Bash: Ensure new messaging suite scripts are present under `test/e2e/validation_suites/messaging/`.
2. **Execute**: Vitest: Run suite/schema/resolver tests.
3. **Verify**: Vitest: Confirm no affected messaging suite aliases only generic smoke steps.

**Tools Required**: Vitest, Bash.

### Scenario 2.2: Affected provider scenarios remain plan-only compatible [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Happy Path

**Given**: The existing Telegram, Discord, and Slack messaging scenarios are wired to matching suite IDs.
**When**: `test/e2e/runtime/run-scenario.sh <id> --plan-only` is run for each affected scenario.
**Then**: Each command exits 0 and prints a valid plan without requiring live secrets.

**Validation Steps**:
1. **Setup**: Bash: List affected scenario IDs from the spec.
2. **Execute**: Bash: Run `run-scenario.sh <id> --plan-only` for each.
3. **Verify**: Bash/Vitest: Confirm exit 0 for every provider scenario.

**Tools Required**: Bash, scenario runner.

### Scenario 2.3: Live provider context absence is explicit [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Sad Path

**Given**: A messaging suite script is executed outside a prepared scenario context.
**When**: The script needs sandbox/provider state.
**Then**: It skips or fails with a clear missing-context message rather than rediscovering or onboarding state.

**Validation Steps**:
1. **Setup**: Bash: Execute representative suite script with no context.
2. **Execute**: Bash/Vitest: Capture output and exit status.
3. **Verify**: Vitest: Confirm behavior is explicit and no install/onboard/discovery command is invoked.

**Tools Required**: Vitest, Bash.

## Phase 3: Token Rotation and Channel Lifecycle Suites - Validation Scenarios

### Scenario 3.1: Token rotation suite detects provider-specific changes [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Happy Path

**Given**: Mock rotation signals for Telegram, Discord, and Slack.
**When**: Token rotation helper/tests evaluate a rotated provider.
**Then**: Only the rotated provider assertion is marked changed and unrelated providers show no cross-talk.

**Validation Steps**:
1. **Setup**: Vitest: Provide synthetic rotation metadata/log fixtures.
2. **Execute**: Vitest: Run token-rotation helper and suite-runner tests.
3. **Verify**: Vitest: Confirm provider-specific isolation assertions pass.

**Tools Required**: Vitest, Bash.

### Scenario 3.2: Unsupported lifecycle matrix coverage is deferred, not hidden [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Sad Path

**Given**: Legacy stop/start/remove lifecycle cases require orchestration not represented by current scenario setup.
**When**: `parity-map.yaml` is validated.
**Then**: Unsupported matrix cases are marked `deferred` with runner/context requirements and reason.

**Validation Steps**:
1. **Setup**: Bash: Inspect parity map lifecycle entries for `test-channels-stop-start.sh`.
2. **Execute**: Vitest: Run parity map tests.
3. **Verify**: Vitest: Confirm required metadata exists and no lifecycle assertion remains unclassified.

**Tools Required**: Vitest, Bash.

## Phase 4: Security and Compatible Endpoint Assertions - Validation Scenarios

### Scenario 4.1: Telegram injection payload classes are covered by stable assertions [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Happy Path

**Given**: Telegram injection payload classes for command substitution, backticks, variable expansion, and shell metacharacters.
**When**: Security/messaging suite tests inspect assertion definitions or local fixtures.
**Then**: High-risk payload classes have stable `post-onboard.security.telegram-injection.*` IDs where feasible.

**Validation Steps**:
1. **Setup**: Vitest/Bash: Load injection assertion fixtures or suite metadata.
2. **Execute**: Vitest: Run suite-runner/parity tests.
3. **Verify**: Vitest: Confirm stable assertion IDs and mapping coverage.

**Tools Required**: Vitest, Bash.

### Scenario 4.2: Compatible endpoint assertions are mapped or deferred [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Sad Path

**Given**: Legacy compatible-endpoint checks depend on custom endpoint fixtures and proxy behavior.
**When**: Parity map tests validate `test-messaging-compatible-endpoint.sh` entries.
**Then**: Each relevant assertion is either mapped to a stable ID or deferred with explicit runner/fixture requirements.

**Validation Steps**:
1. **Setup**: Bash: Inspect compatible-endpoint parity entries.
2. **Execute**: Vitest: Run parity map and coverage report tests.
3. **Verify**: Vitest: Confirm no compatible-endpoint assertion is omitted or ambiguously classified.

**Tools Required**: Vitest, Bash.

### Scenario 4.3: Brave search is not counted as messaging-provider coverage [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Sad Path

**Given**: Brave search legacy assertions are primarily web-search coverage.
**When**: The coverage report groups migrated/deferred/retired assertions.
**Then**: Brave-specific assertions use web-search domains or cross-references and do not inflate messaging-provider coverage.

**Validation Steps**:
1. **Setup**: Bash: Generate or inspect coverage report output.
2. **Execute**: Vitest: Run coverage report tests.
3. **Verify**: Vitest: Confirm Brave entries are classified outside messaging-provider coverage unless explicitly cross-referenced.

**Tools Required**: Vitest, Bash.

## Phase 5: Parity Map and Coverage Report Integration - Validation Scenarios

### Scenario 5.1: All issue #3810 legacy assertions are classified [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Happy Path

**Given**: The six legacy scripts named in the spec.
**When**: Legacy assertion inventory and parity map tests run.
**Then**: Every relevant assertion is `mapped`, `deferred`, or `retired` with required metadata.

**Validation Steps**:
1. **Setup**: Bash: Ensure `parity-map.yaml` includes entries for all six legacy scripts.
2. **Execute**: Vitest: Run legacy inventory, parity map, and coverage report tests.
3. **Verify**: Vitest: Confirm no relevant issue #3810 assertion is unclassified.

**Tools Required**: Vitest, Bash.

### Scenario 5.2: Parity report shows coverage status accurately [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Happy Path

**Given**: Updated parity metadata for mapped, deferred, and retired assertions.
**When**: The E2E coverage report is generated.
**Then**: Messaging provider coverage is visible by status and includes owner, layer, gap domain, and requirements metadata.

**Validation Steps**:
1. **Setup**: Bash: Run the existing coverage report command or its Vitest wrapper.
2. **Execute**: Vitest/Bash: Capture report output.
3. **Verify**: Vitest: Confirm status and metadata are present for messaging provider coverage.

**Tools Required**: Vitest, Bash.

### Scenario 5.3: Legacy onboarding coverage parity is re-reviewed [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Happy Path

**Given**: Existing legacy E2E onboarding coverage and the new scenario/parity-map coverage.
**When**: The maintainer reviews onboarding-related assertions after migration.
**Then**: The review finds 100% or greater parity in test coverage and records that result in PR validation notes.

**Validation Steps**:
1. **Setup**: Bash/manual review: Compare existing legacy onboarding E2E assertions to scenario/parity-map coverage.
2. **Execute**: Manual/PR checklist: Record parity result and any deferred non-onboarding gaps.
3. **Verify**: gh CLI/manual: Confirm PR notes state onboarding coverage parity is 100% or greater.

**Tools Required**: gh CLI, Bash, manual review.

## Phase 6: Scenario Framework Validation - Validation Scenarios

### Scenario 6.1: Local scenario framework tests pass [STATUS: passed] [VALIDATED: e577a930e]
**Type**: Happy Path

**Given**: All implementation phases are complete.
**When**: The relevant scenario framework test suite is run locally/CI.
**Then**: Helper, schema, resolver, suite runner, parity map, coverage report, and metadata hygiene tests pass.

**Validation Steps**:
1. **Setup**: Bash: Install dependencies if needed using project-standard npm commands.
2. **Execute**: Bash: Run the scenario framework test command used by the repo.
3. **Verify**: Bash/CI: Confirm exit 0.

**Tools Required**: Vitest, Bash.

### Scenario 6.2: PR is opened and all added tests pass [STATUS: pending]
**Type**: Happy Path

**Given**: Implementation is complete and local validation has passed or skips are documented.
**When**: A PR for issue #3810 is opened.
**Then**: All added tests pass in CI, and the PR validation notes include live-run status and missing runner/secret requirements for skipped live validation.

**Validation Steps**:
1. **Setup**: gh CLI: Push branch and open PR.
2. **Execute**: gh CLI: Monitor PR checks.
3. **Verify**: gh CLI: Confirm all added tests pass and validation notes are present.

**Tools Required**: gh CLI, CI, Bash.

## Summary

| Phase | Happy | Sad | Total | Passed | Failed | Pending |
|-------|-------|-----|-------|--------|--------|---------|
| Phase 1 | 1 | 1 | 2 | 2 | 0 | 0 |
| Phase 2 | 2 | 1 | 3 | 3 | 0 | 0 |
| Phase 3 | 1 | 1 | 2 | 2 | 0 | 0 |
| Phase 4 | 1 | 2 | 3 | 3 | 0 | 0 |
| Phase 5 | 3 | 0 | 3 | 3 | 0 | 0 |
| Phase 6 | 2 | 0 | 2 | 1 | 0 | 1 |
| **Total** | **10** | **5** | **15** | **14** | **0** | **1** |
