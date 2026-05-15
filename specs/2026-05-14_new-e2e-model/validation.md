# Validation Plan: New E2E Model

Generated from: `specs/2026-05-14_new-e2e-model/spec.md`
Test Spec: `specs/2026-05-14_new-e2e-model/tests.md`

## Overview

**Feature**: Layered scenario model for NemoClaw E2E metadata, plan resolution, coverage, onboarding assertions, suite organization, and workflow summaries.

**Available Tools**: Bash, Vitest, tsx/TypeScript resolver, GitHub Actions workflow lint tests, file-system checks.

## Coverage Summary

- Happy Paths: 9 scenarios
- Sad Paths: 7 scenarios
- Total: 16 scenarios

---

## Phase 1: Layered Terminology and Schema Planning - Validation Scenarios

### Scenario 1.1: Legacy scenario alias resolves to layered plan [STATUS: pending]
**Type**: Happy Path

**Given**: existing scenario ID `ubuntu-repo-cloud-openclaw` remains in compatibility metadata
**When**: `bash test/e2e/runtime/run-scenario.sh ubuntu-repo-cloud-openclaw --plan-only` runs
**Then**: the command exits 0 and resolved plan output includes separate base, onboarding, expected-state, assertion, and suite fields.

**Validation Steps**:
1. **Setup**: Bash: ensure dependencies are installed.
2. **Execute**: Bash: run the plan-only command.
3. **Verify**: Bash/grep: check exit code and layered keys in output.

**Tools Required**: Bash

### Scenario 1.2: Direct layered test plan resolves [STATUS: pending]
**Type**: Happy Path

**Given**: test plan `ubuntu-repo-docker__cloud-nvidia-openclaw` exists
**When**: `bash test/e2e/runtime/run-scenario.sh ubuntu-repo-docker__cloud-nvidia-openclaw --plan-only` runs
**Then**: the command exits 0 and points to the expected base/onboarding definitions.

**Validation Steps**:
1. **Setup**: Bash: no sandbox setup required.
2. **Execute**: Bash: run direct plan-only command.
3. **Verify**: Bash/grep: assert `ubuntu-repo-docker` and `cloud-nvidia-openclaw` appear.

**Tools Required**: Bash

### Scenario 1.3: Broken layered references fail fast [STATUS: pending]
**Type**: Sad Path

**Given**: resolver fixture with a missing base, onboarding profile, expected state, assertion, or suite reference
**When**: scenario-framework resolver tests execute
**Then**: each invalid reference fails with a clear error naming the missing key.

**Validation Steps**:
1. **Setup**: Vitest fixture via `loadMetadataFromObjects`.
2. **Execute**: `npx vitest run test/e2e/scenario-framework-tests/e2e-scenario-resolver.test.ts`.
3. **Verify**: Vitest assertions match error text.

**Tools Required**: Vitest

### Scenario 1.4: Capability and expected-failure metadata are preserved but not enforced [STATUS: pending]
**Type**: Happy Path

**Given**: GPU/base plans declare `runner_requirements` and no-Docker plan declares `expected_failure`
**When**: resolver produces plan JSON
**Then**: metadata is present in output and no live runner capability probe is performed.

**Validation Steps**:
1. **Setup**: fixture or real metadata with GPU and no-Docker plans.
2. **Execute**: Vitest resolver tests.
3. **Verify**: output JSON contains metadata and no capability command is invoked.

**Tools Required**: Vitest

## Phase 2: Layered Coverage and Gap Reports - Validation Scenarios

### Scenario 2.1: Coverage report shows layered sections [STATUS: pending]
**Type**: Happy Path

**Given**: layered metadata exists
**When**: `bash test/e2e/runtime/coverage-report.sh` runs
**Then**: report includes base scenarios, onboarding profiles, test plans, suites, parity by layer, and top gap domains.

**Validation Steps**:
1. **Setup**: Bash: clean `.e2e/reports`.
2. **Execute**: Bash: run coverage report.
3. **Verify**: grep report output and `.e2e/reports/summary.md`.

**Tools Required**: Bash

### Scenario 2.2: Transitional parity entries without explicit layer still pass [STATUS: pending]
**Type**: Sad Path

**Given**: deferred parity assertion lacks explicit `layer`
**When**: parity validation runs during transition
**Then**: validation passes with inferred/default layer instead of failing.

**Validation Steps**:
1. **Setup**: parity-map fixture without layer.
2. **Execute**: Vitest parity-map test or `tsx scripts/e2e/check-parity-map.ts`.
3. **Verify**: successful exit and inferred/default layer in aggregation.

**Tools Required**: Vitest or tsx

## Phase 3: Onboarding Assertion Stage - Validation Scenarios

### Scenario 3.1: Onboarding assertions run before expected-state validation [STATUS: pending]
**Type**: Happy Path

**Given**: a plan with stub onboarding assertion scripts and expected-state validation enabled
**When**: scenario runner executes the plan in test mode
**Then**: logs show onboarding assertions after onboarding and before expected-state and suite stages.

**Validation Steps**:
1. **Setup**: fixture scripts emit ordered markers.
2. **Execute**: Vitest suite-runner test.
3. **Verify**: marker order matches required flow.

**Tools Required**: Vitest, Bash fixtures

### Scenario 3.2: Missing onboarding assertion reference fails at plan time [STATUS: pending]
**Type**: Sad Path

**Given**: a plan references unknown assertion `ghost-assertion`
**When**: resolver runs
**Then**: it fails before execution with an error naming `ghost-assertion`.

**Validation Steps**:
1. **Setup**: metadata fixture.
2. **Execute**: Vitest resolver test.
3. **Verify**: thrown error matches assertion name.

**Tools Required**: Vitest

## Phase 4: Onboarding Matrix Expansion - Validation Scenarios

### Scenario 4.1: Onboarding profile coverage is independent from base coverage [STATUS: pending]
**Type**: Happy Path

**Given**: messaging, OpenAI-compatible, Hermes, and lifecycle profiles exist
**When**: coverage report runs
**Then**: onboarding coverage table lists profiles independently of base scenario coverage.

**Validation Steps**:
1. **Setup**: real metadata after phase implementation.
2. **Execute**: coverage-report command.
3. **Verify**: onboarding profile IDs appear in onboarding section, not only scenario rows.

**Tools Required**: Bash

### Scenario 4.2: Unsupported base/onboarding combination is rejected [STATUS: pending]
**Type**: Sad Path

**Given**: metadata combines an unsupported base with an onboarding profile requiring unavailable secrets/capabilities
**When**: resolver validates the plan
**Then**: plan resolution fails with a compatibility error.

**Validation Steps**:
1. **Setup**: Vitest fixture.
2. **Execute**: resolver test.
3. **Verify**: error names incompatible base/onboarding requirement.

**Tools Required**: Vitest

## Phase 5: Post-Onboard Suite Reorganization - Validation Scenarios

### Scenario 5.1: Suite family aliases preserve existing behavior [STATUS: pending]
**Type**: Happy Path

**Given**: old suite IDs and new family IDs coexist during migration
**When**: a legacy plan resolves and suite runner loads suites
**Then**: old IDs resolve to equivalent family suites without changing install/onboard behavior.

**Validation Steps**:
1. **Setup**: metadata with old and new suite IDs.
2. **Execute**: Vitest suite-runner and resolver tests.
3. **Verify**: resolved steps are equivalent and no install/onboard step is present in suites.

**Tools Required**: Vitest

### Scenario 5.2: Suite attempting to install or onboard is rejected [STATUS: pending]
**Type**: Sad Path

**Given**: suite metadata includes a step that calls install/onboard paths
**When**: convention lint tests run
**Then**: tests fail and identify the invalid suite step.

**Validation Steps**:
1. **Setup**: fixture suite with invalid script path or marker.
2. **Execute**: convention lint test.
3. **Verify**: failure message names the suite and forbidden behavior.

**Tools Required**: Vitest

## Phase 6: Workflow and Report Visibility - Validation Scenarios

### Scenario 6.1: Workflow summaries include layered reports [STATUS: pending]
**Type**: Happy Path

**Given**: E2E scenario and parity workflows run in GitHub Actions
**When**: workflow steps complete
**Then**: `$GITHUB_STEP_SUMMARY` includes selected base, onboarding, expected state, assertion results, suite results, parity counts, and top gaps.

**Validation Steps**:
1. **Setup**: workflow lint fixture or local temp `$GITHUB_STEP_SUMMARY`.
2. **Execute**: workflow test scripts.
3. **Verify**: summary file contains required sections.

**Tools Required**: Vitest, Bash

### Scenario 6.2: Failed run records failing layer [STATUS: pending]
**Type**: Sad Path

**Given**: a fixture scenario fails during base, onboarding, expected-state, or suite stage
**When**: runner writes reports
**Then**: report identifies the failing layer without requiring artifact download.

**Validation Steps**:
1. **Setup**: stub failure at each layer.
2. **Execute**: runner/report tests.
3. **Verify**: `summary.md` and JSON report contain `failing_layer`.

**Tools Required**: Vitest, Bash fixtures

## Phase 7: Clean the House - Validation Scenarios

### Scenario 7.1: Layered model is the documented source of truth [STATUS: pending]
**Type**: Happy Path

**Given**: migration cleanup is complete
**When**: metadata hygiene tests and docs checks run
**Then**: no unexplained duplicate scenario definitions remain and docs describe the layered model.

**Validation Steps**:
1. **Setup**: real repository metadata.
2. **Execute**: `npx vitest run test/e2e/scenario-framework-tests/e2e-metadata-final-hygiene.test.ts` and docs-related checks.
3. **Verify**: tests pass and docs contain base/onboarding/test plan terminology.

**Tools Required**: Vitest, Bash

### Scenario 7.2: New legacy E2E entrypoints are blocked [STATUS: pending]
**Type**: Sad Path

**Given**: a new `test/e2e/test-*.sh` entrypoint is added outside approved compatibility paths
**When**: convention lint runs
**Then**: it fails and instructs contributors to use layered metadata/suites instead.

**Validation Steps**:
1. **Setup**: fixture or temporary file in lint test.
2. **Execute**: `npx vitest run test/e2e/scenario-framework-tests/e2e-convention-lint.test.ts`.
3. **Verify**: failure names forbidden entrypoint pattern.

**Tools Required**: Vitest

## Summary

| Phase | Happy | Sad | Total | Passed | Failed | Pending |
|-------|------:|----:|------:|-------:|-------:|--------:|
| Phase 1 | 3 | 1 | 4 | 0 | 0 | 4 |
| Phase 2 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 3 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 4 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 5 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 6 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 7 | 1 | 1 | 2 | 0 | 0 | 2 |
| **Total** | **9** | **7** | **16** | **0** | **0** | **16** |
