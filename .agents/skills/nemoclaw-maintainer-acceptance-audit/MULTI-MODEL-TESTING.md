# Multi-model test plan — acceptance-audit

## Models in scope

| Model | Check |
|---|---|
| Claude Haiku 4.5 | Does Haiku use Tier 1 literal substring match correctly (no paraphrasing)? |
| Claude Sonnet 4.6 | Does Sonnet detect the issue template and apply template-specific extraction? |
| Claude Opus 4.7 (1M) | Does Opus avoid declaring PERFECT_MATCH on a near-miss? |

## Pass criteria

- Tier 1 literal substring is the default match strategy; never paraphrased keywords
- Tier 2 all-tokens-within-K=4 fires only when Tier 1 fails (not as a permissive default)
- Template detection picks the right authoritative section per template
- Surplus-file check: every changed file traces to at least one MET clause
- Final verdict is PERFECT_MATCH only when zero MISSING AND zero unjustified surplus

## Known risks

- Haiku may approximate clauses with synonyms ("policy preset" matching "preset"). Tighten the "verbatim, not paraphrased" rule with a counter-example.
- Sonnet may correctly extract clauses but miss the surplus check. Always run both passes.
- Opus may explain WHY paraphrasing fails instead of catching the gap. Cap the explanation; just produce the table.

## How to run

Iterate over the 3 evals; each names a real (issue, PR) pair. Verify the audit table matches expected MISSING / MET counts.
