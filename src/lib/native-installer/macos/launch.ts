// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";

import { captureOpenshell } from "../../adapters/openshell/runtime";
import { DASHBOARD_PORT } from "../../core/ports";
import * as registry from "../../state/registry";
import { loadAgent } from "../../agent/defs";
import { isNativeInstallerAgentName, type NativeInstallerAgentName } from "./images";

export interface NativeInstallerLaunchInfo {
  agent: NativeInstallerAgentName;
  sandboxName: string;
  kind: "ui" | "api";
  url: string;
  token?: string | null;
  terminalCommand?: string;
  api?: {
    baseUrl: string;
    chatCompletionsUrl: string;
    healthUrl: string;
    token: string | null;
    authHeader: string | null;
  };
  sensitive: boolean;
}

export interface NativeInstallerLaunchDeps {
  getDefaultSandbox?: () => string | null;
  getSandbox?: (name: string) => registry.SandboxEntry | null;
  listSandboxes?: () => registry.SandboxRegistry;
  fetchOpenClawToken?: (sandboxName: string) => string | null;
  fetchHermesApiServerKey?: (sandboxName: string) => string | null;
  openUrl?: (url: string) => void;
}

function defaultFetchOpenClawToken(sandboxName: string): string | null {
  const onboard = require("../../onboard") as {
    fetchGatewayAuthTokenFromSandbox: (name: string) => string | null;
  };
  return onboard.fetchGatewayAuthTokenFromSandbox(sandboxName);
}

function defaultFetchHermesApiServerKey(sandboxName: string): string | null {
  const result = captureOpenshell(
    [
      "sandbox",
      "exec",
      "-n",
      sandboxName,
      "--",
      "sh",
      "-lc",
      "[ -f /sandbox/.hermes/.env ] && set -a && . /sandbox/.hermes/.env && set +a; printf '%s' \"${API_SERVER_KEY:-}\"",
    ],
    { ignoreError: true, timeout: 10_000 },
  );
  if (result.status !== 0) return null;
  const token = (result.output || "").trim();
  return token || null;
}

function defaultOpenUrl(url: string): void {
  if (process.platform === "darwin") {
    spawnSync("open", [url], { stdio: "ignore" });
  }
}

function resolveSandbox(
  agent: NativeInstallerAgentName | undefined,
  deps: NativeInstallerLaunchDeps,
): registry.SandboxEntry | null {
  const list = deps.listSandboxes ? deps.listSandboxes() : registry.load();
  const defaultName = deps.getDefaultSandbox ? deps.getDefaultSandbox() : registry.getDefault();
  const defaultEntry = defaultName ? list.sandboxes[defaultName] ?? null : null;
  const targetAgent = agent ?? ((defaultEntry?.agent || "openclaw") as NativeInstallerAgentName);
  if (!isNativeInstallerAgentName(targetAgent)) return null;
  if (defaultEntry && (defaultEntry.agent || "openclaw") === targetAgent) return defaultEntry;
  return (
    Object.values(list.sandboxes).find((entry) => (entry.agent || "openclaw") === targetAgent) ??
    null
  );
}

export function buildNativeInstallerLaunchInfo(
  agent: NativeInstallerAgentName | undefined,
  deps: NativeInstallerLaunchDeps = {},
): NativeInstallerLaunchInfo {
  const sandbox = resolveSandbox(agent, deps);
  if (!sandbox) {
    throw new Error(
      agent
        ? `No registered ${agent} sandbox found. Run nemoclaw native-installer mac install first.`
        : "No registered sandbox found. Run nemoclaw native-installer mac install first.",
    );
  }

  const resolvedAgent = ((sandbox.agent || "openclaw") as NativeInstallerAgentName);
  if (!isNativeInstallerAgentName(resolvedAgent)) {
    throw new Error(`Sandbox '${sandbox.name}' uses unsupported agent '${sandbox.agent}'.`);
  }

  const agentDef = loadAgent(resolvedAgent);
  const port = sandbox.dashboardPort ?? agentDef.forwardPort ?? DASHBOARD_PORT;
  if (resolvedAgent === "hermes") {
    const baseUrl = `http://127.0.0.1:${String(port)}${agentDef.dashboard.path}`;
    const token = (deps.fetchHermesApiServerKey ?? defaultFetchHermesApiServerKey)(sandbox.name);
    return {
      agent: resolvedAgent,
      sandboxName: sandbox.name,
      kind: "api",
      url: baseUrl,
      api: {
        baseUrl,
        chatCompletionsUrl: `${baseUrl.replace(/\/$/, "")}/chat/completions`,
        healthUrl: `http://127.0.0.1:${String(port)}/health`,
        token,
        authHeader: token ? `Authorization: Bearer ${token}` : null,
      },
      sensitive: Boolean(token),
    };
  }

  const token = (deps.fetchOpenClawToken ?? defaultFetchOpenClawToken)(sandbox.name);
  const url = token
    ? `http://127.0.0.1:${String(port)}/#token=${encodeURIComponent(token)}`
    : `http://127.0.0.1:${String(port)}/`;
  return {
    agent: "openclaw",
    sandboxName: sandbox.name,
    kind: "ui",
    url,
    token,
    terminalCommand: `nemoclaw ${sandbox.name} connect`,
    sensitive: Boolean(token),
  };
}

export function runNativeInstallerLaunch(
  agent: NativeInstallerAgentName | undefined,
  options: { open?: boolean } = {},
  deps: NativeInstallerLaunchDeps = {},
): NativeInstallerLaunchInfo {
  const info = buildNativeInstallerLaunchInfo(agent, deps);
  if (options.open !== false && info.kind === "ui") {
    (deps.openUrl ?? defaultOpenUrl)(info.url);
  }
  return info;
}

export function renderNativeInstallerLaunchText(info: NativeInstallerLaunchInfo): string[] {
  if (info.kind === "api" && info.api) {
    const lines = [
      `Hermes Agent API for sandbox '${info.sandboxName}'`,
      `Endpoint: ${info.api.baseUrl}`,
      `Health:   ${info.api.healthUrl}`,
    ];
    if (info.api.token) lines.push("Token:    included in --json output; treat it like a password.");
    return lines;
  }
  return [
    `OpenClaw UI for sandbox '${info.sandboxName}'`,
    "Opened the local UI in your browser.",
    info.terminalCommand ? `Terminal: ${info.terminalCommand}` : "",
  ].filter(Boolean);
}
