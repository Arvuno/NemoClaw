// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { gpuPassthroughRecoveryLines, reportGpuPassthroughRecovery } from "./onboard/gpu-recovery";

describe("gpuPassthroughRecoveryLines", () => {
  it("clears the gateway directly when no sandboxes are registered (no NemoClaw uninstall, so the CLI survives)", () => {
    const lines = gpuPassthroughRecoveryLines([]);
    expect(lines).toEqual([
      "  Existing gateway was started without GPU passthrough.",
      "  No sandboxes are registered, so there is nothing to destroy.",
      "  To enable GPU, clear the stale gateway and re-onboard:",
      "    openshell gateway destroy -g nemoclaw",
      "    nemoclaw onboard --gpu",
    ]);
  });

  it("falls back to a direct gateway-removal hint when the registry cannot be read", () => {
    const lines = gpuPassthroughRecoveryLines(null);
    expect(lines).toEqual([
      "  Existing gateway was started without GPU passthrough.",
      "  Could not read the NemoClaw sandbox registry; cannot enumerate sandboxes.",
      "  To enable GPU, clear the stale gateway directly and re-onboard:",
      "    openshell gateway destroy -g nemoclaw",
      "    nemoclaw onboard --gpu",
    ]);
  });

  it("appends --cleanup-gateway to the single destroy command so the stale gateway is actually removed", () => {
    const lines = gpuPassthroughRecoveryLines(["my-assistant"]);
    expect(lines).toEqual([
      "  Existing gateway was started without GPU passthrough.",
      "  To enable GPU, destroy the registered sandbox (`my-assistant`) and re-onboard:",
      "    nemoclaw my-assistant destroy --yes --cleanup-gateway",
      "    nemoclaw onboard --gpu",
    ]);
  });

  it("only puts --cleanup-gateway on the last destroy command when more than one sandbox is registered", () => {
    const lines = gpuPassthroughRecoveryLines(["alpha", "beta"]);
    expect(lines).toEqual([
      "  Existing gateway was started without GPU passthrough.",
      "  To enable GPU, destroy the registered sandboxes (`alpha`, `beta`) and re-onboard:",
      "    nemoclaw alpha destroy --yes",
      "    nemoclaw beta destroy --yes --cleanup-gateway",
      "    nemoclaw onboard --gpu",
    ]);
  });

  it("never emits the literal `<name>` placeholder or a `nemoclaw uninstall && nemoclaw onboard` chain in any branch", () => {
    for (const names of [null, [], ["x"], ["alpha", "beta"]] as const) {
      const joined = gpuPassthroughRecoveryLines(names).join("\n");
      expect(joined).not.toContain("<name>");
      expect(joined).not.toContain("nemoclaw uninstall && nemoclaw onboard");
    }
  });
});

describe("reportGpuPassthroughRecovery", () => {
  it("routes the registered sandbox names through the printer", () => {
    const printed: string[] = [];
    reportGpuPassthroughRecovery((line) => printed.push(line), () => ["alpha"]);
    expect(printed).toEqual(gpuPassthroughRecoveryLines(["alpha"]));
  });

  it("falls back to the registry-unreadable guidance when the lookup throws (does not collapse to 'no sandboxes')", () => {
    const printed: string[] = [];
    reportGpuPassthroughRecovery(
      (line) => printed.push(line),
      () => {
        throw new Error("registry unreachable");
      },
    );
    expect(printed).toEqual(gpuPassthroughRecoveryLines(null));
    expect(printed.join("\n")).toContain("Could not read the NemoClaw sandbox registry");
  });
});
