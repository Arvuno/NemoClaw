# Test Specification: New E2E Model

Generated from: `specs/2026-05-14_new-e2e-model/spec.md`

## Existing Test Patterns

Use the existing scenario framework tests under `test/e2e/scenario-framework-tests/`:

- `e2e-scenario-schema.test.ts` for YAML schema validation.
- `e2e-scenario-resolver.test.ts` and `e2e-scenario-first-migration.test.ts` for plan resolution and legacy compatibility.
- `e2e-coverage-report.test.ts` and `e2e-parity-map.test.ts` for coverage/parity output.
- `e2e-scenarios-workflow.test.ts` for GitHub Actions workflow behavior.
- Shell runner behavior should be covered through existing scenario framework tests before adding new live E2E tests.

## Phase 1: Layered Terminology and Schema Planning - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-scenario-schema.test.ts`
  - Current behavior: validates existing `setup_scenarios`, expected states, and suite references.
  - Required changes: accept `base_scenarios`, `onboarding_profiles`, `test_plans`, `onboarding_assertions`, and `alias_for_plan`.
- `test/e2e/scenario-framework-tests/e2e-scenario-resolver.test.ts`
  - Current behavior: resolves current scenario IDs into executable plans.
  - Required changes: verify layered plan IDs and legacy aliases resolve to equivalent executable plans.

**New Tests to Create:**

1. `test_should_resolve_legacy_scenario_alias_to_layered_plan`
   - **Input**: `ubuntu-repo-cloud-openclaw`
   - **Expected**: resolved plan references `ubuntu-repo-docker`, `cloud-nvidia-openclaw`, expected state, onboarding assertion IDs, and suite IDs.
   - **Covers**: legacy scenario compatibility.
2. `test_should_resolve_layered_plan_id_directly`
   - **Input**: `ubuntu-repo-docker__cloud-nvidia-openclaw`
   - **Expected**: same plan shape as the legacy alias.
   - **Covers**: new plan ID support.
3. `test_should_fail_when_plan_references_missing_layer`
   - **Input**: fixture YAML with a missing base, onboarding profile, expected state, assertion, or suite.
   - **Expected**: resolver fails fast with a clear missing-reference message.
   - **Covers**: compatibility rules.
4. `test_should_emit_layered_plan_json_sections`
   - **Input**: plan-only resolution for a positive plan.
   - **Expected**: JSON contains separate `base`, `onboarding`, `expected_state`, `onboarding_assertions`, and `suites` sections.
   - **Covers**: plan output acceptance criteria.

**Test Implementation Notes:**

- Prefer in-memory or fixture YAML tests over live E2E execution.
- Keep `run-scenario.sh --plan-only` tests deterministic and offline.
- Assert exact error prefixes/messages so workflow failures are actionable.

## Phase 2: Layered Coverage and Gap Reports - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-coverage-report.test.ts`
  - Required changes: expect base scenario, onboarding profile, test plan, suite, and parity-by-layer sections.
- `test/e2e/scenario-framework-tests/e2e-parity-map.test.ts`
  - Required changes: accept explicit `layer` fields and inferred/default layer during transition.

**New Tests to Create:**

1. `test_should_accept_explicit_parity_layer_metadata`
   - **Input**: parity entries with allowed layers.
   - **Expected**: validation passes.
   - **Covers**: layer metadata support.
2. `test_should_reject_unknown_parity_layer`
   - **Input**: parity entry with an unsupported layer.
   - **Expected**: validation fails with allowed values listed.
   - **Covers**: schema guardrails.
3. `test_should_render_top_deferred_gap_domains`
   - **Input**: parity fixture with deferred entries by layer/domain.
   - **Expected**: summary includes sorted top deferred gap domains.
   - **Covers**: gap reporting.
4. `test_should_write_summary_markdown_to_reports_directory`
   - **Input**: coverage report command.
   - **Expected**: `.e2e/reports/summary.md` exists and includes layered coverage tables.
   - **Covers**: report artifact generation.

**Test Implementation Notes:**

- Use fixture parity maps to avoid depending on full generated inventory counts.
- Keep inference fallback behavior explicit in assertions.

## Phase 3: Onboarding Assertion Stage - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-scenario-resolver.test.ts`
  - Required changes: validate known onboarding assertion IDs.
- `test/e2e/scenario-framework-tests/e2e-suite-runner.test.ts`
  - Required changes: verify onboarding assertions run before expected-state validation and suites.

**New Tests to Create:**

1. `test_should_run_onboarding_assertions_before_expected_state`
   - **Input**: fake plan with two assertion scripts and a fake expected-state validator.
   - **Expected**: execution order is install/onboard, assertions, expected state, suites.
   - **Covers**: runner flow.
2. `test_should_stop_at_onboarding_assertion_failure`
   - **Input**: assertion script returns non-zero.
   - **Expected**: expected-state validation and suites do not run; failure layer is `onboarding-assertions`.
   - **Covers**: failure isolation.
3. `test_should_emit_stable_pass_fail_markers`
   - **Input**: initial assertion scripts.
   - **Expected**: logs include `PASS:` or `FAIL:` IDs for each assertion.
   - **Covers**: parity mapping support.
4. `test_should_assert_negative_preflight_leaves_no_ghost_state`
   - **Input**: negative preflight plan fixture.
   - **Expected**: gateway/sandbox absent assertions run and pass in fixture environment.
   - **Covers**: negative scenario behavior.

**Test Implementation Notes:**

- Use temporary fake assertion scripts for runner sequencing tests.
- Do not require Docker or real sandboxes for unit-level runner tests.

## Phase 4: Onboarding Matrix Expansion - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-scenario-schema.test.ts`
  - Required changes: validate new onboarding profile fields for provider, agent, messaging, web-search, lifecycle, and secret requirements.

**New Tests to Create:**

1. `test_should_validate_onboarding_profile_variants`
   - **Input**: profiles for OpenAI-compatible, Brave, messaging, Hermes messaging, resume, repair, double-onboard, provider switch, and token rotation.
   - **Expected**: schema validation passes.
   - **Covers**: profile expansion.
2. `test_should_reject_incompatible_base_and_onboarding_profile`
   - **Input**: profile requiring unavailable runner/secret on a base plan.
   - **Expected**: plan-time compatibility failure.
   - **Covers**: compatibility rules.
3. `test_should_report_onboarding_profile_coverage_independently`
   - **Input**: coverage command with multiple profiles and limited plans.
   - **Expected**: report shows covered and uncovered onboarding profiles separately from bases.
   - **Covers**: coverage visibility.

**Test Implementation Notes:**

- Avoid full Cartesian matrix tests; use representative profiles and compatibility fixtures.

## Phase 5: Post-Onboard Suite Reorganization - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-suite-runner.test.ts`
  - Required changes: preserve old suite alias behavior while validating new family suite IDs.
- `test/e2e/scenario-framework-tests/e2e-coverage-report.test.ts`
  - Required changes: group suite coverage by feature family.

**New Tests to Create:**

1. `test_should_resolve_new_suite_family_ids`
   - **Input**: representative suite IDs from gateway, sandbox, inference, messaging, security, lifecycle, and diagnostics families.
   - **Expected**: suites resolve and expose scripts/requires_state.
   - **Covers**: suite expansion.
2. `test_should_resolve_old_suite_aliases_during_transition`
   - **Input**: existing suite IDs.
   - **Expected**: resolver maps aliases to current suite definitions.
   - **Covers**: transition compatibility.
3. `test_should_prevent_suite_from_running_install_or_onboard_steps`
   - **Input**: suite definition containing disallowed install/onboard behavior if modeled in metadata or lint rules.
   - **Expected**: convention lint fails.
   - **Covers**: suite boundary.
4. `test_should_group_suite_report_by_feature_family`
   - **Input**: suite report fixture.
   - **Expected**: report groups post-onboard assertions by suite family.
   - **Covers**: report readability.

**Test Implementation Notes:**

- Prefer metadata/convention tests for suite boundaries; avoid brittle script-content assertions except for obvious forbidden entrypoints.

## Phase 6: Workflow and Report Visibility - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-scenarios-workflow.test.ts`
  - Required changes: verify scenario and parity workflows append layered summaries to `$GITHUB_STEP_SUMMARY`.

**New Tests to Create:**

1. `test_should_append_scenario_summary_to_github_step_summary`
   - **Input**: workflow YAML.
   - **Expected**: step appends `.e2e/reports/summary.md` or equivalent layered summary to `$GITHUB_STEP_SUMMARY`.
   - **Covers**: Actions visibility.
2. `test_should_append_parity_gap_summary_to_github_step_summary`
   - **Input**: parity workflow YAML.
   - **Expected**: workflow appends parity/gap summary markdown.
   - **Covers**: parity visibility.
3. `test_should_preserve_failure_layer_in_report`
   - **Input**: fake failed run at base, onboarding, expected-state, and suite layers.
   - **Expected**: report identifies the failing layer.
   - **Covers**: failure diagnosis.
4. `test_should_emit_gap_report_json_and_markdown`
   - **Input**: gap report command.
   - **Expected**: `gap-report.json` and `gap-report.md` exist with layer/domain counts.
   - **Covers**: machine and human reports.

**Test Implementation Notes:**

- Test workflow YAML statically; do not require GitHub Actions execution.

## Phase 7: Clean the House - Test Guide

**Existing Tests to Modify:**

- `test/e2e/scenario-framework-tests/e2e-metadata-final-hygiene.test.ts`
  - Required changes: enforce that duplicate legacy definitions require explicit compatibility reasons.
- `test/e2e/scenario-framework-tests/e2e-convention-lint.test.ts`
  - Required changes: prevent new legacy `test/e2e/test-*.sh` entrypoints for migrated functionality.

**New Tests to Create:**

1. `test_should_reject_duplicate_scenario_without_alias_reason`
   - **Input**: duplicated `setup_scenarios` entry with no compatibility reason.
   - **Expected**: lint fails.
   - **Covers**: cleanup source of truth.
2. `test_should_reject_obsolete_suite_alias_without_reason`
   - **Input**: old suite alias after cleanup phase.
   - **Expected**: lint fails unless allowlisted.
   - **Covers**: suite cleanup.
3. `test_should_document_layered_model_as_source_of_truth`
   - **Input**: docs files.
   - **Expected**: README and MIGRATION describe base scenarios, onboarding profiles, test plans, onboarding assertions, expected states, and post-onboard suites.
   - **Covers**: final docs.
4. `test_should_prevent_new_legacy_test_entrypoints`
   - **Input**: file list with a new `test/e2e/test-*.sh` entrypoint not allowlisted.
   - **Expected**: convention lint fails.
   - **Covers**: no regression to one-off scripts.

**Test Implementation Notes:**

- Make final hygiene tests phase-gated or allowlist-based until cleanup begins.
- Acceptance validation should run scenario-framework tests plus `npx prek run --all-files` when practical.
