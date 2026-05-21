// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_OLLAMA_MODEL } from "../../inference/local";

type RemoteProviderConfig = {
  label: string;
  credentialEnv: string | null;
  endpointUrl: string;
  defaultModel: string;
};

const { REMOTE_PROVIDER_CONFIG } = require("../../onboard/providers") as {
  REMOTE_PROVIDER_CONFIG: Record<string, RemoteProviderConfig>;
};

export interface NativeInstallerProvider {
  id: string;
  title: string;
  defaultModel: string;
  envVar?: string;
  endpointUrl?: string;
}

function normalizeEnvVar(providerId: string, credentialEnv: string | null): string | undefined {
  if (providerId === "hermesProvider") {
    return "NOUS_API_KEY";
  }
  return credentialEnv || undefined;
}

export function listNativeInstallerProviders(): NativeInstallerProvider[] {
  const remoteProviders = Object.entries(REMOTE_PROVIDER_CONFIG)
    .filter(([, config]) => typeof config.endpointUrl === "string" && config.endpointUrl.trim())
    .map(([id, config]) => ({
      id,
      title: config.label,
      defaultModel: config.defaultModel,
      ...(normalizeEnvVar(id, config.credentialEnv)
        ? { envVar: normalizeEnvVar(id, config.credentialEnv) }
        : {}),
      endpointUrl: config.endpointUrl,
    }));

  return [
    ...remoteProviders,
    {
      id: "ollama",
      title: "Local Ollama",
      defaultModel: DEFAULT_OLLAMA_MODEL,
    },
  ];
}

export function getNativeInstallerProvider(id: string): NativeInstallerProvider | undefined {
  return listNativeInstallerProviders().find((provider) => provider.id === id);
}

export function isNativeInstallerProviderId(id: string): boolean {
  return !!getNativeInstallerProvider(id);
}

export function formatNativeInstallerProviderIds(): string {
  return listNativeInstallerProviders()
    .map((provider) => provider.id)
    .sort()
    .join(", ");
}
