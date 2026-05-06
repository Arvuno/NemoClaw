// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Generate Hermes config.yaml and .env from NemoClaw build-arg env vars.
//
// Called at Docker image build time. Reads NEMOCLAW_* env vars and writes:
//   ~/.hermes/config.yaml  — Hermes configuration (immutable at runtime)
//   ~/.hermes/.env         — Messaging token placeholders (immutable at runtime)
//
// Sets what's required for Hermes to run inside OpenShell:
//   - Model and inference endpoint (custom provider pointing at inference.local)
//   - API server on internal port (socat forwards to public port)
//   - Messaging platform tokens (if configured during onboard)
//   - Agent defaults (terminal, memory, skills, display)

import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CHANNEL_TOKEN_ENVS: Record<string, string[]> = {
  telegram: ["TELEGRAM_BOT_TOKEN"],
  discord: ["DISCORD_BOT_TOKEN"],
  slack: ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"],
};

const KNOWN_MODEL_SETUP_AGENTS = new Set(["openclaw", "hermes"]);
const MODEL_SETUP_EFFECT_KEYS: Record<string, Set<string>> = {
  openclaw: new Set(["openclawCompat", "openclawPlugins"]),
  hermes: new Set(["hermesCompat"]),
};

type ModelSetupManifest = {
  id: string;
  agent: string;
  description: string;
  match: {
    modelIds?: string[];
    providerKey?: string;
    inferenceApi?: string;
    baseUrl?: string;
  };
  effects: Record<string, unknown>;
};

type ModelSetupContext = {
  model: string;
  providerKey: string;
  inferenceApi: string;
  baseUrl: string;
};

function main(): void {
  const model = process.env.NEMOCLAW_MODEL!;
  const baseUrl = process.env.NEMOCLAW_INFERENCE_BASE_URL!;
  const providerKey = process.env.NEMOCLAW_PROVIDER_KEY || "custom";

  discoverModelSpecificSetups("hermes", {
    model,
    providerKey,
    inferenceApi: process.env.NEMOCLAW_INFERENCE_API || "",
    baseUrl,
  });

  const channelsB64 = process.env.NEMOCLAW_MESSAGING_CHANNELS_B64 || "W10=";
  const allowedIdsB64 = process.env.NEMOCLAW_MESSAGING_ALLOWED_IDS_B64 || "e30=";
  const discordGuildsB64 = process.env.NEMOCLAW_DISCORD_GUILDS_B64 || "e30=";
  const telegramConfigB64 = process.env.NEMOCLAW_TELEGRAM_CONFIG_B64 || "e30=";

  const msgChannels: string[] = JSON.parse(
    Buffer.from(channelsB64, "base64").toString("utf-8"),
  );
  const allowedIds: Record<string, (string | number)[]> = JSON.parse(
    Buffer.from(allowedIdsB64, "base64").toString("utf-8"),
  );
  const discordGuilds: Record<string, { requireMention?: boolean; users?: (string | number)[] }> =
    JSON.parse(Buffer.from(discordGuildsB64, "base64").toString("utf-8"));
  const telegramConfig: { requireMention?: boolean } = JSON.parse(
    Buffer.from(telegramConfigB64, "base64").toString("utf-8"),
  );

  const config: Record<string, unknown> = {
    _config_version: 12,
    model: {
      default: model,
      provider: "custom",
      base_url: baseUrl,
    },
    terminal: {
      backend: "local",
      timeout: 180,
    },
    agent: {
      max_turns: 60,
      reasoning_effort: "medium",
    },
    memory: {
      memory_enabled: true,
      user_profile_enabled: true,
    },
    skills: {
      creation_nudge_interval: 15,
    },
    display: {
      compact: false,
      tool_progress: "all",
    },
  };

  const enabledChannels = new Set(msgChannels);

  // Hermes v2026.4.23 reads Discord behavior from top-level `discord:`.
  // Bot tokens and user allowlists stay in .env so config.yaml never carries
  // real secrets or credential placeholders under platforms.discord.
  if (enabledChannels.has("discord")) {
    config.discord = buildDiscordConfig(discordGuilds);
  }

  if (enabledChannels.has("telegram") && typeof telegramConfig.requireMention === "boolean") {
    config.telegram = {
      require_mention: telegramConfig.requireMention,
    };
  }

  // API server — internal port only.
  // Hermes binds to 127.0.0.1 regardless of config (upstream bug).
  // socat in start.sh forwards 0.0.0.0:8642 -> 127.0.0.1:18642.
  config.platforms = {
    api_server: {
      enabled: true,
      extra: {
        port: 18642,
        host: "127.0.0.1",
      },
    },
  };

  // Write config.yaml — use inline YAML serialization (no external dep)
  const configPath = join(homedir(), ".hermes", "config.yaml");
  writeFileSync(configPath, toYaml(config));
  chmodSync(configPath, 0o600);

  // Write .env — API server config and messaging token placeholders
  const envLines: string[] = [
    "API_SERVER_PORT=18642",
    "API_SERVER_HOST=127.0.0.1",
  ];
  for (const ch of enabledChannels) {
    const envKeys = CHANNEL_TOKEN_ENVS[ch] ?? [];
    for (const envKey of envKeys) {
      envLines.push(`${envKey}=openshell:resolve:env:${envKey}`);
    }
  }
  const discordAllowedUsers = collectDiscordAllowedUsers(allowedIds, discordGuilds);
  if (discordAllowedUsers.length > 0) {
    envLines.push(`DISCORD_ALLOWED_USERS=${discordAllowedUsers.join(",")}`);
  }
  if (allowedIds.telegram?.length) {
    envLines.push(`TELEGRAM_ALLOWED_USERS=${allowedIds.telegram.map(String).join(",")}`);
  }

  const envPath = join(homedir(), ".hermes", ".env");
  writeFileSync(envPath, envLines.length > 0 ? envLines.join("\n") + "\n" : "");
  chmodSync(envPath, 0o600);

  console.log(`[config] Wrote ${configPath} (model=${model}, provider=custom)`);
  console.log(`[config] Wrote ${envPath} (${envLines.length} entries)`);
}

function discoverModelSpecificSetups(
  agent: "hermes",
  context: ModelSetupContext,
): ModelSetupManifest[] {
  const registryRoot = findRegistryRoot();
  if (!registryRoot) return [];

  const manifests: ModelSetupManifest[] = [];
  for (const manifestPath of listJsonFiles(registryRoot)) {
    if (manifestPath.endsWith("/schema.json")) continue;
    const payload = validateManifestPayload(
      JSON.parse(readFileSync(manifestPath, "utf-8")),
      manifestPath,
    );
    if (payload.agent !== agent) continue;
    validateSelectedAgentEffects(payload, manifestPath);
    if (modelSetupMatches(payload, context)) {
      manifests.push(payload);
    }
  }
  return manifests;
}

function findRegistryRoot(): string | null {
  const roots = [
    process.env.NEMOCLAW_MODEL_SPECIFIC_SETUP_DIR,
    "/opt/nemoclaw-blueprint/model-specific-setup",
    "/sandbox/.nemoclaw/blueprints/0.1.0/model-specific-setup",
    join(process.cwd(), "nemoclaw-blueprint", "model-specific-setup"),
  ].filter((entry): entry is string => Boolean(entry));

  for (const root of [...new Set(roots)]) {
    if (existsSync(root) && statSync(root).isDirectory()) return root;
  }
  return null;
}

function listJsonFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function validateManifestPayload(payload: unknown, manifestPath: string): ModelSetupManifest {
  if (!isRecord(payload)) {
    throw new Error(`${manifestPath}: manifest must be a JSON object`);
  }
  if (!isNonEmptyString(payload.id)) {
    throw new Error(`${manifestPath}: field 'id' must be a non-empty string`);
  }
  if (!isNonEmptyString(payload.agent)) {
    throw new Error(`${manifestPath}: field 'agent' is required`);
  }
  if (!KNOWN_MODEL_SETUP_AGENTS.has(payload.agent)) {
    throw new Error(`${manifestPath}: unknown agent '${payload.agent}'`);
  }
  if (!isNonEmptyString(payload.description)) {
    throw new Error(`${manifestPath}: field 'description' must be a non-empty string`);
  }
  if (!isRecord(payload.match)) {
    throw new Error(`${manifestPath}: field 'match' must be an object`);
  }
  validateMatch(payload.match, manifestPath);
  if (!isRecord(payload.effects) || Object.keys(payload.effects).length === 0) {
    throw new Error(`${manifestPath}: field 'effects' must be a non-empty object`);
  }
  return payload as ModelSetupManifest;
}

function validateMatch(match: Record<string, unknown>, manifestPath: string): void {
  const allowedKeys = new Set(["modelIds", "providerKey", "inferenceApi", "baseUrl"]);
  const unknownKeys = Object.keys(match).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${manifestPath}: unknown match keys: ${unknownKeys.join(", ")}`);
  }

  if (
    match.modelIds !== undefined &&
    (!Array.isArray(match.modelIds) ||
      match.modelIds.length === 0 ||
      !match.modelIds.every(isNonEmptyString))
  ) {
    throw new Error(`${manifestPath}: match.modelIds must be a non-empty string array`);
  }
  for (const key of ["providerKey", "inferenceApi", "baseUrl"]) {
    const value = match[key];
    if (value !== undefined && !isNonEmptyString(value)) {
      throw new Error(`${manifestPath}: match.${key} must be a non-empty string`);
    }
  }
}

function validateSelectedAgentEffects(payload: ModelSetupManifest, manifestPath: string): void {
  const allowedEffectKeys = MODEL_SETUP_EFFECT_KEYS[payload.agent];
  const unknownEffectKeys = Object.keys(payload.effects).filter(
    (key) => !allowedEffectKeys.has(key),
  );
  if (unknownEffectKeys.length > 0) {
    throw new Error(
      `${manifestPath}: unknown effects for agent '${payload.agent}': ${
        unknownEffectKeys.join(", ")
      }`,
    );
  }

  if (payload.agent === "hermes") {
    const compat = payload.effects.hermesCompat;
    if (compat !== undefined && !isRecord(compat)) {
      throw new Error(`${manifestPath}: effects.hermesCompat must be an object`);
    }
  }
}

function modelSetupMatches(payload: ModelSetupManifest, context: ModelSetupContext): boolean {
  const match = payload.match;
  if (
    match.modelIds &&
    !new Set(match.modelIds.map((modelId) => modelId.trim().toLowerCase())).has(
      context.model.trim().toLowerCase(),
    )
  ) {
    return false;
  }
  if (match.providerKey && context.providerKey !== match.providerKey) return false;
  if (match.inferenceApi && context.inferenceApi !== match.inferenceApi) return false;
  if (match.baseUrl && trimTrailingSlash(context.baseUrl) !== trimTrailingSlash(match.baseUrl)) {
    return false;
  }
  return true;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildDiscordConfig(
  discordGuilds: Record<string, { requireMention?: boolean; users?: (string | number)[] }>,
): Record<string, unknown> {
  return {
    require_mention: getDiscordRequireMention(discordGuilds),
    free_response_channels: "",
    allowed_channels: "",
    auto_thread: true,
    reactions: true,
    channel_prompts: {},
  };
}

function getDiscordRequireMention(
  discordGuilds: Record<string, { requireMention?: boolean }>,
): boolean {
  for (const guildConfig of Object.values(discordGuilds)) {
    if (typeof guildConfig?.requireMention === "boolean") {
      return guildConfig.requireMention;
    }
  }
  return true;
}

function collectDiscordAllowedUsers(
  allowedIds: Record<string, (string | number)[]>,
  discordGuilds: Record<string, { users?: (string | number)[] }>,
): string[] {
  const users = new Set<string>();
  for (const user of allowedIds.discord ?? []) {
    users.add(String(user));
  }
  for (const guildConfig of Object.values(discordGuilds)) {
    for (const user of guildConfig?.users ?? []) {
      users.add(String(user));
    }
  }
  return [...users];
}

/** Minimal YAML serializer for flat/nested objects — no external dependency. */
function toYaml(obj: Record<string, unknown>, indent: number = 0): string {
  const pad = "  ".repeat(indent);
  let out = "";
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      out += `${pad}${key}: null\n`;
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        out += `${pad}${key}: []\n`;
      } else {
        out += `${pad}${key}:\n`;
        for (const item of value) {
          if (typeof item === "object" && item !== null) {
            out += `${pad}-\n`;
            out += toYaml(item as Record<string, unknown>, indent + 1);
          } else if (typeof item === "string") {
            out += `${pad}- ${yamlString(item)}\n`;
          } else if (typeof item === "number" || typeof item === "boolean") {
            out += `${pad}- ${item}\n`;
          }
        }
      }
    } else if (typeof value === "object" && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        out += `${pad}${key}: {}\n`;
      } else {
        out += `${pad}${key}:\n`;
        out += toYaml(value as Record<string, unknown>, indent + 1);
      }
    } else if (typeof value === "string") {
      out += `${pad}${key}: ${yamlString(value)}\n`;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out += `${pad}${key}: ${value}\n`;
    }
  }
  return out;
}

/** Quote a YAML string if it contains special characters. */
function yamlString(s: string): string {
  if (s === "") {
    return JSON.stringify(s);
  }
  if (/[:{}\[\],&*?|>!%@`#'"]/.test(s) || s.includes("\n") || s.trim() !== s) {
    return JSON.stringify(s);
  }
  return s;
}

main();
