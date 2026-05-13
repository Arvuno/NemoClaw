# Test Specification: E2E Full Coverage Parity

Generated from: `specs/2026-05-13_e2e-full-coverage-parity/spec.md`

## Test Strategy

Use the existing `e2e-scenario-framework` Vitest project and the current shell harness tests. Keep tests focused on deterministic parsing, schema validation, report rendering, and dry-run log comparison. Do not require live cloud, GPU, messaging, or Brev infrastructure in unit tests.

Primary command for this spec:

```bash
npm test -- --project e2e-scenario-framework
```

Existing patterns to reuse:

- `test/e2e/scenario-framework-tests/e2e-convention-lint.test.ts` for CLI/script spawning, temp repo fixtures, and non-strict parity-map validation.
- `test/e2e/scenario-framework-tests/e2e-coverage-report.test.ts` for resolver/report assertions.
- `scripts/e2e/compare-parity.sh` tests through bash subprocesses.
- `test/e2e/runtime/resolver/*.ts` pure functions for coverage calculations.
- `js-yaml` for YAML parsing; do not add or prefer another YAML parser for new parity tooling.

---

## Phase 1: Inventory Legacy Assertions - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-convention-lint.test.ts`
  - Current behavior: verifies parity map seed exists and new legacy scripts require parity entries.
  - Required changes: add coverage for the generated inventory command and drift detection.

**New Tests to Create:**

1. `extract_legacy_assertions_should_find_pass_and_fail_helper_calls`
   - **Input**: Temp legacy shell script containing `pass "CLI ready"` and `fail "CLI missing"`.
   - **Expected**: Inventory includes both assertions with script path, line number, text, polarity, and ID suggestion.
   - **Covers**: Phase 1 AC: quoted assertions and polarity.

2. `extract_legacy_assertions_should_find_direct_pass_fail_output`
   - **Input**: Temp script containing `echo "PASS: gateway healthy"` and `echo "FAIL: gateway unhealthy"`.
   - **Expected**: Inventory includes direct `PASS:` / `FAIL:` strings without shell helper dependence.
   - **Covers**: Phase 1 AC: direct output patterns.

3. `extract_legacy_assertions_should_handle_helper_wrapped_assertions`
   - **Input**: Temp script with common wrappers such as `retry_until pass "sandbox listed"` or `if ...; then pass "x"; fi`.
   - **Expected**: Assertion text and source line are extracted once.
   - **Covers**: Phase 1 AC: helper-wrapped assertions.

4. `extract_legacy_assertions_should_include_zero_assertion_scripts`
   - **Input**: Temp `test-no-assertions.sh` plus a reason/TODO mechanism supported by the implementation.
   - **Expected**: Inventory lists the script with zero assertions and explicit review metadata.
   - **Covers**: Phase 1 AC: zero assertion scripts listed explicitly.

5. `extract_legacy_assertions_should_generate_deterministic_json`
   - **Input**: Same temp tree generated twice with files created in different order.
   - **Expected**: Byte-identical JSON output.
   - **Covers**: Phase 1 AC: deterministic generation.

**Test Implementation Notes:**

- Prefer exporting parser functions for pure unit tests and one subprocess test for CLI wiring.
- Normalize paths relative to repo root in snapshots to avoid temp directory churn.
- Include `test/e2e/brev-e2e.test.ts` in fixture coverage with a minimal TypeScript-style assertion/log pattern.
- Include a filesystem-derived entrypoint fixture so tests catch newly added `test/e2e/test-*.sh` scripts without hard-coded script counts.

---

## Phase 2: Enforce Parity Map Schema - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-convention-lint.test.ts`
  - Current behavior: ensures new legacy scripts have parity map entries.
  - Required changes: invoke `check-parity-map.ts` in non-strict mode as part of convention lint coverage.

**New Tests to Create:**

1. `check_parity_map_should_pass_non_strict_with_seeded_empty_entries`
   - **Input**: Inventory with scripts and parity map entries using `status: not-started` or empty bootstrap assertions.
   - **Expected**: Exit 0 in non-strict mode.
   - **Covers**: Phase 2 AC: permissive bootstrap mode.

2. `check_parity_map_should_fail_when_script_entry_missing`
   - **Input**: Inventory containing `test-new.sh`, map without that script.
   - **Expected**: Non-zero exit and error naming `test-new.sh`.
   - **Covers**: Phase 2 AC: every legacy script has a map entry.

3. `check_parity_map_should_validate_status_required_fields`
   - **Input**: Map entries for `mapped`, `deferred`, and `retired` with one required field omitted in each table-driven case.
   - **Expected**: Non-zero exit with field-specific error.
   - **Covers**: Phase 2 AC: status field validation.

4. `check_parity_map_strict_should_fail_on_empty_or_uncategorized_assertions`
   - **Input**: Map with empty assertions or assertion missing a recognized status.
   - **Expected**: Strict mode exits non-zero.
   - **Covers**: Phase 2 AC: strict mode completeness.

5. `check_parity_map_should_reject_unknown_legacy_assertion_strings`
   - **Input**: Inventory has `CLI ready`; map references `CLI redy`.
   - **Expected**: Non-zero exit with typo context.
   - **Covers**: Phase 2 AC: compare against inventory.

6. `check_parity_map_should_reject_duplicate_ids_unless_reusable`
   - **Input**: Two mapped assertions share an `id` with and without `reusable: true`.
   - **Expected**: Duplicate without `reusable` fails; explicit reusable passes.
   - **Covers**: Phase 2 AC: duplicate scenario assertion IDs.

**Test Implementation Notes:**

- Use `js-yaml`, matching project dependency guidance.
- Keep the production validator wired through the existing convention-lint flow; schema tests may live in a dedicated `e2e-parity-map.test.ts` if `e2e-convention-lint.test.ts` becomes too large.
- Test script-level statuses (`not-started`, `migrated`, `parity-verified`, `deferred`, `retired`) separately from assertion-level statuses (`mapped`, `deferred`, `retired`).

---

## Phase 3: Upgrade Parity Comparison and Reporting - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-convention-lint.test.ts`
  - Current behavior: tests empty map, divergence, and flaky aligned failures for `compare-parity.sh`.
  - Required changes: add `--strict`, status handling, and structured report assertions.
- `test/e2e/scenario-framework-tests/e2e-coverage-report.test.ts`
  - Current behavior: renders scenario coverage and gaps.
  - Required changes: add legacy parity summary and gaps.

**New Tests to Create:**

1. `compare_parity_strict_should_fail_when_script_has_no_mappings`
   - **Input**: Empty map, empty logs, `--strict`.
   - **Expected**: Non-zero exit and structured report with missing mapping count.
   - **Covers**: Phase 3 AC: strict no-mapping failure.

2. `compare_parity_should_ignore_deferred_and_retired_assertions_for_divergence`
   - **Input**: Map contains `deferred` and `retired` assertions absent from scenario log.
   - **Expected**: Exit 0, report counts deferred/retired.
   - **Covers**: Phase 3 AC: deferred/retired assertions.

3. `compare_parity_strict_should_fail_when_mapped_assertion_missing_in_either_log`
   - **Input**: Mapped assertion present only in legacy or scenario log.
   - **Expected**: Non-zero exit and report marks missing side.
   - **Covers**: Phase 3 AC: missing-log assertions.

4. `compare_parity_should_emit_machine_readable_json_report`
   - **Input**: Mixed pass, fail, missing, deferred, retired assertions with `--report <path>` or stdout contract.
   - **Expected**: JSON includes script, scenario, counts, per-assertion outcomes, and divergence list.
   - **Covers**: Phase 3 AC: CI artifacts include machine-readable parity reports.

5. `coverage_report_should_include_legacy_parity_summary`
   - **Input**: Resolver metadata plus synthetic inventory/map status.
   - **Expected**: Markdown shows total scripts, total assertions, mapped, deferred, retired, unmapped.
   - **Covers**: Phase 3 AC: coverage report parity status.

**Test Implementation Notes:**

- Keep non-strict behavior compatible with existing bootstrap tests.
- Avoid brittle full-report snapshots; assert section headers and key counts.

---

## Phase 4: Migrate Onboarding Baseline Assertions - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-suite-runner.test.ts`
  - Current behavior: verifies suite execution mechanics.
  - Required changes: assert suite logs include stable `PASS: <id>` / `FAIL: <id>` lines for migrated onboarding assertions.
- `test/e2e/scenario-framework-tests/e2e-scenario-first-migration.test.ts`
  - Current behavior: validates first migrated scenario behavior.
  - Required changes: include onboarding baseline mapping checks.

**New Tests to Create:**

1. `onboarding_baseline_suites_should_emit_expected_assertion_ids`
   - **Input**: Dry-run or fixture-backed execution for CLI install, gateway health, sandbox status, cloud inference route.
   - **Expected**: Logs contain IDs like `smoke.cli.available`, `smoke.gateway.healthy`, and inference IDs.
   - **Covers**: Phase 4 AC: stable scenario assertion IDs.

2. `parity_map_should_map_all_non_deferred_onboarding_baseline_assertions`
   - **Input**: Real inventory and parity map filtered to `test-full-e2e.sh`, `test-cloud-onboard-e2e.sh`, `test-cloud-inference-e2e.sh`.
   - **Expected**: Strict bucket validation passes for those scripts.
   - **Covers**: Phase 4 AC: all non-deferred assertions mapped.

3. `coverage_report_should_mark_onboarding_baseline_migrated_or_verified`
   - **Input**: Map statuses for the three scripts.
   - **Expected**: Coverage report bucket row indicates migrated/parity-verified and zero unmapped.
   - **Covers**: Phase 4 AC: coverage visibility.

**Test Implementation Notes:**

- Do not call live cloud APIs in unit tests. Use fixture logs for side-by-side comparison tests.
- Live parity remains a manual/CI validation scenario, not a Vitest unit test.

---

## Phase 5: Migrate Onboarding Lifecycle and Sandbox Lifecycle - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-context-helper.test.ts`
  - Current behavior: validates context helper behavior.
  - Required changes: assert lifecycle suites consume normalized `.e2e/context.env`.
- `test/e2e/scenario-framework-tests/e2e-expected-state-validator.test.ts`
  - Current behavior: validates expected-state mechanics.
  - Required changes: add diagnostics, snapshot, and crash-loop expected-state fixtures as concrete consumers appear.

**New Tests to Create:**

1. `sandbox_lifecycle_suites_should_use_context_env`
   - **Input**: Static scan or dry-run fixture for lifecycle suite scripts.
   - **Expected**: Scripts source runtime context helpers and do not rediscover repo/sandbox state ad hoc.
   - **Covers**: Phase 5 AC: normalized context use.

2. `expected_state_validator_should_distinguish_setup_expected_state_and_suite_failures`
   - **Input**: Fixture scenarios with one setup failure, one expected-state failure, one suite failure.
   - **Expected**: Runner result includes distinct failure category.
   - **Covers**: Phase 5 AC: failure source distinction.

3. `parity_map_should_map_all_non_deferred_lifecycle_assertions`
   - **Input**: Lifecycle script bucket inventory and map.
   - **Expected**: Bucket strict validation passes and reports zero divergence on fixture logs.
   - **Covers**: Phase 5 AC: lifecycle wave mapped.

**Test Implementation Notes:**

- Prefer static lint checks for suite hygiene over executing Docker-heavy flows.
- Fixture logs should include at least one repeated onboarding and one snapshot assertion.

---

## Phase 6: Migrate Rebuild, Upgrade, and Runtime Services - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-scenario-resolver.test.ts`
  - Current behavior: validates scenario dimension resolution.
  - Required changes: add fixtures for stale installs, runtime overrides, and Docker/overlayfs probes if introduced as scenario metadata.
- `test/e2e/scenario-framework-tests/e2e-suite-runner.test.ts`
  - Current behavior: validates suite execution.
  - Required changes: cover mutation-heavy operations staying in suites.

**New Tests to Create:**

1. `rebuild_upgrade_fixtures_should_resolve_deterministically`
   - **Input**: Scenario fixture referencing stale base image/install fixture.
   - **Expected**: Resolver output includes required fixture paths and stable ordering.
   - **Covers**: Phase 6 AC: rebuild/upgrade scenario equivalents.

2. `runtime_service_assertions_should_be_mapped_or_deferred_with_requirements`
   - **Input**: Map entries for runtime/service scripts.
   - **Expected**: Each live-only assertion has deferred reason and owner; mapped assertions have IDs.
   - **Covers**: Phase 6 AC: explicit infrastructure requirements.

3. `retirement_check_should_not_allow_runtime_scripts_before_parity_verified`
   - **Input**: Map marks a runtime script migrated but not parity-verified.
   - **Expected**: Retirement readiness fails.
   - **Covers**: Phase 6 AC: no old workflow retired early.

**Test Implementation Notes:**

- Test old-image fixture selection as metadata; do not pull images.
- Use fake logs for gateway upgrade and device-auth assertions.

---

## Phase 7: Migrate Inference, Hermes, and Messaging Variants - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-suite-runner.test.ts`
  - Current behavior: validates suite execution mechanics.
  - Required changes: verify fake endpoint fixtures expose deterministic URLs/tokens to suites.
- `test/e2e/scenario-framework-tests/e2e-scenario-additional-families.test.ts`
  - Current behavior: validates additional scenario families.
  - Required changes: add provider/agent/messaging metadata coverage where needed.

**New Tests to Create:**

1. `fake_endpoint_fixtures_should_support_provider_routing_and_auth_proxy_assertions`
   - **Input**: Fixture endpoint config for Ollama auth proxy, Kimi compatibility, routing.
   - **Expected**: Suites can validate request shape, auth header, model selection, and response handling without live services.
   - **Covers**: Phase 7 AC: deterministic fake endpoint tests.

2. `hermes_and_openclaw_switch_suites_should_emit_agent_specific_ids`
   - **Input**: Dry-run logs for Hermes/OpenClaw inference switch suites.
   - **Expected**: IDs are stable and namespaced by inference/agent behavior.
   - **Covers**: Phase 7 AC: stable assertion IDs.

3. `messaging_live_only_assertions_should_require_deferred_metadata`
   - **Input**: Slack/Discord/Telegram live assertion map entries.
   - **Expected**: Missing owner, reason, and either `secret_requirement` or `runner_requirement` fails validation.
   - **Covers**: Phase 7 AC: live-service-only assertions deferred explicitly.

4. `parity_compare_should_pass_for_non_deferred_provider_and_messaging_fixture_logs`
   - **Input**: Legacy and scenario fixture logs for mapped provider/messaging assertions.
   - **Expected**: Strict compare exits 0 and counts deferred separately.
   - **Covers**: Phase 7 AC: zero divergence for non-deferred assertions.

**Test Implementation Notes:**

- Do not require real Slack/Discord/Telegram tokens.
- Use current `test/e2e/lib/fake-slack-api.cjs` patterns where applicable.

---

## Phase 8: Migrate Security, Policy, Platform, and Miscellaneous Coverage - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-scenario-schema.test.ts`
  - Current behavior: validates schema for scenario metadata.
  - Required changes: validate explicit runner requirements for platform-specific scenarios.
- `test/e2e/scenario-framework-tests/e2e-metadata-final-hygiene.test.ts`
  - Current behavior: checks metadata hygiene.
  - Required changes: enforce no uncategorized assertions when all buckets are complete.

**New Tests to Create:**

1. `security_policy_suites_should_emit_credential_and_network_assertion_ids`
   - **Input**: Dry-run or fixture logs for policy, shield, credential sanitization/migration suites.
   - **Expected**: Logs include stable IDs such as `security.credentials.redacted`.
   - **Covers**: Phase 8 AC: security/policy assertions mapped.

2. `platform_specific_scenarios_should_declare_runner_requirements`
   - **Input**: DGX Spark, Launchable, Brev remote scenario metadata.
   - **Expected**: Schema validation fails if runner requirements are absent.
   - **Covers**: Phase 8 AC: explicit runner requirements.

3. `strict_parity_map_should_have_no_uncategorized_assertions_after_final_bucket`
   - **Input**: Full real inventory/map after Phase 8 completion.
   - **Expected**: `check-parity-map.ts --strict` exits 0.
   - **Covers**: Phase 8 AC: every entrypoint mapped/deferred/retired.

**Test Implementation Notes:**

- Treat Brev remote execution as deferred or CI-only; unit tests validate metadata and map status only.
- Include current miscellaneous legacy scripts (`test-brave-search-e2e.sh`, `test-dashboard-remote-bind.sh`, and `test-gateway-health-honest.sh`) in this final bucket unless they are moved to a more specific bucket during implementation.
- Docs validation can be covered by command wiring and fixture output.

---

## Phase 9: Expand CI Parity Gates - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-scenarios-workflow.test.ts`
  - Current behavior: validates scenario workflow shape.
  - Required changes: validate parity workflow inputs, matrix/batch behavior, artifact uploads, and strict mode controls.

**New Tests to Create:**

1. `parity_workflow_should_support_single_script_bucket_and_all_inputs`
   - **Input**: `.github/workflows/e2e-parity-compare.yaml` parsed as YAML.
   - **Expected**: Workflow exposes inputs for script, bucket, all migrated buckets, scenario, strict mode, and deferred handling.
   - **Covers**: Phase 9 AC: maintainers can run one script/bucket/all migrated.

2. `parity_workflow_should_upload_logs_and_reports`
   - **Input**: Workflow YAML.
   - **Expected**: Artifact upload steps include legacy logs, scenario logs, parsed assertion reports, and coverage reports.
   - **Covers**: Phase 9 AC: CI artifacts.

3. `parity_workflow_should_fail_on_strict_divergence`
   - **Input**: Workflow command step.
   - **Expected**: Strict compare command is not masked by `|| true`; divergence propagates failure.
   - **Covers**: Phase 9 AC: CI fails on divergence.

**Test Implementation Notes:**

- Reuse workflow YAML parsing already present in scenario workflow tests.
- Static workflow tests are sufficient; do not trigger GitHub Actions from Vitest.

---

## Phase 10: Enforce Retirement Readiness - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-convention-lint.test.ts`
  - Current behavior: static lint of legacy/suite conventions.
  - Required changes: include retirement readiness command or checks.

**New Tests to Create:**

1. `retirement_check_should_block_unmapped_assertions`
   - **Input**: Script marked retired with one unmapped assertion.
   - **Expected**: Non-zero exit naming the assertion.
   - **Covers**: Phase 10 AC: blocks unverified removal.

2. `retirement_check_should_block_without_zero_divergence_evidence`
   - **Input**: All assertions mapped but no recorded parity run evidence.
   - **Expected**: Non-zero exit with evidence requirement.
   - **Covers**: Phase 10 AC: zero-divergence parity run required.

3. `retirement_check_should_block_deferred_assertions_without_requirements`
   - **Input**: Deferred assertion missing runner/secret requirement.
   - **Expected**: Non-zero exit.
   - **Covers**: Phase 10 AC: deferred requirements documented.

4. `retirement_check_should_find_active_workflow_references`
   - **Input**: Temp workflow references a removed legacy script.
   - **Expected**: Check fails and reports workflow path.
   - **Covers**: Phase 10 AC: workflow reference scanning.

5. `migration_doc_should_include_script_retirement_states`
   - **Input**: Real `test/e2e/docs/MIGRATION.md`.
   - **Expected**: Lists not-started, migrated, parity-verified, deferred, and retired states as applicable.
   - **Covers**: Phase 10 AC: documented status.

**Test Implementation Notes:**

- Implement retirement as a mode of `check-parity-map.ts` to avoid a second validator command.
- Store parity evidence in `parity-map.yaml` under `parity-verified` script entries unless implementation reveals a strong reason for a separate deterministic artifact; tests should validate schema and gating.

---

## Phase 11: Clean the House - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-convention-lint.test.ts`
  - Current behavior: detects new legacy scripts without parity map entries.
  - Required changes: detect retired wrappers and forbid duplicated helper logic after wrapper conversion.
- `test/e2e/scenario-framework-tests/e2e-scenarios-workflow.test.ts`
  - Current behavior: validates workflow invocation.
  - Required changes: assert retired paths call scenario runner.

**New Tests to Create:**

1. `retired_legacy_wrappers_should_delegate_to_scenario_runner`
   - **Input**: Retired legacy script wrapper.
   - **Expected**: Static scan finds a scenario runner invocation and no monolithic legacy helper body.
   - **Covers**: Phase 11 AC: no unverified legacy coverage removed, clear entrypoints.

2. `workflow_references_should_use_scenario_runner_for_retired_paths`
   - **Input**: Workflow YAML plus retirement statuses.
   - **Expected**: Workflows do not call retired legacy script internals directly.
   - **Covers**: Phase 11 AC: workflows updated.

3. `docs_should_explain_new_scenario_suite_assertion_and_mapping_flow`
   - **Input**: `test/e2e/docs/README.md` and `MIGRATION.md`.
   - **Expected**: Docs mention adding a scenario, suite, assertion ID, parity mapping, and inventory regeneration.
   - **Covers**: Phase 11 AC: contributor guidance.

4. `full_parity_report_should_have_no_unmapped_assertions`
   - **Input**: Real final inventory/map and coverage report.
   - **Expected**: Coverage report unmapped count is zero.
   - **Covers**: Phase 11 AC: full parity report complete.

**Test Implementation Notes:**

- Keep legacy wrappers executable so existing user/workflow entrypoints remain compatible.
- Regression tests should make accidental reintroduction of monolithic scripts visible.

---

## Cross-Phase Test Fixtures

Create small reusable fixture helpers for:

- Temp E2E repo layout: `test/e2e/test-*.sh`, `test/e2e/docs/parity-map.yaml`, workflow files.
- Legacy/scenario log pairs with `PASS:` and `FAIL:` lines.
- Synthetic inventory JSON with mapped, deferred, retired, not-started, and unknown assertions.
- Workflow YAML parser helpers for `.github/workflows/*` checks.

## Validation Boundary

Unit tests prove parser correctness, schema enforcement, strict comparison behavior, coverage reporting, workflow wiring, and retirement gates. Live side-by-side runs for cloud, GPU, messaging, Spark, Launchable, and Brev are covered by the validation plan and CI/manual validation, not by local deterministic tests.
