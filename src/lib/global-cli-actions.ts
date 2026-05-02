// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/* v8 ignore start -- transitional action facade until implementations leave src/nemoclaw.ts. */

import { getNemoClawRuntimeBridge } from "./nemoclaw-runtime-bridge";

export async function runOnboardAction(args: string[] = []): Promise<void> {
  await getNemoClawRuntimeBridge().onboard(args);
}

export async function runSetupAction(args: string[] = []): Promise<void> {
  await getNemoClawRuntimeBridge().setup(args);
}

export async function runSetupSparkAction(args: string[] = []): Promise<void> {
  await getNemoClawRuntimeBridge().setupSpark(args);
}

export async function runDeployAction(instanceName?: string): Promise<void> {
  await getNemoClawRuntimeBridge().deploy(instanceName);
}

export function runBackupAllAction(): void {
  getNemoClawRuntimeBridge().backupAll();
}

export async function runUpgradeSandboxesAction(args: string[] = []): Promise<void> {
  await getNemoClawRuntimeBridge().upgradeSandboxes(args);
}

export async function runGarbageCollectImagesAction(args: string[] = []): Promise<void> {
  await getNemoClawRuntimeBridge().garbageCollectImages(args);
}

export function showRootHelp(): void {
  getNemoClawRuntimeBridge().help();
}

export function showVersion(): void {
  getNemoClawRuntimeBridge().version();
}

export async function recoverNamedGatewayRuntime(): Promise<{ recovered: boolean }> {
  return getNemoClawRuntimeBridge().recoverNamedGatewayRuntime();
}

export function runOpenshellProviderCommand(
  args: string[],
  opts?: {
    env?: Record<string, string | undefined>;
    ignoreError?: boolean;
    stdio?: import("node:child_process").StdioOptions;
    timeout?: number;
  },
) {
  return getNemoClawRuntimeBridge().runOpenshell(args, opts);
}
