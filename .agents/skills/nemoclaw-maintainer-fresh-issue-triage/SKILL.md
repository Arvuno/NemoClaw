---
name: nemoclaw-maintainer-fresh-issue-triage
description: Automates first-touch triage for net-new issues filed in the last 24-48h. Reads the issue body, detects which ISSUE_TEMPLATE was used (bug_report / feature_request / doc_issue), matches paths against CODEOWNERS to suggest area-labels and assignee, applies severity-keyword heuristics for priority, drafts a "needs-info" comment when a bug_report's Reproduction Steps section is empty, flags possible-duplicates. Use when reviewing the morning's fresh issue queue or when a freshly-filed issue needs first-touch labeling/repro-ask. Drafts only — never closes, never auto-applies without per-issue confirmation. Local-only.
---

# Fresh Issue Triage

When an issue is filed, somebody needs to touch it within 24-48h: apply the right area-labels, ask for repro if it's missing, propose a priority, suggest an assignee, mark it `status: triage` → `status: ready` if everything's in order. This is the highest-frequency-lowest-automation maintainer action in the daily flow.

This skill handles all of that as a draft pass — surfaces a per-issue triage proposal, the maintainer confirms or edits, then the skill applies the agreed actions (label, assignee, comment).

## Why this matters

In the 2026-05 maintainer workflow, fresh issues sat in `status: triage` for a median of 2-3 days before someone touched them. That delay compounds: reporters lose context, duplicate issues pile up, and the queue's "true open" count is overstated by stale-untriaged tickets. A 5-minute structured triage pass per issue beats a 30-minute deep-dive a week later.

The skill is **judgment-augmenting**, not judgment-replacing — every suggestion is a draft the maintainer approves.

## Invocation

```text
/nemoclaw-maintainer-fresh-issue-triage
```

Flags:

| Flag | Default | Meaning |
|------|---------|---------|
| `--since` | `48h` | Time window: `24h`, `48h`, `7d`, or an ISO date |
| `--top N` | `20` | Maximum candidates to surface |
| `--apply` | `off` | If on, apply confirmed actions automatically (default off — drafts only) |
| `--include-untouched-only` | `on` | Skip issues that already have non-`triage` labels (someone else triaged them) |
| `--require-repro-for-bug` | `on` | If a `bug` issue has empty Reproduction Steps, draft a needs-info comment |

## Workflow

1. **Fetch fresh issues.**

   ```bash
   gh issue list --repo NVIDIA/NemoClaw --state open \
     --search "created:>=$(date -v-48H +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -d '48 hours ago' +%Y-%m-%dT%H:%M:%S)" \
     --json number,title,body,labels,author,createdAt,comments
   ```

2. **Skip if already triaged.** If `--include-untouched-only on`, skip any issue whose labels don't include `status: triage` OR whose labels are non-empty beyond `bug` / `enhancement` / `documentation`.

3. **Detect issue template.** Match the issue's labels against `.github/ISSUE_TEMPLATE/*.yml` `labels:` field to identify which template was used:
   - `bug_report` → expect Description + Reproduction Steps + Environment + Debug Output + Logs sections
   - `feature_request` → expect Problem Statement + Proposed Design + Category sections
   - `doc_issue` → expect Description + Affected Page + Issue Type sections
   - Unknown → free-form; treat as bug-shaped by default

4. **Per-issue triage proposal** — produce a structured suggestion:

   **a. Area-labels (from CODEOWNERS path-match).**
   - Extract paths mentioned in the body (regex: `\b(?:src/|nemoclaw/|nemoclaw-blueprint/|bin/|scripts/|docs/|test/)[a-zA-Z0-9_./\-]+`).
   - For each path, find the last-matching CODEOWNERS pattern (use the same Python helper from `quick-wins/SKILL.md`).
   - Translate team handle to area-label: `@NVIDIA/nemoclaw-security` → `area: security`, `@NVIDIA/nemoclaw-engineer` → `area: cli`/`area: plugin` (heuristic on path), `@NVIDIA/nemoclaw-maintainer` → leave as fallback (no specific area label).
   - If no paths in body → infer area from title keywords: "docs" → `documentation`, "onboard" → `area: onboard`, "policy" / "egress" → `area: security`, etc.

   **b. Priority (severity keyword heuristic).**
   - Body or title contains `crash`, `segfault`, `data loss`, `silent failure`, `production` → suggest `priority: high`.
   - Body contains `nice to have`, `would be nice`, `low priority` → suggest `priority: low`.
   - Default → `priority: medium`.
   - For `feature_request` issues → no priority suggestion (those go through scope review separately).

   **c. Assignee (CODEOWNERS team membership).**
   - For the resolved team, suggest the team handle (e.g. `@NVIDIA/nemoclaw-engineer`) as the area-owner. Do NOT pick an individual unless the maintainer explicitly asks — team handles auto-distribute via GitHub's round-robin.

   **d. Status transition.**
   - If all required sections present + repro is reasonable → suggest moving `status: triage` → `status: ready`.
   - If `bug_report` template + empty `Reproduction Steps` → suggest keeping `status: triage` + draft a needs-info comment.
   - If body mentions a closed/merged PR that addressed this → suggest delegating to `find-already-fixed` for confirmation.

   **e. Needs-info comment draft.** When `--require-repro-for-bug on` AND template is `bug_report` AND `Reproduction Steps` section is empty/minimal (<20 chars):

   ```text
   Thanks for the report! To help us reproduce, could you fill out the **Reproduction Steps** section with the minimum commands to trigger this — e.g.:

   1. ...
   2. ...
   3. Expected: ... ; Actual: ...

   Also, the `Debug Output` section is empty — running `nemoclaw debug --quick` and pasting the output (or the tarball from `nemoclaw debug --output /tmp/...`) would help a lot. Marking this `needs-info` until then.
   ```

   Pair with a suggested label: `+ needs-info`.

   **f. Possible-duplicate flag.** Quick token-overlap check against open issues (top 5 by Jaccard on title); if any match ≥0.7, surface "Possible duplicate of #N — please review."

5. **Surface table to maintainer.** Per-issue, show:

   ```text
   ─── #3520 "openclaw subcommand silently exits" ───
   Template: bug_report
   Suggested labels: + area: cli, + priority: medium, + status: triage  (keep — repro section empty)
   Suggested assignee: @NVIDIA/nemoclaw-engineer
   Suggested comment: <needs-info draft>
   Possible duplicate: #3456 (Jaccard 0.72)

   [accept] / [edit] / [skip]
   ```

6. **Apply (only when `--apply on` AND user confirms per issue).** Apply via:

   ```bash
   gh issue edit <N> --repo NVIDIA/NemoClaw --add-label "<labels>" --add-assignee "<team>"
   gh issue comment <N> --repo NVIDIA/NemoClaw --body "<needs-info draft>"  # only if needed
   ```

   Never apply without per-issue confirmation. Never close from this skill.

## JSON sidecar output

Writes `/tmp/nemoclaw-skill-output-fresh-issue-triage-<run_id>.json`. Shares the maintainer-suite envelope (see `find-already-fixed/SKILL.md`).

**Per-result shape:**

```json
{
  "issue": 3520,
  "url": "https://github.com/NVIDIA/NemoClaw/issues/3520",
  "title": "...",
  "template_detected": "bug_report" | "feature_request" | "doc_issue" | "unknown",
  "proposed_labels": ["area: cli", "priority: medium", "needs-info"],
  "proposed_assignee": "@NVIDIA/nemoclaw-engineer",
  "proposed_comment": "Thanks for the report ...",
  "possible_duplicates": [{"issue": 3456, "jaccard": 0.72}],
  "applied": true | false,
  "user_decision": "accept" | "edit" | "skip"
}
```

## Output discipline

Markdown summary table first (all candidates, brief), then per-issue detail block. One block per row; never collapse into a wall of text.

```text
Fresh-issue triage (last 48h, 5 candidates):

| # | Title | Template | Suggested area | Repro? |
|---|---|---|---|---|
| #3520 | openclaw subcommand silently exits | bug_report | area: cli | ⚠ missing |
| #3519 | docs: typo in quickstart | doc_issue | documentation | n/a |
| ... |

[per-issue detail blocks follow]
```

## Halt conditions (the non-obvious one)

- **ISSUE_TEMPLATE schema can't be parsed** → halt. Without template detection the area-label heuristics degrade badly; this skill needs the schema to be accurate.

## Hard nos

- First-touch only. No issue-body edits, no closes, no auto-apply without per-issue confirm. Deep triage → `quick-wins` or `issue-autopilot`. Duplicate-close → chain to `scope-issues` → `close-superseded-issues`.
