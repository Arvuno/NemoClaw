// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { GatewayReuseState } from "../state/gateway";

export type LegacyGatewayGpuInspection = "gpu-enabled" | "cpu-only" | "not-found" | "unknown";

export type GatewayGpuReuseDecision = "reuse" | "restart-gateway" | "abort-with-recovery";

// Docker-driver/package-managed gateways do not expose reusable GPU state
// through the legacy openshell-cluster-* container's DeviceRequests field.
export function shouldInspectLegacyGatewayGpuPassthrough(
  gatewayReuseState: GatewayReuseState,
  gpuPassthrough: boolean,
  confirmedDockerDriverGateway: boolean,
): boolean {
  return gatewayReuseState === "healthy" && gpuPassthrough && !confirmedDockerDriverGateway;
}

export function inspectLegacyGatewayGpuPassthroughResult(
  status: number | null | undefined,
  stdout: unknown,
  stderr: unknown = "",
): LegacyGatewayGpuInspection {
  if (status !== 0) {
    const error = String(stderr ?? "");
    return /\bNo such (object|container)\b|not found/i.test(error) ? "not-found" : "unknown";
  }
  const output = String(stdout ?? "").trim();
  if (output === "null" || output === "[]") return "cpu-only";
  if (!output) return "unknown";
  return "gpu-enabled";
}

export function decideGatewayGpuReuseForGpuIntent({
  gatewayReuseState,
  gpuPassthrough,
  confirmedDockerDriverGateway,
  legacyGatewayGpuInspection,
  cpuOnlyGatewayRestartSafe,
}: {
  gatewayReuseState: GatewayReuseState;
  gpuPassthrough: boolean;
  confirmedDockerDriverGateway: boolean;
  legacyGatewayGpuInspection: LegacyGatewayGpuInspection;
  cpuOnlyGatewayRestartSafe: boolean;
}): GatewayGpuReuseDecision {
  if (gatewayReuseState !== "healthy" || !gpuPassthrough) return "reuse";
  if (confirmedDockerDriverGateway) return "reuse";
  if (legacyGatewayGpuInspection === "gpu-enabled" || legacyGatewayGpuInspection === "not-found") {
    return "reuse";
  }
  if (legacyGatewayGpuInspection !== "cpu-only") return "abort-with-recovery";
  return cpuOnlyGatewayRestartSafe ? "restart-gateway" : "abort-with-recovery";
}

export function canRestartCpuOnlyGatewayForGpuIntent(
  registeredSandboxNames: readonly string[],
  currentSandboxName: string | null,
  recreateSandbox: boolean,
): boolean {
  const names = registeredSandboxNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return true;
  return (
    recreateSandbox &&
    currentSandboxName !== null &&
    names.length === 1 &&
    names[0] === currentSandboxName
  );
}
