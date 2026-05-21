// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { runOnboardAction } from "../../actions/global";
import { NOTICE_ACCEPT_FLAG } from "../../onboard/usage-notice";
import type { NativeInstallerConfig } from "./config";
import { loadNativeInstallerInstallPlan, type NativeInstallerInstallPlan } from "./describe";

export interface NativeInstallerProgressEvent {
  phase: "plan_loaded" | "onboard_started" | "onboard_finished" | "launch_ready" | "failed";
  status: "started" | "ok" | "failed";
  message: string;
  detail?: Record<string, unknown>;
}

export interface NativeInstallerInstallDeps {
  emit?: (event: NativeInstallerProgressEvent) => void;
  runOnboardAction?: (args: string[]) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  plan?: NativeInstallerInstallPlan;
  loadPlan?: () => NativeInstallerInstallPlan;
}

export class NativeInstallerInstallError extends Error {
  readonly event: NativeInstallerProgressEvent;
  constructor(event: NativeInstallerProgressEvent, options?: ErrorOptions) {
    super(event.message, options);
    this.name = "NativeInstallerInstallError";
    this.event = event;
  }
}

function emit(deps: NativeInstallerInstallDeps, event: NativeInstallerProgressEvent): void {
  deps.emit?.(event);
}

export function toLegacyOnboardArgs(config: NativeInstallerConfig): string[] {
  const args = ["--non-interactive", "--yes", NOTICE_ACCEPT_FLAG];
  if (config.mode === "resume") args.push("--resume");
  else args.push("--fresh");
  args.push("--agent", config.agent);
  if (config.sandboxName) args.push("--name", config.sandboxName);
  const port = config.agent === "hermes" ? config.ports?.api : config.ports?.dashboard;
  if (port) args.push("--control-ui-port", String(port));
  return args;
}

export const buildNativeInstallerOnboardArgs = toLegacyOnboardArgs;

function applyBaseImageEnv(
  env: NodeJS.ProcessEnv,
  config: NativeInstallerConfig,
  plan: NativeInstallerInstallPlan,
): void {
  for (const baseImage of plan.install.baseImages) {
    if (baseImage.agent !== config.agent || !baseImage.applyByDefault) continue;
    if (!env[baseImage.env]) env[baseImage.env] = baseImage.ref;
  }
}

export function buildNativeInstallerOnboardEnv(
  config: NativeInstallerConfig,
  base: NodeJS.ProcessEnv = process.env,
  plan: NativeInstallerInstallPlan = loadNativeInstallerInstallPlan(),
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  env.NEMOCLAW_AGENT = config.agent;
  env.NEMOCLAW_NON_INTERACTIVE = "1";
  env.NEMOCLAW_ACCEPT_THIRD_PARTY_SOFTWARE = "1";
  if (config.provider) env.NEMOCLAW_PROVIDER = config.provider;
  if (config.model) env.NEMOCLAW_MODEL = config.model;
  if (config.endpoint) env.NEMOCLAW_ENDPOINT_URL = config.endpoint;
  if (config.provider === "hermesProvider" && !env.NEMOCLAW_HERMES_AUTH_METHOD) {
    env.NEMOCLAW_HERMES_AUTH_METHOD = "api_key";
  }
  if (config.security?.tier) env.NEMOCLAW_POLICY_TIER = config.security.tier;
  if (config.security?.presets && config.security.presets.length > 0) {
    env.NEMOCLAW_POLICY_MODE = "custom";
    env.NEMOCLAW_POLICY_PRESETS = config.security.presets.join(",");
  }
  if (config.messaging && config.messaging.length > 0) {
    env.NEMOCLAW_MESSAGING_CHANNELS = config.messaging.join(",");
  }
  applyBaseImageEnv(env, config, plan);
  return env;
}

async function withTemporaryProcessEnv<T>(
  env: NodeJS.ProcessEnv,
  fn: () => Promise<T>,
): Promise<T> {
  const touched = new Set(Object.keys(env));
  const previous = new Map<string, string | undefined>();
  for (const key of touched) {
    previous.set(key, process.env[key]);
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runNativeInstallerInstall(
  config: NativeInstallerConfig,
  deps: NativeInstallerInstallDeps = {},
): Promise<void> {
  const plan = deps.plan ?? deps.loadPlan?.() ?? loadNativeInstallerInstallPlan();
  emit(deps, {
    phase: "plan_loaded",
    status: "ok",
    message: "Mac Installer Preview plan loaded.",
    detail: { source: plan.source, agent: config.agent },
  });

  const onboardEnv = buildNativeInstallerOnboardEnv(config, deps.env ?? process.env, plan);
  const onboardArgs = toLegacyOnboardArgs(config);
  emit(deps, {
    phase: "onboard_started",
    status: "started",
    message: `Starting standard NemoClaw onboard for ${config.agent}.`,
    detail: { args: onboardArgs },
  });

  try {
    await withTemporaryProcessEnv(onboardEnv, async () => {
      await (deps.runOnboardAction ?? runOnboardAction)(onboardArgs);
    });
  } catch (error) {
    const event: NativeInstallerProgressEvent = {
      phase: "failed",
      status: "failed",
      message: "NemoClaw onboard did not finish.",
      detail: { error: errorMessage(error) },
    };
    emit(deps, event);
    throw new NativeInstallerInstallError(event, error instanceof Error ? { cause: error } : undefined);
  }

  emit(deps, {
    phase: "onboard_finished",
    status: "ok",
    message: "NemoClaw onboard completed.",
  });
  emit(deps, {
    phase: "launch_ready",
    status: "ok",
    message: "Launch details are ready.",
  });
}

export function progressEventToJsonLine(event: NativeInstallerProgressEvent): string {
  return JSON.stringify({ ...event, experimental: true });
}
