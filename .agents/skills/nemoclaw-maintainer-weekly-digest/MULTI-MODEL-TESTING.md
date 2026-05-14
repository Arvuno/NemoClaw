# Multi-model test plan — weekly-digest

## Models in scope

| Model | Check |
|---|---|
| Claude Haiku 4.5 | Does Haiku correctly group merged PRs by conventional-commit prefix? |
| Claude Sonnet 4.6 | Does Sonnet correctly find sibling-skill sidecars and incorporate their data? |
| Claude Opus 4.7 (1M) | Does Opus adapt tone correctly for --for-audience mgmt vs team vs public? |

## Pass criteria

- Time window resolved correctly from --since
- Merged PRs grouped by feat/fix/docs/chore/refactor/test/ci prefix
- Security-relevant PRs surfaced separately (paths under nemoclaw-blueprint/policies/, src/lib/credentials*, src/lib/inference/*, OR security label)
- Sibling-skill sidecar data folded into "In flight" / "Watching" / "Pipeline status" sections when available
- Three audience modes adjust the section order + depth (team: balanced; mgmt: asks-first, impact-language; public: drop asks/watching, demote internals)

## Known risks

- Haiku may emit one giant unordered list instead of grouped sections. Pin the template structure.
- Sonnet may forget to anonymize internal team names in --for-audience public. Check the public template explicitly.
- Opus may add unrequested commentary. Enforce "paste-ready Markdown block" output discipline.

## How to run

Generate digests for each audience mode against the same week; verify only tone+section-order differ, not raw data.
