---
name: nemoclaw-maintainer-acceptance-audit
description: Audits a PR against its linked issue via strict literal-clause match. Extracts every named clause from the issue body and comments (template-aware for bug_report / feature_request / doc_issue), maps each to evidence in the PR diff (file:line / test name / commit) via a tiered match (substring → all-tokens-within-K=4 → fail), produces a perfect-match table that flags missing clauses or surplus files. Use when reviewing a PR that claims to close an issue, before merge, or when an acceptance-criteria gap is suspected. Standalone version of `issue-autopilot` Stage 9. Local-only, drafts only.
---

# Acceptance Audit

When a PR claims to "close #N", does it actually cover every clause in the issue's acceptance criteria — nothing more, nothing less? This skill answers with a literal clause-by-clause map.

## Why this matters

In the 2026-05-13/14 session, PR #3501 was reported as "100% acceptance match" but a strict audit caught a missed clause: the issue explicitly listed `openclaw.json keys` as one of the 10 commonly-changed items the table should classify, but my mutability table covered it only implicitly via the model/provider/channels/agents.list rows. 17/18 — would have shipped at 95% match if the user hadn't asked "did the skill accept entire acceptance criteria?"

The lesson — encoded in `issue-autopilot` Stage 9 and replicated here as a standalone callable: **literal clause extraction from issue body, not paraphrased keyword matching**. A named item in the issue gets its own row.

## Invocation

```text
/nemoclaw-maintainer-acceptance-audit <issue-number> <pr-number>
```

Or with autodetection (skill scans the PR body for `Closes #N` / `Fixes #N`):

```text
/nemoclaw-maintainer-acceptance-audit --pr <pr-number>
```

Flags:

| Flag | Default | Meaning |
|------|---------|---------|
| `--strict` | `on` | Use literal clause extraction. If `off`, allow paraphrased matches (risky — only for spot checks). |
| `--include-comments` | `on` | Pull every issue comment and treat any "additional requirement" or "must also fix" as an extra clause. |
| `--surplus-check` | `on` | Flag any changed file in the PR that doesn't map to a clause as surplus. |
| `--draft-comment` | `off` | Output a copy-pasteable PR comment summarizing the audit. |

## Workflow

1. **Fetch issue body + all comments.** `gh api repos/<owner>/<repo>/issues/<N>/comments --paginate`.
2. **Detect issue template (hardening).** Read `.github/ISSUE_TEMPLATE/*.yml` to learn the repo's structured fields. Match the issue's labels against template labels (e.g. NemoClaw's `bug_report.yml` is `labels: [bug, status: triage]`). The matched template determines which section names are AUTHORITATIVE for clause extraction:
   - **bug_report template** → acceptance is "the Reproduction Steps no longer fail". Each step in `Reproduction Steps` is one clause; the implicit acceptance is "the PR's tests cover the bad case → good case for each step".
   - **feature_request template** → acceptance is `Proposed Design`. Each numbered/bulleted item in `Proposed Design` is one clause. `Problem Statement` is context, not acceptance.
   - **doc_issue template** → acceptance is `Suggested Fix` (if present) OR "Description's missing/broken thing is now correct in the affected page". `Affected Page` (single-line input) names the file that MUST appear in the PR diff.
   - **Free-form / unknown template** → fall back to the legacy section names below.
3. **Extract clauses** based on template detection:
   - From the AUTHORITATIVE section above (template-specific).
   - PLUS legacy fallback section names: `Expected Result` / `Acceptance` / `Proposed change` / `Suggested fix` / `Test strategy` / `Test plan` / `Steps to Reproduce` / any numbered list.
   - **For lists-of-items the issue calls out by name** (e.g. "for each commonly changed item (model, provider, …)"), each named item is its own clause. Use the verbatim phrase.
4. **Extract clauses from comments.** Any `also fix X` / `additional bug` / `must also cover Y` from issue commenters → additional clauses.
5. **Fetch PR diff.** `gh pr diff <pr-number>` and `gh pr view <pr-number> --json files,commits`.
6. **Per-clause evidence search.** For each clause:
   - Grep the diff for the verbatim phrase, expected file paths, expected function names.
   - Check unit/integration test additions for matching scenario coverage.
   - For bug_report-derived clauses (reproduction steps): the implicit acceptance is "test exists that reproduces the step and passes on the PR branch; same test fails on main". Run the missing-test injection check from `quick-wins/KARPATHY-LENS.md` Section 4.
   - For doc_issue-derived clauses with `Affected Page` set: that page MUST appear in `git diff --name-only origin/main..PR_HEAD` — if it doesn't, mark as MISSING regardless of other evidence.
   - Mark as `MET` / `MISSING` / `PARTIAL` / `INTENTIONALLY_SKIPPED` (with justification).
7. **Surplus check.** `git diff --name-only origin/main..PR_HEAD` — every changed file should trace to at least one MET clause. Anything that doesn't is surplus; flag for review.
8. **Emit report.** Markdown table:

   ```text
   | # | Clause (verbatim from issue) | Evidence | Status |
   |---|---|---|---|
   ```

9. **Final verdict.** `PERFECT_MATCH` / `GAPS:<N>` / `SURPLUS:<N>` / `BOTH`.

## Critical rule — verbatim, not paraphrased

Paraphrase masks gaps. Concrete example from #3501:

- Issue body: "for each commonly changed item (model, provider, policy preset, **openclaw.json keys**, agents.list, channel tokens, dashboard port, GPU passthrough, sandbox name, shields posture)"
- Audit pass that fails: "table has rows for model, provider, presets, agents.list, tokens, port, GPU, name, shields" → 9/10 passes because reviewer paraphrased "openclaw.json keys" as already-covered by adjacent rows.
- Audit pass that catches the gap: grep `openclaw.json keys` literally in the PR file → not present → MISSING.

The skill ALWAYS uses the literal phrase from the issue body. If the phrase contains punctuation/markdown that breaks grep, normalize before matching:

**Normalization rules (apply in this order):**

1. Strip backticks: `` `openclaw.json` keys `` → `openclaw.json keys`
2. Strip markdown emphasis: `*foo*` / `_foo_` → `foo`
3. Collapse whitespace to single spaces, lowercase both sides.

**Multi-token phrase matching:**
After normalization, if the phrase has >1 word, the **literal substring** check is too brittle (false-positive on docs that use the same concept with extra qualifier words). Use this tiered match:

1. **Tier 1 — literal substring.** If the normalized phrase appears as a contiguous substring in any table row / heading / paragraph, it's a MET match.
2. **Tier 2 — all-tokens-within-K-words.** If Tier 1 fails AND every token from the normalized phrase appears within K=4 words of each other in a single table row or heading, it's a MET match. (Catches "dashboard port" matching a row titled "Dashboard forward port" without false-positive on "dashboard … X … Y … port" spread across paragraphs.)
3. **Tier 3 — fail.** Otherwise MISSING.

**Reference failures this rule catches:**

- `openclaw.json keys` → Tier 1 fail on the original v1 PR (no row), Tier 2 fail (tokens scattered), Tier 3 MISSING. Correctly surfaces the bug. ✓
- `dashboard port` → Tier 1 fail (doc says "Dashboard forward port"), Tier 2 MET (`dashboard` and `port` within K=4 in row title "Dashboard forward port"). Correctly avoids the false positive. ✓
- `policy preset` → Tier 1 MET (doc has "Network policy preset" — substring match). ✓

## JSON sidecar output

Writes `/tmp/nemoclaw-skill-output-acceptance-audit-<run_id>.json`. Useful as the gate that `issue-autopilot` Stage 9 consumes programmatically.

**Envelope:** shared maintainer-skill schema (see `find-already-fixed/SKILL.md`).

**Per-result shape (single object, not array — one audit per run):**

```json
{
  "issue": 3230,
  "pr": 3501,
  "issue_url": "https://...",
  "pr_url": "https://...",
  "verdict": "PERFECT_MATCH" | "GAPS:N" | "SURPLUS:N" | "BOTH",
  "clauses_total": 18,
  "clauses_met": 17,
  "clauses": [
    { "ix": 1, "verbatim": "...", "status": "MET", "evidence": "docs/...:L34", "match_tier": 1 },
    { "ix": 4, "verbatim": "openclaw.json keys", "status": "MISSING", "evidence": null, "match_tier": null }
  ],
  "surplus_files": [],
  "recommended_actions": [
    "Add a row to the mutability table titled \"openclaw.json keys\""
  ]
}
```

`results.verdict == "PERFECT_MATCH"` is the only state in which `issue-autopilot` Stage 9 should report READY FOR HUMAN REVIEW. Anything else MUST halt Stage 9 with `recommended_actions` surfaced.

## Output discipline

Per audit:

```text
=== Acceptance audit: issue #3230 vs PR #3501 ===

VERDICT: GAPS:1 (was caught + fixed during the autopilot run)

Clauses extracted: 18
Clauses MET: 17
Clauses MISSING: 1 — "openclaw.json keys" (item #4 in the mutability list)
Surplus files: 0

| # | Clause | Evidence | Status |
|---|---|---|---|
| 1 | `shields up` documented | docs/manage-sandboxes/runtime-controls.md:### shields up | MET |
| ... | ... | ... | ... |
| 4 | for each commonly changed item ... openclaw.json keys ... | (no row matching "openclaw.json keys" literally) | MISSING |
| ... | ... | ... | ... |

Recommended action:
- Add a row to the mutability table titled "openclaw.json keys" classifying it
  as locked under shields up / runtime-editable under shields down.
- Re-run audit after the fix to confirm PERFECT_MATCH.
```

## Halt conditions (the non-obvious ones)

- **Issue body has no detectable acceptance section** (no Expected / Acceptance / template-derived signal) → halt; ask the maintainer where the acceptance lives. Don't guess from prose — guessing is what caused the #3230 paraphrase gap.
- **>30 clauses extracted** → the issue should probably be split into sub-issues before review. Pause.

## Hard nos

- Output is verdict + recommended actions only. No PR edits, no comments, no approvals.

## Reference (the paraphrase trap)

The #3230 → #3501 dry-run: the issue body listed "for each commonly changed item (model, provider, …, `openclaw.json keys`, …)" — 10 named items, each its own clause. The PR's mutability table covered 9 of 10; "openclaw.json keys" was implicit-via-adjacent-rows but not literal. First audit pass paraphrased and shipped 17/18 as PERFECT_MATCH. Tier-1 literal-substring check would have caught it; the skill now enforces that as the default.

The lesson: **named items in lists are clauses, not keywords.** Paraphrasing collapses them; verbatim extraction preserves them.
