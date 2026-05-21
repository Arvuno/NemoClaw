// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { AgentDefinition } from "../../agent/defs";
import { loadAgent } from "../../agent/defs";

export type NativeInstallerAgentName = "openclaw" | "hermes";

export const NATIVE_INSTALLER_SUPPORTED_AGENTS: readonly NativeInstallerAgentName[] = [
  "openclaw",
  "hermes",
] as const;

export function isNativeInstallerAgentName(value: string): value is NativeInstallerAgentName {
  return (NATIVE_INSTALLER_SUPPORTED_AGENTS as readonly string[]).includes(value);
}

export function getNativeInstallerAgentDefinitions(): AgentDefinition[] {
  return NATIVE_INSTALLER_SUPPORTED_AGENTS.map((agent) => loadAgent(agent));
}
