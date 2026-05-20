// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import { createSession, type Session, type SessionUpdates } from "../../../state/onboard-session";
import { handlePoliciesState, type PoliciesStateOptions } from "./policies";

type Agent = { name: string } | null;
type WebSearchConfig = { fetchEnabled: true };

function createDeps(overrides: Partial<PoliciesStateOptions<Agent, WebSearchConfig>["deps"]> = {}) {
  let session = createSession();
  const calls = {
    load: vi.fn(() => session),
    activeChannels: vi.fn(() => ["telegram"]),
    smoke: vi.fn(),
    listSetup: vi.fn(() => [{ name: "npm" }, { name: "pypi" }, { name: "github" }]),
    applied: vi.fn(() => [] as string[]),
    custom: vi.fn(() => [] as { name: string }[]),
    clamp: vi.fn((names: string[]) => names.filter((name) => name !== "unsupported")),
    mergeHermes: vi.fn((selected: string[], tools: string[]) => [...selected, ...tools]),
    appliedCheck: vi.fn(() => false),
    skipped: vi.fn(),
    startStep: vi.fn(async () => undefined),
    setupPolicies: vi.fn(async () => ["npm"]),
    updateSession: vi.fn((mutator: (value: Session) => Session | void) => {
      session = mutator(session) ?? session;
      return session;
    }),
    complete: vi.fn(async () => session),
  };
  return {
    calls,
    deps: {
      loadSession: calls.load,
      getActiveMessagingChannels: calls.activeChannels,
      verifyCompatibleEndpointSandboxSmoke: calls.smoke,
      listSetupPolicyPresets: calls.listSetup,
      getAppliedPolicyPresets: calls.applied,
      listCustomPolicyPresets: calls.custom,
      clampSetupPolicyPresetNames: calls.clamp,
      mergeRequiredHermesToolGatewayPolicyPresets: calls.mergeHermes,
      arePolicyPresetsApplied: calls.appliedCheck,
      skippedStepMessage: calls.skipped,
      startRecordedStep: calls.startStep,
      setupPoliciesWithSelection: calls.setupPolicies,
      updateSession: calls.updateSession,
      recordStepComplete: calls.complete,
      toSessionUpdates: (updates: Record<string, unknown>) => updates as SessionUpdates,
      ...overrides,
    },
    setSession(next: Session) {
      session = next;
    },
    getSession: () => session,
  };
}

function baseOptions(
  deps: PoliciesStateOptions<Agent, WebSearchConfig>["deps"],
): PoliciesStateOptions<Agent, WebSearchConfig> {
  return {
    resume: false,
    sandboxName: "my-assistant",
    provider: "provider",
    model: "model",
    endpointUrl: "https://example.com/v1",
    credentialEnv: "NVIDIA_API_KEY",
    selectedMessagingChannels: [],
    webSearchConfig: null,
    webSearchSupported: true,
    hermesToolGateways: [],
    agent: null,
    deps,
  };
}

describe("handlePoliciesState", () => {
  it("runs compatible endpoint smoke before policy selection", async () => {
    const { deps, calls } = createDeps();

    await handlePoliciesState(baseOptions(deps));

    expect(calls.smoke).toHaveBeenCalledWith({
      sandboxName: "my-assistant",
      provider: "provider",
      model: "model",
      endpointUrl: "https://example.com/v1",
      credentialEnv: "NVIDIA_API_KEY",
      messagingChannels: ["telegram"],
      agent: null,
    });
    expect(calls.startStep).toHaveBeenCalledWith("policies", {
      sandboxName: "my-assistant",
      provider: "provider",
      model: "model",
      policyPresets: [],
    });
    expect(calls.setupPolicies).toHaveBeenCalledWith(
      "my-assistant",
      expect.objectContaining({
        selectedPresets: null,
        enabledChannels: [],
        provider: "provider",
        webSearchSupported: true,
      }),
    );
    expect(calls.complete).toHaveBeenCalledWith(
      "policies",
      expect.objectContaining({ policyPresets: ["npm"] }),
    );
  });

  it("uses recorded messaging channels when no active selection exists", async () => {
    const session = createSession({ messagingChannels: ["slack"] });
    const { deps, calls, setSession } = createDeps();
    setSession(session);

    await handlePoliciesState(baseOptions(deps));

    expect(calls.setupPolicies).toHaveBeenCalledWith(
      "my-assistant",
      expect.objectContaining({ enabledChannels: ["slack"] }),
    );
  });

  it("resumes policies when all recorded presets are already applied", async () => {
    const session = createSession({ policyPresets: ["npm"] });
    const { deps, calls, setSession } = createDeps({
      arePolicyPresetsApplied: vi.fn(() => true),
    });
    setSession(session);

    const result = await handlePoliciesState({ ...baseOptions(deps), resume: true });

    expect(calls.skipped).toHaveBeenCalledWith("policies", "npm");
    expect(calls.setupPolicies).not.toHaveBeenCalled();
    expect(calls.complete).toHaveBeenCalledWith(
      "policies",
      expect.objectContaining({ policyPresets: ["npm"] }),
    );
    expect(result.appliedPolicyPresets).toEqual(["npm"]);
  });

  it("clamps unsupported recorded presets before interactive setup", async () => {
    const session = createSession({ policyPresets: ["npm", "unsupported"] });
    const { deps, calls, setSession } = createDeps();
    setSession(session);

    await handlePoliciesState(baseOptions(deps));

    expect(calls.clamp).toHaveBeenCalledWith(
      ["npm", "unsupported"],
      expect.any(Array),
      { webSearchSupported: true },
      expect.any(Set),
    );
    expect(calls.setupPolicies).toHaveBeenCalledWith(
      "my-assistant",
      expect.objectContaining({ selectedPresets: ["npm"] }),
    );
  });

  it("merges required Hermes tool gateway presets into recorded selections", async () => {
    const session = createSession({ policyPresets: ["npm"] });
    const { deps, calls, setSession } = createDeps();
    setSession(session);

    await handlePoliciesState({ ...baseOptions(deps), hermesToolGateways: ["github"] });

    expect(calls.mergeHermes).toHaveBeenCalledWith(
      ["npm"],
      ["github"],
      ["npm", "pypi", "github"],
    );
    expect(calls.setupPolicies).toHaveBeenCalledWith(
      "my-assistant",
      expect.objectContaining({ selectedPresets: ["npm", "github"] }),
    );
  });
});
