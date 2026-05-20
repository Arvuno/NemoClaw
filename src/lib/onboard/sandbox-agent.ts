// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { AgentDefinition } from "../agent/defs";
import { loadAgent } from "../agent/defs";
import { validateName } from "../runner";
import type { SandboxEntry } from "../state/registry";
import * as registry from "../state/registry";

// Names that collide with CLI command namespaces. A sandbox named 'status'
// makes 'nemoclaw status connect' route to the global status command
// instead of the sandbox, and a sandbox named 'sandbox' collides with the
// oclif-native `nemoclaw sandbox ...` command namespace. Reject these wherever
// a sandbox name enters the system (interactive prompt, --name flag,
// NEMOCLAW_SANDBOX_NAME).
export const RESERVED_SANDBOX_NAMES = new Set([
  "onboard",
  "list",
  "deploy",
  "setup",
  "setup-spark",
  "start",
  "stop",
  "status",
  "debug",
  "uninstall",
  "update",
  "credentials",
  "help",
  "sandbox",
]);

export const UNKNOWN_SANDBOX_AGENT_NAME = "unknown";

export function normalizeSandboxAgentName(agentName: string | null | undefined): string {
  const trimmed = typeof agentName === "string" ? agentName.trim() : "";
  return trimmed && trimmed !== "openclaw" ? trimmed : "openclaw";
}

export function getRequestedSandboxAgentName(agent: AgentDefinition | null | undefined): string {
  return normalizeSandboxAgentName(agent?.name);
}

export function formatSandboxAgentName(agentName: string | null | undefined): string {
  const normalized = normalizeSandboxAgentName(agentName);
  if (normalized === "openclaw") return "OpenClaw";
  if (normalized === "hermes") return "Hermes";
  return normalized;
}

export function getDefaultSandboxNameForAgent(agent: AgentDefinition | null | undefined): string {
  return getRequestedSandboxAgentName(agent) === "hermes" ? "hermes" : "my-assistant";
}

export function getSandboxPromptDefault(agent: AgentDefinition | null | undefined): string {
  const envName = (process.env.NEMOCLAW_SANDBOX_NAME || "").trim().toLowerCase();
  const agentDefault = getDefaultSandboxNameForAgent(agent);
  if (!envName) return agentDefault;
  try {
    return validateName(envName, "sandbox name");
  } catch {
    return agentDefault;
  }
}

export function getEffectiveSandboxAgent(agent: AgentDefinition | null | undefined): AgentDefinition {
  return agent || loadAgent("openclaw");
}

export function getAgentInferenceProviderOptions(agent: AgentDefinition | null | undefined): string[] {
  const effectiveAgent = agent?.name ? loadAgent(agent.name) : getEffectiveSandboxAgent(agent);
  return Array.isArray(effectiveAgent.inferenceProviderOptions)
    ? effectiveAgent.inferenceProviderOptions
    : [];
}

export function getSandboxAgentRegistryFields(
  agent: AgentDefinition | null | undefined,
  agentVersionKnown = true,
): Pick<SandboxEntry, "agent" | "agentVersion"> {
  const effectiveAgent = getEffectiveSandboxAgent(agent);
  const agentName = normalizeSandboxAgentName(effectiveAgent.name);
  return {
    agent: agentName === "openclaw" ? null : agentName,
    agentVersion: agentVersionKnown ? effectiveAgent.expectedVersion || null : null,
  };
}

export function getSandboxAgentDrift(
  sandboxName: string,
  requestedAgentName: string,
): { changed: boolean; existingAgentName: string; requestedAgentName: string } {
  const existingEntry: SandboxEntry | null = registry.getSandbox(sandboxName);
  if (!existingEntry) {
    return {
      changed: true,
      existingAgentName: UNKNOWN_SANDBOX_AGENT_NAME,
      requestedAgentName,
    };
  }
  const existingAgentName = normalizeSandboxAgentName(existingEntry?.agent);
  return {
    changed: existingAgentName !== requestedAgentName,
    existingAgentName,
    requestedAgentName,
  };
}
