# Validation Plan: E2E Full Coverage Parity

Generated from: `specs/2026-05-13_e2e-full-coverage-parity/spec.md`
Test Spec: `specs/2026-05-13_e2e-full-coverage-parity/tests.md`

## Overview

**Feature**: Migrate legacy NemoClaw E2E behavior into the scenario framework with auditable assertion-level parity, strict validation, parity reporting, CI gates, and evidence-based legacy wrapper retirement.

**Available Tools**: Bash, Node/tsx, Vitest, `npm test -- --project e2e-scenario-framework`, GitHub Actions workflow YAML static checks, `gh` CLI for optional workflow dispatch, fixture logs, scenario runner, parity comparator, coverage reporter.

## Coverage Summary

- Happy Paths: 11 scenarios
- Sad Paths: 11 scenarios
- Total: 22 scenarios

---

## Phase 1: Inventory Legacy Assertions - Validation Scenarios

### Scenario 1.1: Generate complete deterministic assertion inventory [STATUS: pending]
**Type**: Happy Path

**Given**: The repository contains legacy scripts under `test/e2e/test-*.sh` and `test/e2e/brev-e2e.test.ts`.
**When**: A maintainer runs the inventory generator.
**Then**: `test/e2e/docs/parity-inventory.generated.json` is generated deterministically and includes every legacy entrypoint with assertion text, polarity, source line, and normalized ID suggestion.

**Validation Steps**:
1. **Setup**: Bash: remove any stale generated inventory copy in a temporary branch/worktree.
2. **Execute**: Bash/Node: run `npx tsx scripts/e2e/extract-legacy-assertions.ts` twice.
3. **Verify**: Bash: compare both outputs byte-for-byte; inspect JSON count against `find test/e2e -maxdepth 1 \( -name 'test-*.sh' -o -name 'brev-e2e.test.ts' \)`.

**Tools Required**: Bash, Node/tsx.

### Scenario 1.2: Inventory drift is detected when a legacy assertion changes [STATUS: pending]
**Type**: Sad Path

**Given**: A generated inventory is committed and a legacy script assertion string is edited without regenerating the inventory.
**When**: The inventory/check command runs in CI or locally.
**Then**: The command fails and reports the script/assertion drift.

**Validation Steps**:
1. **Setup**: Bash: copy a legacy script to a temp repo fixture and change one `pass "..."` string.
2. **Execute**: Bash/Node: run the inventory check mode.
3. **Verify**: Bash: confirm non-zero exit and error output names the changed script.

**Tools Required**: Bash, Node/tsx.

---

## Phase 2: Enforce Parity Map Schema - Validation Scenarios

### Scenario 2.1: Non-strict parity map validation accepts bootstrap migration state [STATUS: pending]
**Type**: Happy Path

**Given**: `parity-map.yaml` has one entry per legacy script, with some scripts still `not-started` or empty during bootstrap.
**When**: `npm test -- --project e2e-scenario-framework` runs.
**Then**: Non-strict parity validation passes while still catching malformed entries and missing scripts.

**Validation Steps**:
1. **Setup**: Bash: ensure real inventory and parity map are present.
2. **Execute**: Bash: run `npm test -- --project e2e-scenario-framework`.
3. **Verify**: Bash: confirm exit 0 and convention/parity-map tests pass.

**Tools Required**: npm, Vitest, Node/tsx.

### Scenario 2.2: Strict parity map validation fails on uncategorized assertions [STATUS: pending]
**Type**: Sad Path

**Given**: At least one inventory assertion is not mapped, deferred, or retired.
**When**: A maintainer runs `node`/`tsx scripts/e2e/check-parity-map.ts --strict`.
**Then**: The command fails and reports empty mappings, unknown assertion strings, or missing required status fields.

**Validation Steps**:
1. **Setup**: Bash: create a temp parity map fixture with one missing status or typo.
2. **Execute**: Bash/Node: run `npx tsx scripts/e2e/check-parity-map.ts --strict --map <fixture> --inventory <fixture>`.
3. **Verify**: Bash: confirm non-zero exit and actionable error text.

**Tools Required**: Bash, Node/tsx.

---

## Phase 3: Upgrade Parity Comparison and Reporting - Validation Scenarios

### Scenario 3.1: Strict parity compare passes for aligned mapped assertion logs [STATUS: pending]
**Type**: Happy Path

**Given**: A legacy log and scenario log both contain matching `PASS:` outcomes for mapped assertions.
**When**: `scripts/e2e/compare-parity.sh --strict` runs with the corresponding map.
**Then**: The command exits 0 and emits a structured report with zero divergence.

**Validation Steps**:
1. **Setup**: Bash: write fixture legacy/scenario logs and parity map.
2. **Execute**: Bash: run `scripts/e2e/compare-parity.sh --script sample.sh --legacy legacy.log --scenario scenario.log --map map.yaml --strict`.
3. **Verify**: Bash/Node: parse JSON report and confirm mapped pass count and zero divergence.

**Tools Required**: Bash, Node, parity comparator.

### Scenario 3.2: Strict parity compare fails when mappings or log assertions are missing [STATUS: pending]
**Type**: Sad Path

**Given**: A mapped assertion is absent from either the legacy log or scenario log, or a script has no mappings in strict mode.
**When**: Strict parity compare runs.
**Then**: The command exits non-zero and identifies the missing mapping or missing log side.

**Validation Steps**:
1. **Setup**: Bash: create fixture maps/logs for no mappings and missing scenario assertion.
2. **Execute**: Bash: run strict compare for each fixture.
3. **Verify**: Bash: confirm non-zero exit and report fields for `missing` or `no mappings`.

**Tools Required**: Bash, Node, parity comparator.

---

## Phase 4: Migrate Onboarding Baseline Assertions - Validation Scenarios

### Scenario 4.1: Onboarding baseline bucket reaches zero divergence for non-deferred assertions [STATUS: pending]
**Type**: Happy Path

**Given**: `test-full-e2e.sh`, `test-cloud-onboard-e2e.sh`, and `test-cloud-inference-e2e.sh` assertions are mapped to `ubuntu-repo-cloud-openclaw` suites or deferred with explicit reasons.
**When**: The parity compare workflow or local side-by-side run executes the bucket.
**Then**: All non-deferred assertions compare with zero divergence and coverage marks the bucket migrated or parity-verified.

**Validation Steps**:
1. **Setup**: Bash/gh: prepare required cloud credentials or use recorded fixture logs for local dry validation.
2. **Execute**: Bash/gh: run legacy scripts and scenario runner, then strict compare for the onboarding bucket.
3. **Verify**: Bash: run coverage report and confirm zero unmapped/non-deferred divergence for the bucket.

**Tools Required**: Bash, scenario runner, parity comparator, optional gh/GitHub Actions.

### Scenario 4.2: Onboarding baseline validation fails if scenario IDs stop being emitted [STATUS: pending]
**Type**: Sad Path

**Given**: A migrated onboarding suite no longer logs a mapped scenario assertion ID.
**When**: Strict parity compare runs against fresh logs.
**Then**: The comparison fails with the missing scenario assertion ID.

**Validation Steps**:
1. **Setup**: Bash: create or capture a scenario log missing one mapped ID.
2. **Execute**: Bash: run strict compare for one onboarding script.
3. **Verify**: Bash: confirm non-zero exit and missing ID in output.

**Tools Required**: Bash, parity comparator.

---

## Phase 5: Migrate Onboarding Lifecycle and Sandbox Lifecycle - Validation Scenarios

### Scenario 5.1: Lifecycle bucket validates context-aware sandbox operations [STATUS: pending]
**Type**: Happy Path

**Given**: Repeated onboarding, repair/resume, sandbox operations, snapshots, diagnostics, survival, and crash-loop recovery assertions are represented in scenario suites.
**When**: Lifecycle bucket validation runs.
**Then**: Suites consume normalized `.e2e/context.env`, failure categories are distinct, and non-deferred assertions have zero divergence.

**Validation Steps**:
1. **Setup**: Bash: select lifecycle bucket scripts from the parity map.
2. **Execute**: Bash: run scenario suites with fixture or live sandbox context; run strict compare on captured logs.
3. **Verify**: Bash/coverage report: confirm context use, failure category output, and zero divergence.

**Tools Required**: Bash, scenario runner, parity comparator, coverage reporter.

### Scenario 5.2: Lifecycle validation fails on ad hoc state discovery or ambiguous failure category [STATUS: pending]
**Type**: Sad Path

**Given**: A lifecycle suite bypasses context helpers or runner output collapses setup/expected-state/suite failure into one ambiguous failure.
**When**: Convention lint and lifecycle tests run.
**Then**: Validation fails and identifies the suite or runner behavior to fix.

**Validation Steps**:
1. **Setup**: Bash: use fixture suite with direct repo/sandbox rediscovery or ambiguous failure output.
2. **Execute**: Bash: run `npm test -- --project e2e-scenario-framework`.
3. **Verify**: Bash: confirm failure names the offending suite or missing category.

**Tools Required**: npm, Vitest, Bash.

---

## Phase 6: Migrate Rebuild, Upgrade, and Runtime Services - Validation Scenarios

### Scenario 6.1: Rebuild/upgrade/runtime bucket reports explicit parity status [STATUS: pending]
**Type**: Happy Path

**Given**: Rebuild, stale upgrade, gateway upgrade, runtime override, overlayfs, device auth, and deployment service assertions are mapped or deferred.
**When**: The bucket validation and coverage report run.
**Then**: Rebuild/upgrade paths have scenario equivalents, live-only runtime assertions show owner and runner/secret requirements, and mapped assertions show zero divergence.

**Validation Steps**:
1. **Setup**: Bash: prepare fixture logs for mutation-heavy paths and defer live-only assertions as needed.
2. **Execute**: Bash: run strict bucket map validation and parity compare over fixture/live logs.
3. **Verify**: Bash: render coverage report and inspect mapped/deferred counts for the bucket.

**Tools Required**: Bash, Node/tsx, parity comparator, coverage reporter.

### Scenario 6.2: Retirement readiness blocks rebuild/runtime scripts without parity evidence [STATUS: pending]
**Type**: Sad Path

**Given**: A rebuild or runtime legacy script is marked ready for retirement before a zero-divergence run is recorded.
**When**: Retirement readiness validation runs.
**Then**: The check fails and reports missing parity evidence.

**Validation Steps**:
1. **Setup**: Bash: create map fixture with all assertions mapped but no evidence field.
2. **Execute**: Bash/Node: run `check-parity-map.ts --retirement-check` or equivalent mode.
3. **Verify**: Bash: confirm non-zero exit and missing evidence message.

**Tools Required**: Bash, Node/tsx.

---

## Phase 7: Migrate Inference, Hermes, and Messaging Variants - Validation Scenarios

### Scenario 7.1: Provider, Hermes, and messaging variants validate with fake endpoints where possible [STATUS: pending]
**Type**: Happy Path

**Given**: Provider routing, Ollama auth proxy, Kimi compatibility, Hermes/OpenClaw switch, messaging provider, token rotation, and injection assertions are covered by fake endpoint fixtures or deferred live-service metadata.
**When**: Variant bucket validation runs.
**Then**: Deterministic fake endpoint assertions pass, live-only assertions are deferred explicitly, and non-deferred assertions have zero divergence.

**Validation Steps**:
1. **Setup**: Bash: start or configure fake endpoint fixtures used by the suites.
2. **Execute**: Bash: run scenario suites and strict parity compare for the variant bucket.
3. **Verify**: Bash/coverage report: confirm mapped, deferred, and zero-divergence counts.

**Tools Required**: Bash, Node fixtures, scenario runner, parity comparator.

### Scenario 7.2: Messaging/security validation fails when live-only assertions lack deferred metadata [STATUS: pending]
**Type**: Sad Path

**Given**: A Slack/Discord/Telegram or GPU assertion cannot run deterministically and lacks owner/reason/runner-or-secret metadata.
**When**: Strict parity map validation runs.
**Then**: Validation fails and names the incomplete deferred assertion.

**Validation Steps**:
1. **Setup**: Bash: create fixture map entry with `status: deferred` missing required metadata.
2. **Execute**: Bash/Node: run strict parity map validation.
3. **Verify**: Bash: confirm non-zero exit and required-field error.

**Tools Required**: Bash, Node/tsx.

---

## Phase 8: Migrate Security, Policy, Platform, and Miscellaneous Coverage - Validation Scenarios

### Scenario 8.1: Final migration bucket leaves no uncategorized legacy entrypoints [STATUS: pending]
**Type**: Happy Path

**Given**: Security/policy, credential, Spark, Launchable, Brev, skill-agent, and docs validation scripts are mapped, deferred, or retired.
**When**: Full strict parity map validation runs.
**Then**: Every legacy entrypoint and assertion has a first-class status and platform-specific scenarios declare runner requirements.

**Validation Steps**:
1. **Setup**: Bash: regenerate inventory and ensure parity map includes final bucket.
2. **Execute**: Bash/Node: run `npx tsx scripts/e2e/check-parity-map.ts --strict`.
3. **Verify**: Bash: confirm exit 0 and coverage report unmapped count is zero.

**Tools Required**: Bash, Node/tsx, coverage reporter.

### Scenario 8.2: Platform-specific scenario validation fails without runner requirements [STATUS: pending]
**Type**: Sad Path

**Given**: A DGX Spark, Launchable, or Brev scenario is added without explicit runner requirements.
**When**: Scenario schema and metadata hygiene tests run.
**Then**: Validation fails and identifies the missing runner metadata.

**Validation Steps**:
1. **Setup**: Bash: create scenario metadata fixture missing runner requirement.
2. **Execute**: Bash: run `npm test -- --project e2e-scenario-framework`.
3. **Verify**: Bash: confirm schema/hygiene test failure names the scenario.

**Tools Required**: npm, Vitest.

---

## Phase 9: Expand CI Parity Gates - Validation Scenarios

### Scenario 9.1: Maintainer can run parity for one script, one bucket, or all migrated buckets [STATUS: pending]
**Type**: Happy Path

**Given**: `.github/workflows/e2e-parity-compare.yaml` supports script, bucket, scenario, strict mode, and deferred handling inputs.
**When**: A maintainer dispatches the workflow or static workflow tests inspect it.
**Then**: CI runs the selected parity scope and uploads legacy logs, scenario logs, assertion reports, and coverage reports.

**Validation Steps**:
1. **Setup**: Bash/gh: inspect workflow inputs or dispatch a dry/small script job if available.
2. **Execute**: Bash: run workflow static tests; optionally `gh workflow run` for a small migrated script.
3. **Verify**: Bash/gh: confirm artifact upload steps and strict failure propagation are present; optional run has expected artifacts.

**Tools Required**: npm, Vitest, optional gh CLI.

### Scenario 9.2: CI parity gate fails on divergence in strict mode [STATUS: pending]
**Type**: Sad Path

**Given**: Strict mode is enabled and a mapped assertion diverges between legacy and scenario logs.
**When**: The parity workflow command executes compare-parity.
**Then**: The workflow step fails rather than masking the failure.

**Validation Steps**:
1. **Setup**: Bash: use workflow command fixture or local script step with diverging logs.
2. **Execute**: Bash: run the same strict compare command shape used by workflow.
3. **Verify**: Bash: confirm non-zero exit propagates and no `|| true` masks it.

**Tools Required**: Bash, parity comparator, workflow static tests.

---

## Phase 10: Enforce Retirement Readiness - Validation Scenarios

### Scenario 10.1: Retirement check approves only evidence-backed legacy wrappers [STATUS: pending]
**Type**: Happy Path

**Given**: A legacy script has all assertions mapped/deferred/retired, mapped assertions have recorded zero-divergence evidence, deferred assertions document requirements, and workflows no longer call old internals.
**When**: Retirement readiness validation runs.
**Then**: The script is eligible to become a thin wrapper around the scenario runner.

**Validation Steps**:
1. **Setup**: Bash: prepare map/evidence fixture or a real parity-verified script.
2. **Execute**: Bash/Node: run retirement readiness mode.
3. **Verify**: Bash: confirm exit 0 and readiness summary for the script.

**Tools Required**: Bash, Node/tsx.

### Scenario 10.2: Retirement check blocks active workflow references to removed scripts [STATUS: pending]
**Type**: Sad Path

**Given**: A script is marked retired but an active workflow still references its legacy path.
**When**: Retirement readiness validation scans workflows.
**Then**: The check fails and reports the workflow file and script reference.

**Validation Steps**:
1. **Setup**: Bash: create workflow fixture referencing a retired script.
2. **Execute**: Bash/Node: run retirement readiness mode.
3. **Verify**: Bash: confirm non-zero exit and workflow path in output.

**Tools Required**: Bash, Node/tsx.

---

## Phase 11: Clean the House - Validation Scenarios

### Scenario 11.1: Retired legacy entrypoints delegate to scenario runner and docs explain the new flow [STATUS: pending]
**Type**: Happy Path

**Given**: Parity-verified legacy scripts are converted into thin wrappers and docs are updated.
**When**: E2E convention lint and workflow/docs checks run.
**Then**: Wrappers call the scenario runner, workflows use scenario paths for retired coverage, and docs explain scenario/suite/assertion/parity-map additions.

**Validation Steps**:
1. **Setup**: Bash: select retired wrapper scripts and docs.
2. **Execute**: Bash: run `npm test -- --project e2e-scenario-framework` and render coverage report.
3. **Verify**: Bash: confirm tests pass, docs checks pass, and unmapped assertion count is zero.

**Tools Required**: npm, Vitest, Bash, coverage reporter.

### Scenario 11.2: Cleanup validation fails if monolithic legacy logic is reintroduced [STATUS: pending]
**Type**: Sad Path

**Given**: A retired wrapper grows duplicated setup/onboarding/helper logic instead of delegating to scenario runner.
**When**: Convention lint runs.
**Then**: The lint fails and reports that the retired script is no longer a thin wrapper.

**Validation Steps**:
1. **Setup**: Bash: create retired wrapper fixture with duplicated legacy body.
2. **Execute**: Bash: run convention lint tests.
3. **Verify**: Bash: confirm non-zero result and wrapper violation message.

**Tools Required**: npm, Vitest, Bash.

---

## Summary

| Phase | Happy | Sad | Total | Passed | Failed | Pending |
|-------|-------|-----|-------|--------|--------|---------|
| Phase 1 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 2 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 3 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 4 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 5 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 6 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 7 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 8 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 9 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 10 | 1 | 1 | 2 | 0 | 0 | 2 |
| Phase 11 | 1 | 1 | 2 | 0 | 0 | 2 |
| **Total** | **11** | **11** | **22** | **0** | **0** | **22** |
