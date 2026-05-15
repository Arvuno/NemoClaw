# Validation Plan: New E2E Model

Generated from: `specs/2026-05-14_new-e2e-model/spec.md`
Test Spec: `specs/2026-05-14_new-e2e-model/tests.md`

## Overview

**Feature**: Layered E2E scenario model separating base environments, onboarding profiles, test plans, onboarding assertions, expected states, post-onboard suites, and layer-aware reporting.

**Available Tools**: Bash, npm/Vitest scenario framework tests, static workflow YAML checks, TypeScript resolver commands, GitHub Actions summary files when running in CI.

## Coverage Summary

- Happy Paths: 9 scenarios
- Sad Paths: 8 scenarios
- Total: 17 scenarios

---

## Phase 1: Layered Terminology and Schema Planning - Validation Scenarios

### Scenario 1.1: Legacy Scenario Resolves Through Layered Alias [STATUS: pending]
**Type**: Happy Path

**Given**: `scenarios.yaml` defines layered `base_scenarios`, `onboarding_profiles`, `test_plans`, and `ubuntu-repo-cloud-openclaw` as an alias.
**When**: A maintainer runs `bash test/e2e/runtime/run-scenario.sh ubuntu-repo-cloud-openclaw --plan-only`.
**Then**: The command succeeds and prints a plan containing separate base, onboarding, expected-state, onboarding assertion, and suite sections.

**Validation Steps**:
1. **Setup**: Bash: ensure dependencies are installed for scenario framework tests.
2. **Execute**: Bash: run the plan-only command for `ubuntu-repo-cloud-openclaw`.
3. **Verify**: Bash: assert exit code 0 and inspect plan JSON/text for layered sections.

**Tools Required**: Bash, TypeScript resolver runtime.

### Scenario 1.2: New Layered Plan ID Runs Plan-Only [STATUS: pending]
**Type**: Happy Path

**Given**: `ubuntu-repo-docker__cloud-nvidia-openclaw` is a defined test plan.
**When**: A maintainer runs `bash test/e2e/runtime/run-scenario.sh ubuntu-repo-docker__cloud-nvidia-openclaw --plan-only`.
**Then**: The command succeeds without performing live install/onboarding and emits the same executable plan shape as the legacy alias.

**Validation Steps**:
1. **Setup**: Bash: no live credentials or Docker setup required.
2. **Execute**: Bash: run the layered plan ID with `--plan-only`.
3. **Verify**: Bash: compare key base/onboarding/expected-state/suite fields against the legacy alias output.

**Tools Required**: Bash, TypeScript resolver runtime.

### Scenario 1.3: Missing Layer Reference Fails Fast [STATUS: pending]
**Type**: Sad Path

**Given**: A fixture plan references a missing base scenario, onboarding profile, expected state, assertion, or suite.
**When**: The resolver validates the fixture.
**Then**: Validation fails before execution with a clear message identifying the missing reference and parent plan.

**Validation Steps**:
1. **Setup**: Bash/Vitest: create or load invalid fixture YAML.
2. **Execute**: npm/Vitest: run scenario resolver validation tests.
3. **Verify**: npm/Vitest: assert non-zero validation and exact actionable error text.

**Tools Required**: npm, Vitest.

## Phase 2: Layered Coverage and Gap Reports - Validation Scenarios

### Scenario 2.1: Coverage Report Shows Layered Tables [STATUS: pending]
**Type**: Happy Path

**Given**: Layered scenarios and parity metadata are present.
**When**: A maintainer runs `bash test/e2e/runtime/coverage-report.sh`.
**Then**: Output includes base scenario coverage, onboarding profile coverage, test plan coverage, suite coverage, parity by layer, and top deferred gap domains.

**Validation Steps**:
1. **Setup**: Bash: ensure parity map and scenarios YAML are available.
2. **Execute**: Bash: run coverage report.
3. **Verify**: Bash: grep for expected section headings and layer names.

**Tools Required**: Bash.

### Scenario 2.2: Unknown Parity Layer Is Rejected [STATUS: pending]
**Type**: Sad Path

**Given**: A parity entry has a `layer` value outside the allowed set.
**When**: Parity map validation runs.
**Then**: Validation fails and lists allowed layer values.

**Validation Steps**:
1. **Setup**: Vitest: load invalid parity fixture.
2. **Execute**: npm/Vitest: run parity map validation test.
3. **Verify**: Vitest: assert failure includes the invalid value and allowed layers.

**Tools Required**: npm, Vitest.

## Phase 3: Onboarding Assertion Stage - Validation Scenarios

### Scenario 3.1: Onboarding Assertions Run Before Expected-State Validation [STATUS: pending]
**Type**: Happy Path

**Given**: A plan includes onboarding assertion scripts and expected-state validation.
**When**: The runner executes the plan with fake or fixture scripts.
**Then**: Logs show onboarding assertions run after onboarding and before expected-state validation and post-onboard suites.

**Validation Steps**:
1. **Setup**: Bash/Vitest: create fake assertion, expected-state, and suite commands that log timestamps/order.
2. **Execute**: npm/Vitest or Bash: run the scenario runner in fixture mode.
3. **Verify**: Bash/Vitest: assert order is onboarding, onboarding assertions, expected state, suites.

**Tools Required**: Bash, npm, Vitest.

### Scenario 3.2: Failed Onboarding Assertion Stops Later Layers [STATUS: pending]
**Type**: Sad Path

**Given**: An onboarding assertion exits non-zero.
**When**: The runner executes the plan.
**Then**: Expected-state validation and suites do not run, and the report identifies `onboarding-assertions` as the failing layer.

**Validation Steps**:
1. **Setup**: Bash/Vitest: configure one assertion script to fail.
2. **Execute**: npm/Vitest or Bash: run fixture scenario.
3. **Verify**: Bash/Vitest: assert exit code non-zero, no later-layer markers, and failure layer recorded.

**Tools Required**: Bash, npm, Vitest.

### Scenario 3.3: Negative Preflight Leaves No Ghost State [STATUS: pending]
**Type**: Sad Path

**Given**: A negative base scenario such as `ubuntu-repo-no-docker` is expected to fail preflight.
**When**: The runner validates the negative plan in fixture or controlled no-Docker mode.
**Then**: The onboarding assertion stage verifies no gateway or sandbox ghost state remains.

**Validation Steps**:
1. **Setup**: Bash: use fixture state directories or controlled no-Docker preflight environment.
2. **Execute**: Bash: run the negative plan or its fixture equivalent.
3. **Verify**: Bash: assert absent gateway/sandbox markers and expected failure classification.

**Tools Required**: Bash.

## Phase 4: Onboarding Matrix Expansion - Validation Scenarios

### Scenario 4.1: Representative Onboarding Profiles Are Valid and Reported [STATUS: pending]
**Type**: Happy Path

**Given**: Profiles exist for OpenAI-compatible, Brave, Telegram, Discord, Slack, Hermes messaging, resume, repair, double-onboard, provider switch, and token rotation.
**When**: Scenario schema validation and coverage reporting run.
**Then**: Profiles validate and coverage reports them independently from base environments.

**Validation Steps**:
1. **Setup**: Bash: ensure scenario YAML includes representative profiles.
2. **Execute**: npm/Vitest: run scenario schema and coverage tests.
3. **Verify**: Vitest: assert profiles are valid and coverage output includes onboarding profile counts.

**Tools Required**: npm, Vitest.

### Scenario 4.2: Incompatible Base/Profile Combination Is Blocked [STATUS: pending]
**Type**: Sad Path

**Given**: A test plan combines an onboarding profile requiring unavailable runner capabilities or secrets with an incompatible base.
**When**: The resolver validates the plan.
**Then**: It fails at plan time with a compatibility error and does not start execution.

**Validation Steps**:
1. **Setup**: Vitest: load incompatible plan fixture.
2. **Execute**: npm/Vitest: run resolver compatibility validation.
3. **Verify**: Vitest: assert error identifies required and missing capability/secret.

**Tools Required**: npm, Vitest.

## Phase 5: Post-Onboard Suite Reorganization - Validation Scenarios

### Scenario 5.1: New Suite Families Resolve While Old Aliases Still Work [STATUS: pending]
**Type**: Happy Path

**Given**: Suite families and transitional aliases are defined.
**When**: The resolver loads plans using both new family IDs and existing suite IDs.
**Then**: Both resolve to runnable suite definitions without changing install or onboarding behavior.

**Validation Steps**:
1. **Setup**: Vitest: load suite YAML with new families and aliases.
2. **Execute**: npm/Vitest: run suite resolver tests.
3. **Verify**: Vitest: assert scripts/requires_state resolve and aliases point to intended suite definitions.

**Tools Required**: npm, Vitest.

### Scenario 5.2: Feature Suite Boundary Is Enforced [STATUS: pending]
**Type**: Sad Path

**Given**: A suite definition attempts to install, onboard, or mutate onboarding choices.
**When**: Convention lint or suite schema validation runs.
**Then**: Validation fails because post-onboard suites may only consume context and validate features.

**Validation Steps**:
1. **Setup**: Vitest: create suite fixture with disallowed behavior or metadata.
2. **Execute**: npm/Vitest: run convention lint tests.
3. **Verify**: Vitest: assert lint failure names the suite and boundary violation.

**Tools Required**: npm, Vitest.

## Phase 6: Workflow and Report Visibility - Validation Scenarios

### Scenario 6.1: GitHub Actions Scenario Summary Is Visible [STATUS: pending]
**Type**: Happy Path

**Given**: Scenario workflow runs a layered plan.
**When**: The workflow completes or fails.
**Then**: `$GITHUB_STEP_SUMMARY` contains selected base scenario, onboarding profile, expected state, onboarding assertion results, suite results, and artifact references where available.

**Validation Steps**:
1. **Setup**: Static workflow test or local run with `GITHUB_STEP_SUMMARY` pointing to a temp file.
2. **Execute**: npm/Vitest or Bash: run workflow-summary/render-summary path.
3. **Verify**: Bash/Vitest: assert summary markdown contains required sections.

**Tools Required**: Bash, npm, Vitest.

### Scenario 6.2: Gap Reports Are Generated in JSON and Markdown [STATUS: pending]
**Type**: Happy Path

**Given**: Parity metadata includes layer and gap domain information.
**When**: Gap reporting runs.
**Then**: `.e2e/reports/gap-report.json` and `.e2e/reports/gap-report.md` are generated with mapped/deferred/retired counts and top deferred layers/domains.

**Validation Steps**:
1. **Setup**: Bash: use representative parity map fixture.
2. **Execute**: Bash or npm: run gap report generation.
3. **Verify**: Bash: assert both files exist and include expected counts/domains.

**Tools Required**: Bash, npm.

### Scenario 6.3: Failed Run Preserves Failing Layer [STATUS: pending]
**Type**: Sad Path

**Given**: Fixture runs fail in base, onboarding, expected-state, and suite stages.
**When**: Reports are generated for each failure.
**Then**: Each report clearly identifies the failing layer without requiring artifact download.

**Validation Steps**:
1. **Setup**: Vitest: configure fake failing stages.
2. **Execute**: npm/Vitest: run report generation tests.
3. **Verify**: Vitest: assert layer-specific failure fields and summary text.

**Tools Required**: npm, Vitest.

## Phase 7: Clean the House - Validation Scenarios

### Scenario 7.1: Layered Model Is the Documented Source of Truth [STATUS: pending]
**Type**: Happy Path

**Given**: Transitional migration is complete.
**When**: Documentation and metadata hygiene checks run.
**Then**: README and MIGRATION describe the layered model, and duplicate legacy definitions exist only with explicit compatibility reasons.

**Validation Steps**:
1. **Setup**: Bash: inspect docs and scenario YAML.
2. **Execute**: npm/Vitest: run metadata final hygiene and convention lint tests.
3. **Verify**: Vitest: assert docs coverage and no unexplained duplicates.

**Tools Required**: Bash, npm, Vitest.

### Scenario 7.2: New Legacy E2E Entrypoints Are Rejected [STATUS: pending]
**Type**: Sad Path

**Given**: A new unallowlisted `test/e2e/test-*.sh` entrypoint is added for migrated functionality.
**When**: Convention lint runs.
**Then**: It fails and directs contributors to the layered scenario model instead.

**Validation Steps**:
1. **Setup**: Vitest: use file-list fixture containing a new legacy entrypoint.
2. **Execute**: npm/Vitest: run convention lint.
3. **Verify**: Vitest: assert lint failure names the file and replacement path.

**Tools Required**: npm, Vitest.

## Summary

| Phase | Happy | Sad | Total | Passed | Failed | Pending |
|-------|-------|-----|-------|--------|--------|---------|
| Phase 1 | 2 | 1 | 3 | 0 | 0 | 3 |
| Phase 2 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 3 | 1 | 2 | 3 | 0 | 0 | 3 |
| Phase 4 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 5 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 6 | 2 | 1 | 3 | 0 | 0 | 3 |
| Phase 7 | 1 | 1 | 2 | 0 | 0 | 2 |
| **Total** | **9** | **8** | **17** | **0** | **0** | **17** |
