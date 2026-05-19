#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MARKER = "<!-- nemoclaw-pr-review-advisor -->";

type ParsedArgs = {
  repo?: string;
  pr?: string;
  summary?: string;
  result?: string;
};

type GitHubComment = {
  id: number;
  body?: string;
};

type GitHubRequestOptions = {
  method?: string;
  body?: unknown;
};

type ReviewAdvisorResult = {
  headSha?: string;
  summary?: {
    recommendation?: string;
    confidence?: string;
    oneLine?: string;
  };
  findings?: Array<{ severity?: string }>;
  reviewCompleteness?: {
    limitations?: string[];
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo || process.env.GITHUB_REPOSITORY;
  const pr = args.pr || process.env.PR_NUMBER;
  const summaryPath = args.summary || "artifacts/pr-review-advisor/pr-review-advisor-summary.md";
  const resultPath = args.result || "artifacts/pr-review-advisor/pr-review-advisor-final-result.json";
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined;

  if (!repo || !pr) {
    console.log("Skipping PR review advisor comment: repo or PR number not provided");
    return;
  }
  if (!token) {
    console.log("Skipping PR review advisor comment: GITHUB_TOKEN/GH_TOKEN not provided");
    return;
  }

  const summary = readIfExists(summaryPath) || readIfExists("artifacts/pr-review-advisor/pr-review-advisor-summary.md");
  if (!summary) throw new Error(`No PR review advisor summary found at ${summaryPath}`);
  const result = readJsonIfExists<ReviewAdvisorResult>(resultPath);
  const body = buildComment({ summary, result, runUrl, marker: MARKER });

  try {
    const existing = await findExistingComment(repo, pr, token, MARKER);
    if (existing) {
      await github(`repos/${repo}/issues/comments/${existing.id}`, token, { method: "PATCH", body: { body } });
      console.log(`Updated PR review advisor comment on ${repo}#${pr}`);
    } else {
      await github(`repos/${repo}/issues/${pr}/comments`, token, { method: "POST", body: { body } });
      console.log(`Created PR review advisor comment on ${repo}#${pr}`);
    }
  } catch (error: unknown) {
    if (isPermissionError(error)) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Skipping PR review advisor comment due to permission error: ${message}`);
    } else {
      throw error;
    }
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        parsed[key] = undefined;
        continue;
      }
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function readIfExists(filePath: string): string | undefined {
  const resolved = path.resolve(process.cwd(), filePath);
  return fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : undefined;
}

function readJsonIfExists<T>(filePath: string): T | undefined {
  const text = readIfExists(filePath);
  return text ? JSON.parse(text) as T : undefined;
}

export function buildComment({
  summary,
  result,
  runUrl,
  marker,
}: {
  summary: string;
  result?: ReviewAdvisorResult;
  runUrl?: string;
  marker?: string;
}): string {
  const blockerCount = result?.findings?.filter((finding) => finding.severity === "blocker").length ?? 0;
  const warningCount = result?.findings?.filter((finding) => finding.severity === "warning").length ?? 0;
  const suggestionCount = result?.findings?.filter((finding) => finding.severity === "suggestion").length ?? 0;
  const recommendation = result?.summary?.recommendation ? result.summary.recommendation.replaceAll("_", " ") : "unknown";
  const confidence = result?.summary?.confidence || "unknown";
  const sha = result?.headSha ? `\n**Analyzed HEAD:** \`${result.headSha}\`` : "";
  const run = runUrl ? `\n\n[Workflow run](${runUrl})` : "";
  const limitations = result?.reviewCompleteness?.limitations?.length
    ? `\n\n**Limitations:** ${result.reviewCompleteness.limitations.join("; ")}`
    : "";

  return `${marker || MARKER}
## PR Review Advisor

**Recommendation:** ${recommendation}
**Confidence:** ${confidence}${sha}
**Findings:** ${blockerCount} blocker(s), ${warningCount} warning(s), ${suggestionCount} suggestion(s)

This is an automated advisory review. A human maintainer must make the final merge decision.${limitations}${run}

<details>
<summary>Full advisor summary</summary>

${summary.trim()}

</details>
`;
}

async function findExistingComment(repo: string, pr: string, token: string, marker: string): Promise<GitHubComment | undefined> {
  for (let page = 1; ; page += 1) {
    const comments = await github<GitHubComment[]>(`repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`, token);
    const match = comments.find((comment) => typeof comment.body === "string" && comment.body.includes(marker));
    if (match) return match;
    if (comments.length < 100) return undefined;
  }
}

async function github<T>(apiPath: string, token: string, options: GitHubRequestOptions = {}): Promise<T> {
  const response = await fetch(`https://api.github.com/${apiPath}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${apiPath} failed: ${response.status} ${await response.text()}`);
  }
  return await response.json() as T;
}

function isPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /403|404|Resource not accessible by integration|permission/i.test(message);
}
