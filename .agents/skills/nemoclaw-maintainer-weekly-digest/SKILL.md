---
name: nemoclaw-maintainer-weekly-digest
description: Generates a Friday wrap-up digest of the maintainer's week — shipped (merged PRs grouped by type, security-relevant highlighted), awaiting-your-review queue, blocked-on-others items, top concerns from new issues, current pipeline status from sibling-skill JSON sidecars if available. Three audience modes (team / mgmt / public) adjust depth and tone. Outputs a paste-ready Slack/email Markdown block. Use when preparing a Friday wrap-up, Monday standup prep, or any async visibility update that would otherwise take 30-45 min to assemble by hand. Local-only, drafts only — never posts.
---

# Weekly Digest

A Friday-afternoon (or whenever) write-up of the week's work, for sharing with team / management / async-stakeholders. Pulls from GitHub, joins with output from the other maintainer skills if their JSON sidecars exist in /tmp, produces a clean Markdown digest you can paste into Slack, email, or a weekly-review doc.

## Why this matters

Visibility updates are high-value but slow to write by hand — scanning ~30-100 merged PRs, ~5-15 fresh issues, the open review queue, the stale-PR situation, and the in-flight pipeline takes 30-45 min if done thoroughly. Many maintainers skip it; the ones who don't spend a chunk of their Friday on it.

This skill produces a structured draft in under a minute. The maintainer reviews, edits any prose, pastes. Output is opinionated — leads with impact, ends with asks-of-others — so it doubles as a "what to focus on next week" signal.

## Invocation

```text
/nemoclaw-maintainer-weekly-digest
```

Flags:

| Flag | Default | Meaning |
|------|---------|---------|
| `--since` | `7d` | Time window |
| `--for-audience` | `team` | One of `team` (engineering peers), `mgmt` (management chain), `public` (community) — adjusts depth/tone |
| `--include-blockers` | `on` | Surface PRs/issues blocked on you OR blocked on others |
| `--pipeline-summary` | `on` | Pull current open-PR status from your last `quick-wins` and `stale-pr-sweep` runs if their sidecars are available |
| `--draft-only` | `on` | Never post or send — output to conversation for paste |

## Workflow

1. **Resolve the time window.** Default `--since 7d` → past 7 days. ISO date also accepted.

2. **Gather sources** (parallel-fetch where possible):

   **a. Shipped this week — merged PRs by you and the team.**

   ```bash
   gh pr list --repo NVIDIA/NemoClaw --state merged --limit 100 \
     --search "merged:>=$(date -v-7d +%Y-%m-%d)" \
     --json number,title,author,mergedAt,labels,files,body
   ```

   Group by `feat` / `fix` / `docs` / `chore` / `refactor` / `test` / `ci` from title conventional-commit prefix. Highlight PRs touching paths under `nemoclaw-blueprint/policies/`, `src/lib/credentials*`, or with a `security` label as **security-relevant**.

   **b. Awaiting your review.**

   ```bash
   gh search prs --repo NVIDIA/NemoClaw --state open \
     --review-requested @me --json number,title,author,updatedAt,labels
   ```

   Plus team-level: `--review-requested @NVIDIA/nemoclaw-maintainer` (or whichever team you belong to — read from `gh api user/teams`).

   **c. Blocked on others.**

   ```bash
   gh search prs --repo NVIDIA/NemoClaw --state open --author @me \
     --json number,title,reviewDecision,statusCheckRollup,mergeStateStatus
   ```

   Filter to: `reviewDecision == "REVIEW_REQUIRED"` for >24h (waiting on review), OR `mergeStateStatus == "BLOCKED"` (waiting on admin merge), OR `statusCheckRollup` has any `IN_PROGRESS` >2h (waiting on CI).

   **d. Top concerns from new issues.**

   ```bash
   gh issue list --repo NVIDIA/NemoClaw --state open \
     --search "created:>=$(date -v-7d +%Y-%m-%d)" \
     --json number,title,labels,createdAt,comments
   ```

   Filter to issues with `priority: high` OR `security` label, OR with 3+ comments in the first 24h (hot-take signal).

   **e. (Optional) Pipeline summary from sibling skill sidecars.**
   - If `/tmp/nemoclaw-skill-output-quick-wins-*.json` from the last 7 days exists: count APPROVE / REQUEST_CHANGES / BLOCK verdicts.
   - If `/tmp/nemoclaw-skill-output-stale-pr-sweep-*.json` exists: count READY_TO_MERGE / NEEDS_REBASE / ABANDONED.
   - If `/tmp/nemoclaw-skill-output-find-already-fixed-*.json` exists: count candidates surfaced (potential noise reduction).

3. **Compose the digest.** Use the template below. Adapt tone based on `--for-audience`.

4. **Emit to conversation.** Markdown ready to paste. **Never post.**

## Digest template (audience: `team`)

```markdown
# Weekly digest — week of <YYYY-MM-DD>

## Shipped
- **Features (N):** [list of feat PRs, # + one-line impact]
- **Fixes (N):** [list of fix PRs]
- **Security-relevant (N):** [list of PRs touching policy / credentials / auth surfaces]
- **Docs / Chore (N):** [collapsed count + top 3 if notable]

## In flight
- **Open PRs authored by me:** N waiting on review, M blocked on CI/admin
- **Top RFRs needing my review:** [up to 3 with #N + title + author]
- **Pipeline status (from quick-wins last run):** N APPROVE-ready, M waiting on tier-3 e2e

## Watching
- **Hot new issues this week:** [N issues with priority: high or active discussion]
- **Stale-PR sweep:** [N PRs in NEEDS_REBASE, M in ABANDONED]
- **Already-fixed candidates surfaced but not yet closed:** [count]

## Asks
- [Things blocking me that I need from others — explicit reviewer pings, admin-merge requests, design decisions waiting]

## Next week
- [1-3 top focus areas, deduced from in-flight + hot issues]
```

## Digest template (audience: `mgmt`)

Same shape, with two adjustments:

- "Shipped" leads with impact statements, not PR titles ("3 security-relevant fixes shipped; full list in <PR-search-link>").
- "Asks" leads. Visibility updates to management get max value when the asks are surfaced first.

## Digest template (audience: `public`)

For community-facing changelogs / forum updates:

- Drop the "Asks" section entirely.
- Drop the "Watching" section.
- Lead with user-visible improvements; demote internal/CI/chore work.
- Anonymize internal team names if needed (e.g. don't surface `@NVIDIA/nemoclaw-security` in public posts).

## JSON sidecar output

Writes `/tmp/nemoclaw-skill-output-weekly-digest-<run_id>.json`. Shares the maintainer-suite envelope.

**Per-result shape (single object — one digest per run):**

```json
{
  "window_start": "<iso8601>",
  "window_end": "<iso8601>",
  "audience": "team" | "mgmt" | "public",
  "counts": {
    "shipped_feat": 3,
    "shipped_fix": 7,
    "shipped_security": 2,
    "shipped_docs": 5,
    "shipped_chore": 12,
    "awaiting_my_review": 4,
    "blocked_on_others": 2,
    "hot_new_issues": 1
  },
  "digest_markdown": "<full digest as a single markdown string>"
}
```

The `digest_markdown` field is the paste-ready output. The maintainer copies it to wherever (Slack, email, doc). The skill never sends it.

## Output discipline

Two outputs, kept separate:

1. **Brief summary inline** (≤5 lines) — "Digest generated for week of X; N items shipped, M awaiting review, K asks. Paste-ready Markdown below."
2. **Full digest Markdown block** — fenced so it's obviously a paste-target.

Never inline-paraphrase the digest into the conversation flow — keep it copyable as one block.

## Reference cases (sample week — 2026-05-08 to 2026-05-14)

A live run for the maintainer's week produced this digest shape. Counts derived from actual GitHub queries; section content paraphrased.

```text
# Weekly digest — week of 2026-05-08

## Shipped
- Features (3): #3499 dashboard bind, #3501 shields docs, #3520 onboard recovery
- Fixes (7): #3498 ollama proxy probe, ... [6 more]
- Security-relevant (2): #3498 (auth-proxy surface), #3501 (policy posture)
- Docs / Chore (12 collapsed)

## In flight
- Open PRs by me: 4 waiting on review, 1 blocked on CI
- Top RFRs needing my review: #3284 onboard refactor, #3351 telemetry, #3433 dns-proxy
- Pipeline status (from quick-wins last run): 2 APPROVE-ready, 1 waiting on tier-3 e2e

## Watching
- Hot new issues: #3456 (gateway recovery messages, 6 comments in 24h)
- Stale-PR sweep: 5 in NEEDS_REBASE, 2 in ABANDONED
- Already-fixed candidates surfaced but not closed: 8

## Asks
- @NVIDIA/nemoclaw-maintainer admin-merge on #3499
- @NVIDIA/nemoclaw-security re-review on #3501

## Next week
- Finish the 11-skill maintainer suite; close out #3526-#3530 when queue drains
```

Exact counts / issues will differ per week — this shows the shape of a fully-populated digest.

## Halt conditions

- Sibling skills' sidecars are missing AND `--pipeline-summary on` → proceed without that section, note it as omitted in the digest. Don't halt.

## Hard nos

- Drafts only. No Slack posts, no email sends, no calendar edits. No velocity assessments, no contributor rankings. Release notes ≠ weekly digest (release notes cover since-last-tag; digest covers this-week — different windows, different audiences).

## Why "asks of others" is the highest-ROI section

The section maintainers most often skip when writing by hand. It's the one that unblocks the most work. Always include it, even if it's "no asks this week" — the explicit empty signal is also useful.
