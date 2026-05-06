// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";

export const DEFAULT_GATEWAY_NAME = "nemoclaw";
export const NEMOCLAW_PROVIDERS = [
  "nvidia-nim",
  "vllm-local",
  "ollama-local",
  "nvidia-ncp",
  "nim-local",
] as const;
export const NEMOCLAW_OLLAMA_MODELS = ["nemotron-3-super:120b", "nemotron-3-nano:30b"] as const;

export interface UninstallPathOptions {
  home: string;
  tmpDir?: string;
  xdgBinHome?: string;
}

export interface UninstallPaths {
  helperServiceGlob: string;
  nemoclawConfigDir: string;
  nemoclawShimPath: string;
  nemoclawStateDir: string;
  openshellConfigDir: string;
  openshellInstallPaths: string[];
  runtimeTempGlobs: string[];
}

export function gatewayVolumeCandidates(gatewayName = DEFAULT_GATEWAY_NAME): string[] {
  return [`openshell-cluster-${gatewayName}`];
}

export function defaultUninstallPaths(options: UninstallPathOptions): UninstallPaths {
  const xdgBinHome = options.xdgBinHome || path.join(options.home, ".local", "bin");
  const tmpDir = options.tmpDir || "/tmp";
  return {
    helperServiceGlob: path.join(tmpDir, "nemoclaw-services-*"),
    nemoclawConfigDir: path.join(options.home, ".config", "nemoclaw"),
    nemoclawShimPath: path.join(options.home, ".local", "bin", "nemoclaw"),
    nemoclawStateDir: path.join(options.home, ".nemoclaw"),
    openshellConfigDir: path.join(options.home, ".config", "openshell"),
    openshellInstallPaths: ["/usr/local/bin/openshell", path.join(xdgBinHome, "openshell")],
    runtimeTempGlobs: [path.join(tmpDir, "nemoclaw-create-*.log"), path.join(tmpDir, "nemoclaw-tg-ssh-*.conf")],
  };
}

export function uninstallStatePaths(paths: Pick<UninstallPaths, "nemoclawConfigDir" | "nemoclawStateDir" | "openshellConfigDir">): string[] {
  return [paths.nemoclawStateDir, paths.openshellConfigDir, paths.nemoclawConfigDir];
}
