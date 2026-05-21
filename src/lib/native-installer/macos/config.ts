// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";

import { isNativeInstallerAgentName, type NativeInstallerAgentName } from "./images";
import { formatNativeInstallerProviderIds, isNativeInstallerProviderId } from "./providers";

export type NativeInstallerMode = "fresh" | "resume";

export interface NativeInstallerConfig {
  agent: NativeInstallerAgentName;
  sandboxName?: string;
  provider?: string;
  model?: string;
  endpoint?: string;
  security?: {
    tier?: string;
    presets?: string[];
  };
  messaging?: string[];
  mode?: NativeInstallerMode;
  ports?: {
    dashboard?: number;
    api?: number;
  };
}

export interface NativeInstallerConfigValidation {
  ok: boolean;
  config?: NativeInstallerConfig;
  errors: string[];
}

const SUPPORTED_MODES = new Set(["fresh", "resume"]);
const SECRET_KEY_RE = /(^|[_-])(secret|token|password|credential)([_-]|$)|api[_-]?key|key$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    errors.push(`${key} must be an array of strings`);
    return undefined;
  }
  return value.map((entry) => entry.trim()).filter(Boolean);
}

function readPort(value: unknown, label: string, errors: string[]): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 1024 || (value as number) > 65535) {
    errors.push(`${label} must be an integer TCP port between 1024 and 65535`);
    return undefined;
  }
  return value as number;
}

function findSecretKeys(value: unknown, prefix = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findSecretKeys(entry, `${prefix}[${String(index)}]`));
  }
  if (!isPlainObject(value)) return [];
  const findings: string[] = [];
  for (const [key, nested] of Object.entries(value)) {
    const pathLabel = `${prefix}.${key}`;
    if (SECRET_KEY_RE.test(key)) findings.push(pathLabel);
    findings.push(...findSecretKeys(nested, pathLabel));
  }
  return findings;
}

export function validateNativeInstallerConfig(input: unknown): NativeInstallerConfigValidation {
  const errors: string[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["config must be a JSON object"] };
  }

  for (const keyPath of findSecretKeys(input)) {
    errors.push(`secrets must not be stored in native Mac installer config JSON (${keyPath})`);
  }

  if ("from" in input || "dockerfile" in input || "customDockerfile" in input) {
    errors.push("Mac Installer Preview v1 supports stock OpenClaw and Hermes only; custom Dockerfiles use nemoclaw onboard --from");
  }

  const agent = readString(input, "agent");
  if (!agent || !isNativeInstallerAgentName(agent)) {
    errors.push("agent must be one of openclaw, hermes");
  }

  const mode = readString(input, "mode");
  if (mode && !SUPPORTED_MODES.has(mode)) {
    errors.push("mode must be fresh or resume");
  }

  const provider = readString(input, "provider");
  if (provider && !isNativeInstallerProviderId(provider)) {
    errors.push(
      `provider must be one of the installer-supported native Mac installer providers: ${formatNativeInstallerProviderIds()}`,
    );
  }
  const endpoint = readString(input, "endpoint");

  const securityValue = input.security;
  let security: NativeInstallerConfig["security"];
  if (securityValue !== undefined) {
    if (!isPlainObject(securityValue)) {
      errors.push("security must be an object");
    } else {
      const tier = readString(securityValue, "tier");
      const presets = readStringArray(securityValue, "presets", errors);
      security = {
        ...(tier ? { tier } : {}),
        ...(presets ? { presets } : {}),
      };
    }
  }

  let ports: NativeInstallerConfig["ports"];
  if (input.ports !== undefined) {
    if (!isPlainObject(input.ports)) {
      errors.push("ports must be an object");
    } else {
      ports = {
        dashboard: readPort(input.ports.dashboard, "ports.dashboard", errors),
        api: readPort(input.ports.api, "ports.api", errors),
      };
      if (ports.dashboard === undefined) delete ports.dashboard;
      if (ports.api === undefined) delete ports.api;
    }
  }

  const messaging = readStringArray(input, "messaging", errors);
  const sandboxName = readString(input, "sandboxName");
  const model = readString(input, "model");

  if (errors.length > 0 || !agent || !isNativeInstallerAgentName(agent)) {
    return { ok: false, errors };
  }

  const config: NativeInstallerConfig = {
    agent,
    ...(sandboxName ? { sandboxName } : {}),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(security ? { security } : {}),
    ...(messaging ? { messaging } : {}),
    ...(mode ? { mode: mode as NativeInstallerMode } : {}),
    ...(ports ? { ports } : {}),
  };

  return { ok: true, config, errors: [] };
}

export function loadNativeInstallerConfigFile(filePath: string): NativeInstallerConfig {
  const resolved = path.resolve(filePath);
  const validation = validateNativeInstallerConfig(JSON.parse(fs.readFileSync(resolved, "utf8")));
  if (!validation.ok || !validation.config) {
    throw new Error(validation.errors.join("\n"));
  }
  return validation.config;
}
