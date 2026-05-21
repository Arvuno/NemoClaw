// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";

import { loadAgent } from "../../agent/defs";
import { ROOT } from "../../runner";
import { NATIVE_INSTALLER_SUPPORTED_AGENTS, isNativeInstallerAgentName, type NativeInstallerAgentName } from "./images";
import {
  formatNativeInstallerProviderIds,
  getNativeInstallerProvider,
} from "./providers";

const yaml: { load(input: string): unknown } = require("js-yaml");

type JsonRecord = Record<string, unknown>;

export interface NativeInstallerPlanRequirement {
  id: string;
  label: string;
  required: boolean;
  recovery?: string;
}

export interface NativeInstallerPlanAgent {
  name: NativeInstallerAgentName;
  displayName: string;
  description: string;
  dashboardKind: "ui" | "api";
  port: number;
  messaging: string[];
  label?: string;
  icon?: string;
  recommended: boolean;
}

export interface NativeInstallerPlanProvider {
  id: string;
  title: string;
  defaultModel: string;
  envVar?: string;
  guidance: string;
  systemImage: string;
  recommended: boolean;
  supportedAgents: NativeInstallerAgentName[];
}

export interface NativeInstallerPlanTrustTier {
  id: string;
  title: string;
  description: string;
  icon: string;
  recommended: boolean;
  presets: string[];
}

export interface NativeInstallerPlanBaseImage {
  agent: NativeInstallerAgentName;
  ref: string;
  env: string;
  applyByDefault: boolean;
  note?: string;
}

export interface NativeInstallerInstallPlan {
  version: 1;
  experimental: true;
  source: string;
  target: "Apple Silicon macOS 13+";
  summary: string;
  requirements: NativeInstallerPlanRequirement[];
  agents: NativeInstallerPlanAgent[];
  model: {
    defaultProvider: string;
    providers: NativeInstallerPlanProvider[];
  };
  trust: {
    defaultTier: string;
    tiers: NativeInstallerPlanTrustTier[];
  };
  review: {
    handoffPolicy: string;
    stockOnly: string;
  };
  install: {
    defaultSandboxName: string;
    defaultMode: "fresh" | "resume";
    progressPhases: Array<{ id: string; title: string }>;
    baseImages: NativeInstallerPlanBaseImage[];
  };
  launch: Record<string, { kind: "ui" | "api"; action: string }>;
}

export interface NativeInstallerDescribeDeps {
  rootDir?: string;
  planPath?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function stringField(record: JsonRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return value.trim();
}

function optionalStringField(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanField(record: JsonRecord, key: string, defaultValue: boolean): boolean {
  const value = record[key];
  return typeof value === "boolean" ? value : defaultValue;
}

function stringArrayField(record: JsonRecord, key: string, label: string): string[] {
  const value = record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label}.${key} must be an array of strings`);
  }
  return value.map((entry) => entry.trim()).filter(Boolean);
}

function parseRequirement(value: unknown, index: number): NativeInstallerPlanRequirement {
  const record = asRecord(value, `requirements[${String(index)}]`);
  return {
    id: stringField(record, "id", `requirements[${String(index)}]`),
    label: stringField(record, "label", `requirements[${String(index)}]`),
    required: booleanField(record, "required", true),
    ...(optionalStringField(record, "recovery")
      ? { recovery: optionalStringField(record, "recovery") }
      : {}),
  };
}

function parseRawAgent(value: unknown, index: number): {
  name: NativeInstallerAgentName;
  description?: string;
  label?: string;
  icon?: string;
  recommended: boolean;
} {
  const record = asRecord(value, `agents[${String(index)}]`);
  const name = stringField(record, "name", `agents[${String(index)}]`);
  if (!isNativeInstallerAgentName(name)) {
    throw new Error(`agents[${String(index)}].name must be one of ${NATIVE_INSTALLER_SUPPORTED_AGENTS.join(", ")}`);
  }
  return {
    name,
    ...(optionalStringField(record, "description")
      ? { description: optionalStringField(record, "description") }
      : {}),
    ...(optionalStringField(record, "label") ? { label: optionalStringField(record, "label") } : {}),
    ...(optionalStringField(record, "icon") ? { icon: optionalStringField(record, "icon") } : {}),
    recommended: booleanField(record, "recommended", false),
  };
}

function parseProvider(value: unknown, index: number): Omit<NativeInstallerPlanProvider, "supportedAgents"> {
  const record = asRecord(value, `model.providers[${String(index)}]`);
  return {
    id: stringField(record, "id", `model.providers[${String(index)}]`),
    title: stringField(record, "title", `model.providers[${String(index)}]`),
    defaultModel: stringField(record, "default_model", `model.providers[${String(index)}]`),
    ...(optionalStringField(record, "env_var")
      ? { envVar: optionalStringField(record, "env_var") }
      : {}),
    guidance: stringField(record, "guidance", `model.providers[${String(index)}]`),
    systemImage: optionalStringField(record, "system_image") ?? "sparkles",
    recommended: booleanField(record, "recommended", false),
  };
}

function resolveProvider(
  value: unknown,
  index: number,
  agents: NativeInstallerPlanAgent[],
  agentSpecificProviders: Map<string, NativeInstallerAgentName[]>,
): NativeInstallerPlanProvider {
  const parsed = parseProvider(value, index);
  const installerProvider = getNativeInstallerProvider(parsed.id);
  if (!installerProvider) {
    throw new Error(
      `model.providers[${String(index)}].id '${parsed.id}' is not supported by nemoclaw onboard. Supported provider ids: ${formatNativeInstallerProviderIds()}`,
    );
  }
  if (parsed.defaultModel !== installerProvider.defaultModel) {
    throw new Error(
      `model.providers[${String(index)}].default_model must match the onboard default for ${parsed.id}: ${installerProvider.defaultModel}`,
    );
  }
  if (parsed.envVar && installerProvider.envVar && parsed.envVar !== installerProvider.envVar) {
    throw new Error(
      `model.providers[${String(index)}].env_var must match the onboard credential env for ${parsed.id}: ${installerProvider.envVar}`,
    );
  }

  const supportedAgents =
    agentSpecificProviders.get(parsed.id) ??
    agents.map((agent) => agent.name);
  if (supportedAgents.length === 0) {
    throw new Error(`model.providers[${String(index)}].id '${parsed.id}' is not available to any native Mac installer agent`);
  }

  return {
    ...parsed,
    title: installerProvider.title,
    defaultModel: installerProvider.defaultModel,
    ...(installerProvider.envVar ? { envVar: installerProvider.envVar } : {}),
    supportedAgents,
  };
}

function parseTrustTier(value: unknown, index: number): NativeInstallerPlanTrustTier {
  const record = asRecord(value, `trust.tiers[${String(index)}]`);
  return {
    id: stringField(record, "id", `trust.tiers[${String(index)}]`),
    title: stringField(record, "title", `trust.tiers[${String(index)}]`),
    description: stringField(record, "description", `trust.tiers[${String(index)}]`),
    icon: optionalStringField(record, "icon") ?? "checkmark.shield",
    recommended: booleanField(record, "recommended", false),
    presets: stringArrayField(record, "presets", `trust.tiers[${String(index)}]`),
  };
}

function parseBaseImage(value: unknown, index: number): NativeInstallerPlanBaseImage {
  const record = asRecord(value, `install.base_images[${String(index)}]`);
  const agent = stringField(record, "agent", `install.base_images[${String(index)}]`);
  if (!isNativeInstallerAgentName(agent)) {
    throw new Error(
      `install.base_images[${String(index)}].agent must be one of ${NATIVE_INSTALLER_SUPPORTED_AGENTS.join(", ")}`,
    );
  }
  return {
    agent,
    ref: stringField(record, "ref", `install.base_images[${String(index)}]`),
    env: stringField(record, "env", `install.base_images[${String(index)}]`),
    applyByDefault: booleanField(record, "apply_by_default", false),
    ...(optionalStringField(record, "note") ? { note: optionalStringField(record, "note") } : {}),
  };
}

function parseProgressPhase(value: unknown, index: number): { id: string; title: string } {
  const record = asRecord(value, `install.progress_phases[${String(index)}]`);
  return {
    id: stringField(record, "id", `install.progress_phases[${String(index)}]`),
    title: stringField(record, "title", `install.progress_phases[${String(index)}]`),
  };
}

function parseLaunch(value: unknown): NativeInstallerInstallPlan["launch"] {
  const launch = asRecord(value, "launch");
  const result: NativeInstallerInstallPlan["launch"] = {};
  for (const [agent, raw] of Object.entries(launch)) {
    if (!isRecord(raw)) throw new Error(`launch.${agent} must be an object`);
    const kind = stringField(raw, "kind", `launch.${agent}`);
    if (kind !== "ui" && kind !== "api") {
      throw new Error(`launch.${agent}.kind must be ui or api`);
    }
    result[agent] = {
      kind,
      action: stringField(raw, "action", `launch.${agent}`),
    };
  }
  return result;
}

export function macInstallerInstallPlanPath(rootDir = ROOT): string {
  return path.join(rootDir, "release", "native-installers", "macos", "install-plan.yaml");
}

export function loadNativeInstallerInstallPlan(
  deps: NativeInstallerDescribeDeps = {},
): NativeInstallerInstallPlan {
  const planPath = deps.planPath ?? macInstallerInstallPlanPath(deps.rootDir ?? ROOT);
  const raw = asRecord(yaml.load(fs.readFileSync(planPath, "utf8")), "install-plan.yaml");
  if (raw.version !== 1) throw new Error("install-plan.yaml version must be 1");
  if (raw.experimental !== true) throw new Error("install-plan.yaml experimental must be true");

  const requirements = asArray(raw.requirements, "requirements").map(parseRequirement);
  const rawAgents = asArray(raw.agents, "agents").map(parseRawAgent);
  const agents = rawAgents.map((entry) => {
    const manifest = loadAgent(entry.name);
    return {
      name: entry.name,
      displayName: manifest.displayName,
      description: entry.description ?? manifest.description ?? "",
      dashboardKind: manifest.dashboard.kind,
      port: manifest.forwardPort,
      messaging: manifest.messagingPlatforms,
      ...(entry.label ? { label: entry.label } : {}),
      ...(entry.icon ? { icon: entry.icon } : {}),
      recommended: entry.recommended,
    };
  });
  const agentSpecificProviders = new Map<string, NativeInstallerAgentName[]>();
  for (const agent of agents) {
    const manifest = loadAgent(agent.name);
    for (const provider of manifest.inferenceProviderOptions) {
      const existing = agentSpecificProviders.get(provider) ?? [];
      existing.push(agent.name);
      agentSpecificProviders.set(provider, existing);
    }
  }

  const model = asRecord(raw.model, "model");
  const providers = asArray(model.providers, "model.providers").map((provider, index) =>
    resolveProvider(provider, index, agents, agentSpecificProviders),
  );
  const defaultProvider = stringField(model, "default_provider", "model");
  if (!providers.some((provider) => provider.id === defaultProvider)) {
    throw new Error(`model.default_provider must be one of the resolved native Mac installer providers`);
  }
  const trust = asRecord(raw.trust, "trust");
  const tiers = asArray(trust.tiers, "trust.tiers").map(parseTrustTier);
  const review = asRecord(raw.review, "review");
  const install = asRecord(raw.install, "install");
  const defaultMode = optionalStringField(install, "default_mode") ?? "fresh";
  if (defaultMode !== "fresh" && defaultMode !== "resume") {
    throw new Error("install.default_mode must be fresh or resume");
  }

  return {
    version: 1,
    experimental: true,
    source: path.relative(deps.rootDir ?? ROOT, planPath) || planPath,
    target: "Apple Silicon macOS 13+",
    summary: stringField(raw, "summary", "install-plan.yaml"),
    requirements,
    agents,
    model: {
      defaultProvider,
      providers,
    },
    trust: {
      defaultTier: stringField(trust, "default_tier", "trust"),
      tiers,
    },
    review: {
      handoffPolicy: stringField(review, "handoff_policy", "review"),
      stockOnly: stringField(review, "stock_only", "review"),
    },
    install: {
      defaultSandboxName: stringField(install, "default_sandbox_name", "install"),
      defaultMode,
      progressPhases: asArray(install.progress_phases, "install.progress_phases").map(
        parseProgressPhase,
      ),
      baseImages: asArray(install.base_images, "install.base_images").map(parseBaseImage),
    },
    launch: parseLaunch(raw.launch),
  };
}
