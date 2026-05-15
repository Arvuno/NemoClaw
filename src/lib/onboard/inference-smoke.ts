// @ts-nocheck
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const { getCredential } = require("../credentials/store");
const { compactText } = require("../core/url-utils");
const { INFERENCE_ROUTE_URL } = require("../inference/config");
const { getProbeAuthMode, probeOpenAiLikeEndpoint } = require("../inference/onboard-probes");
const { redact } = require("../runner");
const { REMOTE_PROVIDER_CONFIG } = require("./providers");

function shouldSmokeOpenAiLikeOnboardRoute(provider) {
  if (provider === "nvidia-nim" || provider === "nvidia-router") return true;
  return Object.values(REMOTE_PROVIDER_CONFIG).some(
    (entry) => entry.providerName === provider && entry.providerType === "openai",
  );
}

function verifyOnboardInferenceSmoke(options, deps = {}) {
  if (!shouldSmokeOpenAiLikeOnboardRoute(options.provider)) return;
  if (process.env.VITEST === "true") return;

  const hydrateCredentialEnv =
    deps.hydrateCredentialEnv || globalThis.__nemoclawHydrateCredentialEnv || (() => null);
  const endpointUrl = options.endpointUrl || INFERENCE_ROUTE_URL;
  const credentialEnv = options.credentialEnv || null;
  const apiKey = credentialEnv
    ? hydrateCredentialEnv(credentialEnv) || getCredential(credentialEnv) || ""
    : "";
  const probe = probeOpenAiLikeEndpoint(endpointUrl, options.model, apiKey, {
    authMode: getProbeAuthMode(options.provider),
    skipResponsesProbe: true,
  });

  if (probe.ok) {
    console.log(`  ✓ Inference smoke passed: ${options.provider} / ${options.model}`);
    return;
  }

  console.error("  Onboard inference smoke check failed.");
  console.error(`  Provider: ${options.provider}`);
  console.error(`  Model: ${options.model}`);
  console.error(`  API base: ${endpointUrl}`);
  if (credentialEnv) console.error(`  Credential env: ${credentialEnv}`);
  console.error(`  Upstream error: ${compactText(redact(probe.message || "unknown inference failure"))}`);
  process.exit(1);
}

module.exports = {
  shouldSmokeOpenAiLikeOnboardRoute,
  verifyOnboardInferenceSmoke,
};
