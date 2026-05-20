// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const REPO_ROOT = join(import.meta.dirname, "..");

type CompositeAction = {
  runs?: {
    steps?: Array<{
      name?: string;
      run?: string;
    }>;
  };
};

function loadBasicChecksAction(): CompositeAction {
  return YAML.parse(
    readFileSync(join(REPO_ROOT, ".github/actions/basic-checks/action.yaml"), "utf-8"),
  ) as CompositeAction;
}

describe("lockfile CI guards", () => {
  it("validates root and sandbox payload lockfiles before install can rewrite them", () => {
    const action = loadBasicChecksAction();
    const steps = action.runs?.steps ?? [];
    const validateIndex = steps.findIndex((step) => step.name === "Validate npm lockfiles");
    const installIndex = steps.findIndex((step) => step.name === "Install dependencies");
    const validateStep = steps[validateIndex];

    expect(validateIndex).toBeGreaterThanOrEqual(0);
    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(validateIndex).toBeLessThan(installIndex);
    expect(validateStep?.run?.trimEnd()).toBe(
      [
        "npm ci --ignore-scripts --dry-run",
        "cd nemoclaw",
        "npm ci --ignore-scripts --dry-run",
      ].join("\n"),
    );
  });

  it("uses npm ci for root and sandbox payload installs in basic checks", () => {
    const action = loadBasicChecksAction();
    const installStep = action.runs?.steps?.find((step) => step.name === "Install dependencies");

    expect(installStep?.run?.trimEnd()).toBe(
      ["npm ci --ignore-scripts", "cd nemoclaw", "npm ci --ignore-scripts"].join("\n"),
    );
    expect(installStep?.run).not.toContain("npm install");
  });
});
