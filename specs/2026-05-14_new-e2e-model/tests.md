# Test Specification: New E2E Model

Generated from: `specs/2026-05-14_new-e2e-model/spec.md`

## Test Strategy

Use existing Vitest scenario-framework tests under `test/e2e/scenario-framework-tests/`. Keep tests plan-first and avoid live E2E execution except where explicitly required by later implementation phases.

## Phase 1: Layered Terminology and Schema Planning - Test Guide

**Existing Tests to Modify:**
- `e2e-scenario-schema.test.ts`
  - Validate `base_scenarios`, `onboarding_profiles`, `test_plans`, `alias_for_plan`, optional `runner_requirements`, and optional `expected_failure`.
- `e2e-scenario-resolver.test.ts`
  - Keep legacy ID resolution working and add direct test-plan resolution.
- `e2e-convention-lint.test.ts`
  - Enforce stable IDs and no broken script/path references for layered metadata.

**New Tests to Create:**
1. `test_should_resolve_legacy_scenario_alias_to_layered_plan`
   - **Input**: `ubuntu-repo-cloud-openclaw`
   - **Expected**: resolved plan includes legacy `scenario_id` plus `base`, `onboarding`, `expected_state`, `onboarding_assertions`, and `suites` sections.
   - **Covers**: legacy workflow compatibility.
2. `test_should_resolve_layered_test_plan_directly`
   - **Input**: `ubuntu-repo-docker__cloud-nvidia-openclaw`
   - **Expected**: same executable plan as the alias target, with distinct base/onboarding IDs.
   - **Covers**: new source-of-truth plan IDs.
3. `test_should_preserve_capability_and_expected_failure_metadata`
   - **Input**: GPU plan and no-Docker negative plan.
   - **Expected**: plan JSON includes `runner_requirements` and `expected_failure` metadata without enforcing live capabilities.
   - **Covers**: #3604/#3608 schema-shaping hooks.
4. `test_should_fail_fast_for_missing_layer_references`
   - **Input**: fixture plans with missing base, onboarding, expected state, assertion, and suite IDs.
   - **Expected**: clear resolver errors naming the missing reference.
   - **Covers**: compatibility rules.
5. `test_should_reject_declared_metadata_incompatibility_without_live_secret_or_capability_checks`
   - **Input**: fixture plan whose onboarding profile declares runner/secret requirements that conflict with base metadata.
   - **Expected**: resolver reports a metadata compatibility error, and tests assert no environment secret lookup or live capability command is invoked.
   - **Covers**: Phase 1 metadata-only compatibility boundary.
6. `test_should_print_layered_plan_only_without_running_e2e`
   - **Input**: `bash test/e2e/runtime/run-scenario.sh <plan> --plan-only`
   - **Expected**: exits 0 and prints/resolves layered plan only.
   - **Covers**: no live E2E behavior changes.

**Test Implementation Notes:**
- Use `loadMetadataFromObjects` for negative fixtures.
- Use real metadata only for canonical existing scenarios.
- Snapshot only stable JSON keys; avoid brittle full-output snapshots.

## Phase 2: Layered Coverage and Gap Reports - Test Guide

**Existing Tests to Modify:**
- `e2e-coverage-report.test.ts`
  - Add sections for base scenarios, onboarding profiles, test plans, suites, and parity by layer.
- `e2e-parity-map.test.ts`
  - Accept explicit `layer` and `gap_domain`; infer/default layer during transition.

**New Tests to Create:**
1. `test_should_render_layered_coverage_sections`
   - **Input**: real metadata.
   - **Expected**: report contains base, onboarding, test plan, suite, and parity-by-layer sections.
2. `test_should_accept_deferred_assertion_with_explicit_layer_and_gap_domain`
   - **Input**: parity-map fixture entry.
   - **Expected**: validation passes and report aggregates under that layer/domain.
3. `test_should_infer_layer_for_deferred_assertion_without_layer`
   - **Input**: transitional legacy entry.
   - **Expected**: validation passes with inferred/default layer marker.
4. `test_should_write_summary_markdown_for_local_report_artifact`
   - **Input**: coverage command.
   - **Expected**: `.e2e/reports/summary.md` exists and contains layered tables for local artifact and future workflow use.

## Phase 3: Onboarding Assertion Stage - Test Guide

**Existing Tests to Modify:**
- `e2e-scenario-resolver.test.ts`
  - Validate assertion IDs referenced by plans.
- `e2e-suite-runner.test.ts`
  - Verify execution order: onboarding assertions before expected-state validation and suites.
- `e2e-parity-map.test.ts`
  - Verify stable assertion IDs are mappable.

**New Tests to Create:**
1. `test_should_run_onboarding_assertions_before_expected_state`
   - **Input**: stub scripts writing stage markers.
   - **Expected**: marker order is install/onboard → assertions → expected-state → suites.
2. `test_should_fail_for_missing_onboarding_assertion_reference`
   - **Input**: plan referencing unknown assertion.
   - **Expected**: resolver error names the missing assertion.
3. `test_should_emit_stable_pass_fail_assertion_ids`
   - **Input**: assertion script fixtures.
   - **Expected**: output contains `PASS:`/`FAIL:` IDs from metadata.
4. `test_should_assert_no_ghost_state_for_negative_preflight_plan`
   - **Input**: no-Docker expected-failure plan fixture.
   - **Expected**: gateway/sandbox absent assertions are selected.

## Phase 4: Onboarding Matrix Expansion - Test Guide

**Existing Tests to Modify:**
- `e2e-scenario-additional-families.test.ts`
  - Require profiles/plans for OpenAI-compatible, messaging providers, Hermes messaging, lifecycle variants, and token rotation.
- `e2e-scenario-resolver.test.ts`
  - Add unsupported combination failures.

**New Tests to Create:**
1. `test_should_list_onboarding_profiles_independently_from_base_coverage`
2. `test_should_fail_plan_time_for_unsupported_base_onboarding_combination`
3. `test_should_reduce_deferred_counts_for_migrated_onboarding_domains`

## Phase 5: Post-Onboard Suite Reorganization - Test Guide

**Existing Tests to Modify:**
- `e2e-suite-runner.test.ts`
  - Ensure suites do not install/onboard and consume `$E2E_CONTEXT_DIR/context.env`.
- `e2e-coverage-report.test.ts`
  - Group suite coverage by feature family.

**New Tests to Create:**
1. `test_should_preserve_old_suite_ids_as_aliases`
2. `test_should_group_suite_report_by_feature_family`
3. `test_should_reject_suite_that_declares_install_or_onboard_step`
4. `test_should_map_high_value_deferred_domains_to_suite_ids`

## Phase 6: Workflow and Report Visibility - Test Guide

**Existing Tests to Modify:**
- `e2e-scenarios-workflow.test.ts`
  - Validate scenario and parity workflow summaries.

**New Tests to Create:**
1. `test_should_append_scenario_layer_summary_to_github_step_summary`
2. `test_should_append_parity_gap_summary_to_github_step_summary`
3. `test_should_record_failing_layer_in_report`
4. `test_should_emit_gap_report_json_and_markdown`

## Phase 7: Clean the House - Test Guide

**Existing Tests to Modify:**
- `e2e-metadata-final-hygiene.test.ts`
  - Fail duplicate legacy definitions without explicit compatibility reason.
- `e2e-convention-lint.test.ts`
  - Fail new legacy `test/e2e/test-*.sh` entrypoints.

**New Tests to Create:**
1. `test_should_not_allow_unexplained_duplicate_scenario_definitions`
2. `test_should_not_allow_new_legacy_e2e_entrypoints`
3. `test_should_keep_documented_layered_model_as_source_of_truth`

## Commit/Validation Commands

- Scenario framework focus: `npx vitest run test/e2e/scenario-framework-tests`
- Plan-only smoke: `bash test/e2e/runtime/run-scenario.sh ubuntu-repo-cloud-openclaw --plan-only`
- Direct plan smoke: `bash test/e2e/runtime/run-scenario.sh ubuntu-repo-docker__cloud-nvidia-openclaw --plan-only`
