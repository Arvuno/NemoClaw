// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const GATEWAY_REMOVAL_COMMAND = "openshell gateway destroy -g nemoclaw";
const ONBOARD_GPU_COMMAND = "nemoclaw onboard --gpu";

export function gpuPassthroughRecoveryLines(registeredNames: readonly string[] | null): string[] {
  const lines: string[] = ["  Existing gateway was started without GPU passthrough."];
  if (registeredNames === null) {
    lines.push("  Could not read the NemoClaw sandbox registry; cannot enumerate sandboxes.");
    lines.push("  To enable GPU, clear the stale gateway directly and re-onboard:");
    lines.push(`    ${GATEWAY_REMOVAL_COMMAND}`);
    lines.push(`    ${ONBOARD_GPU_COMMAND}`);
    return lines;
  }
  if (registeredNames.length === 0) {
    lines.push("  No sandboxes are registered, so there is nothing to destroy.");
    lines.push("  To enable GPU, clear the stale gateway and re-onboard:");
    lines.push(`    ${GATEWAY_REMOVAL_COMMAND}`);
    lines.push(`    ${ONBOARD_GPU_COMMAND}`);
    return lines;
  }
  const plural = registeredNames.length === 1 ? "" : "es";
  const list = registeredNames.map((n) => `\`${n}\``).join(", ");
  lines.push(`  To enable GPU, destroy the registered sandbox${plural} (${list}) and re-onboard:`);
  registeredNames.forEach((name, index) => {
    const isLast = index === registeredNames.length - 1;
    const flags = isLast ? " --yes --cleanup-gateway" : " --yes";
    lines.push(`    nemoclaw ${name} destroy${flags}`);
  });
  lines.push(`    ${ONBOARD_GPU_COMMAND}`);
  return lines;
}

function defaultRegisteredSandboxNames(): readonly string[] | null {
  try {
    const registry = require("../state/registry") as typeof import("../state/registry");
    return registry.listSandboxes().sandboxes.map((s) => s.name).filter(Boolean);
  } catch {
    return null;
  }
}

export function reportGpuPassthroughRecovery(
  emit: (line: string) => void = console.error,
  listRegisteredSandboxes: () => readonly string[] | null = defaultRegisteredSandboxNames,
): void {
  let names: readonly string[] | null;
  try {
    names = listRegisteredSandboxes();
  } catch {
    names = null;
  }
  for (const line of gpuPassthroughRecoveryLines(names)) emit(line);
}
