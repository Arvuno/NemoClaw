---
name: nemoclaw-maintainer-ci-flake-triage
description: Classifies a failing CI check as PR_CAUSED / PRE_EXISTING_FLAKE / INFRASTRUCTURE / UNCLEAR. Combines diff-overlap detection, recent main-history comparison, multi-rerun reproducibility analysis, and infrastructure-signature greps to produce a verdict with evidence in ~2 min instead of ~12 min of manual log digging. Tracks flake history at /tmp/flake-history.jsonl and auto-elevates chronic flakes (7+ hits in 14 days) to INFRASTRUCTURE. Use when a PR's CI is red and the question is "is this me?" before going deeper on a fix. Local-only.
---

# CI Flake Triage

When a PR shows red CI, the maintainer's first 5 minutes are deciding: "is this MY fault, or is the test broken?" This skill answers that, fast, with evidence.

## Why this matters

In the 2026-05-13/14 session, multiple PR runs surfaced failures that turned out to be unrelated to the diff:

- PR #3409: `macos-e2e` failing on `test/cli.test.ts:1310` (logs/debug test) — pre-existing flake on main HEAD `edb7478a2`
- PR #3501: `test-e2e-port-overrides` failing on Test #4 first run, Test #6 second run — same code, different sub-tests = nondeterministic flake
- PR #3498 etc.: pre-existing 5s testTimeout flakes in `onboard-probes`, `dns-proxy`, `cli`, `repro-2666`, `onboard`

Without a fast triage step, a maintainer spends ~15 min per red check chasing a ghost. This skill collapses that to ~2 min with a clear verdict.

## Invocation

```text
/nemoclaw-maintainer-ci-flake-triage <PR-number> [check-name]
```

If `check-name` is omitted, the skill picks the first FAILURE in the PR's status check rollup.

Flags:

| Flag | Default | Meaning |
|------|---------|---------|
| `--main-history N` | `5` | How many recent main runs to compare against |
| `--time-budget-min` | `2` | Pause + ask if triage hasn't reached a verdict |
| `--fetch-logs` | `on` | Pull the failing-step log (50KB max) for the verdict |

## Verdict taxonomy

| Verdict | Definition | Recommended action |
|---|---|---|
| `PR_CAUSED` | The diff touches code reachable by the failing test, AND the same test passes on recent main, AND the failure message matches a regression pattern. | Fix the PR — drop into Stage 4 of `issue-autopilot` if a clear fix is obvious, otherwise ask user. |
| `PRE_EXISTING_FLAKE` | The failing check has failed on at least one of the last N main runs OR the same test fails on this PR rerun-fresh with no code change. | Note the flake in the PR comments, do NOT block on it. |
| `INFRASTRUCTURE` | The error is platform-runtime (Docker daemon, runner network, GH API 502, dist not present), not a test assertion failure. | Rerun the check; if it recurs, surface to platform owners. |
| `UNCLEAR` | Insufficient signal — log truncated, test name doesn't map to diff cleanly, main history is short. | Halt, surface evidence, ask user. |

## Workflow

1. **Fetch the PR's check rollup.** `gh pr view <N> --json statusCheckRollup`.
2. **Pick the failing check.** Explicit `check-name` argument, or first `conclusion=FAILURE`.
3. **Get the failing-step log tail.** `gh run view <run-id> --log-failed | tail -100`.
4. **Identify the failing test/assertion.** Parse the log for `FAIL:`, `Error:`, `AssertionError`, `expect(...).toBe(...)`, `Test timed out`, etc. Extract the test name + file:line.
5. **Diff-overlap check.** `git diff --name-only origin/main..PR_HEAD` — does the test file (or files the test imports / files in the same package) appear in the diff?
   - YES + clear reachability → leans `PR_CAUSED`
   - NO overlap → leans `PRE_EXISTING_FLAKE` or `INFRASTRUCTURE`
6. **Main-history check.** For the same workflow/job/check, look at the last `--main-history N` main runs:
   - Same check failed on main recently → strong `PRE_EXISTING_FLAKE` signal
   - Same check passing consistently on main → strong `PR_CAUSED` signal (assuming step 5 also points there)

   ```bash
   gh run list --workflow=<workflow> --branch=main --limit=N --json conclusion,headSha,createdAt
   ```

7. **Multi-run reproducibility.** If the PR has multiple recent reruns, check whether different tests fail across reruns:
   - Different tests failing each rerun → nondeterministic flake (`PRE_EXISTING_FLAKE` even if not on main yet — the test fixture is unstable).
8. **Infrastructure signature check.** Grep the log for:
   - `cannot connect to docker daemon` / `Docker daemon not running`
   - `502 Bad Gateway` / `503 Service Unavailable`
   - `ENETUNREACH` / `ETIMEDOUT` on github.com
   - `Module ... has no exported member` (stale dist; rebuild)
   - `runc create failed`
9. **Emit verdict.** A short paragraph + evidence table + recommended action.
10. **Append to flake history.** See "Flake history database" section below.

## Flake history database (hardening — auto-elevate chronic flakes)

Every PRE_EXISTING_FLAKE and INFRASTRUCTURE verdict appends one line to `/tmp/flake-history.jsonl`:

```json
{"ts":"2026-05-14T...","run_id":"...","pr":3501,"check_name":"test-e2e-port-overrides","verdict":"PRE_EXISTING_FLAKE","failing_test":"Test #4 ...","main_history_hit":false}
```

Before emitting a final verdict, query the history for recent hits on the same `check_name`:

```bash
RECENT_HITS=$(jq -c "select(.check_name == \"$CHECK_NAME\" and (.ts | fromdateiso8601) > (now - 1209600))" /tmp/flake-history.jsonl | wc -l | tr -d ' ')
if [ "$RECENT_HITS" -ge 7 ]; then
  echo "  ⚠ $CHECK_NAME has been flagged $RECENT_HITS times in the last 14 days"
  echo "  AUTO-ELEVATE: PRE_EXISTING_FLAKE → INFRASTRUCTURE"
  echo "  RECOMMENDED ACTION: file a fix-up issue tagged 'ci-infra' for this check"
fi
```

**Elevation rule:**

- ≥7 hits in 14 days → auto-elevate `PRE_EXISTING_FLAKE` → `INFRASTRUCTURE` and prepend an action to file a tracking issue.
- ≥3 hits in 7 days → keep the original verdict but add a "consider filing a flake-fix issue" recommendation.

The auto-filed issue draft template:

```markdown
**Title:** ci: stabilize chronic flake in `<check_name>`

**Body:**
This check has been flagged as flaky 7+ times in the last 14 days (see /tmp/flake-history.jsonl, runs <run_ids>).

Pattern: <multi_rerun_pattern field from the latest triage>
Failing test(s): <list>
Latest run: <url>

Action: investigate the underlying nondeterminism in the test fixture or runner setup. PRs blocked on this check should not be held up.
```

The history file is local-only by default; never committed. It survives between runs because `/tmp` typically persists across shell sessions on macOS/Linux; if the maintainer wants persistent history across reboots, move it to `~/.nemoclaw/flake-history.jsonl`.

## JSON sidecar output

Writes `/tmp/nemoclaw-skill-output-ci-flake-triage-<run_id>.json`. Consumed by `issue-autopilot` Stage 7 (CI watch) to decide whether to halt or proceed.

**Envelope:** shared maintainer-skill schema (see `find-already-fixed/SKILL.md`).

**Per-result shape:**

```json
{
  "pr": 3501,
  "check_name": "test-e2e-port-overrides",
  "check_url": "https://...",
  "verdict": "PR_CAUSED" | "PRE_EXISTING_FLAKE" | "INFRASTRUCTURE" | "UNCLEAR",
  "confidence": "high" | "medium" | "low",
  "evidence": {
    "failing_test": "Test #4 \"Privileged port 80 rejected by entrypoint\"",
    "diff_overlap": false,
    "main_history": [{"sha": "...", "conclusion": "success", "createdAt": "..."}],
    "multi_rerun_pattern": "different-tests-different-reruns"
  },
  "recommended_action": "Add PR comment noting flake; do NOT block on this check",
  "draft_pr_comment": null
}
```

If verdict is `PRE_EXISTING_FLAKE` or `INFRASTRUCTURE`, callers should NOT halt on the failure. If `PR_CAUSED`, callers must address it. `UNCLEAR` halts and asks the user.

## Output discipline

```text
=== CI flake triage: PR #3501 / test-e2e-port-overrides ===

VERDICT: PRE_EXISTING_FLAKE (high confidence)

Evidence:
- Failing test: Test #4 "Privileged port 80 rejected by entrypoint" (e2e-port-overrides.sh:104-110)
- PR diff: only docs/* files touched — zero overlap with port-validation code
- Main history: gpu-e2e_25842713195 (today, success), 25843401869 (today, success), prior 5 runs all success
- Multi-rerun reproducibility: Test #4 failed on commit 1771ce6c2, Test #6 failed on commit d1b9a4115 — different tests, same script, same source = nondeterministic stderr capture in fixture

Recommended action:
- Add a one-line PR comment noting the flake and link to a separate flake-triage issue
- File `test/e2e-port-overrides.sh:107` stderr-capture race as a follow-up issue
- Do NOT block PR #3501 on this check
```

## Halt conditions

- Verdict reached → emit and stop.
- `UNCLEAR` after 2-min budget → halt; this is usually a log-truncation case where the failure-message parser couldn't pin the failing test.

## Hard nos

- Verdict-only. No flake fixes, no CI reruns, no PR comments posted. The `recommended_action` field tells the caller what to do; the caller decides.

## Reference run

PR #3501 wsl-e2e and macos-e2e both passed; only `test-e2e-port-overrides` failed across 2 reruns on docs-only commits. Verdict `PRE_EXISTING_FLAKE` was reached in <60s via main-history check + diff-overlap check + multi-rerun reproducibility. Canonical happy path.
