// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Session, SessionUpdates } from "../../../state/onboard-session";

export interface PolicyPresetEntry {
  name: string;
  [key: string]: unknown;
}

export interface PoliciesStateOptions<Agent, WebSearchConfig> {
  resume: boolean;
  sandboxName: string;
  provider: string;
  model: string;
  endpointUrl: string | null;
  credentialEnv: string | null;
  selectedMessagingChannels: string[];
  webSearchConfig: WebSearchConfig | null;
  webSearchSupported: boolean;
  hermesToolGateways: string[];
  agent: Agent;
  deps: {
    loadSession(): Session | null;
    getActiveMessagingChannels(sandboxName: string): string[] | null | undefined;
    verifyCompatibleEndpointSandboxSmoke(options: {
      sandboxName: string;
      provider: string;
      model: string;
      endpointUrl: string | null;
      credentialEnv: string | null;
      messagingChannels: string[];
      agent: Agent;
    }): void;
    listSetupPolicyPresets(
      sandboxName: string,
      options: { webSearchSupported: boolean },
    ): PolicyPresetEntry[];
    getAppliedPolicyPresets(sandboxName: string): string[];
    listCustomPolicyPresets(sandboxName: string): PolicyPresetEntry[];
    clampSetupPolicyPresetNames(
      names: string[],
      selectablePresets: PolicyPresetEntry[],
      options: { webSearchSupported: boolean },
      customPresetNames: Set<string>,
    ): string[];
    mergeRequiredHermesToolGatewayPolicyPresets(
      selectedPresets: string[],
      hermesToolGateways: string[],
      selectablePresetNames: string[],
    ): string[];
    arePolicyPresetsApplied(sandboxName: string, selectedPresets: string[]): boolean;
    skippedStepMessage(stepName: string, detail?: string | null): void;
    recordStateSkipped(state: "policies", metadata?: Record<string, unknown> | null): Promise<Session>;
    startRecordedStep(
      stepName: string,
      updates: { sandboxName: string; provider: string; model: string; policyPresets: string[] },
    ): Promise<void>;
    setupPoliciesWithSelection(
      sandboxName: string,
      options: {
        selectedPresets: string[] | null;
        enabledChannels: string[];
        webSearchConfig: WebSearchConfig | null;
        provider: string;
        webSearchSupported: boolean;
        hermesToolGateways: string[];
        onSelection: (policyPresets: string[]) => void;
      },
    ): Promise<string[]>;
    updateSession(mutator: (session: Session) => Session | void): Session;
    recordStepComplete(stepName: string, updates: SessionUpdates): Promise<Session>;
    toSessionUpdates(updates: Record<string, unknown>): SessionUpdates;
  };
}

export interface PoliciesStateResult {
  session: Session | null;
  recordedMessagingChannels: string[];
  appliedPolicyPresets: string[];
}

export async function handlePoliciesState<Agent, WebSearchConfig>({
  resume,
  sandboxName,
  provider,
  model,
  endpointUrl,
  credentialEnv,
  selectedMessagingChannels,
  webSearchConfig,
  webSearchSupported,
  hermesToolGateways,
  agent,
  deps,
}: PoliciesStateOptions<Agent, WebSearchConfig>): Promise<PoliciesStateResult> {
  const latestSession = deps.loadSession();
  const recordedPolicyPresets = Array.isArray(latestSession?.policyPresets)
    ? latestSession.policyPresets
    : null;
  const recordedMessagingChannels = Array.isArray(latestSession?.messagingChannels)
    ? latestSession.messagingChannels
    : [];
  const activeMessagingChannels = deps.getActiveMessagingChannels(sandboxName);
  deps.verifyCompatibleEndpointSandboxSmoke({
    sandboxName,
    provider,
    model,
    endpointUrl,
    credentialEnv,
    messagingChannels: Array.isArray(activeMessagingChannels) ? activeMessagingChannels : [],
    agent,
  });

  const policyPresetSupportOptions = { webSearchSupported };
  const selectablePolicyPresetsForSupport = [
    ...deps.listSetupPolicyPresets(sandboxName, policyPresetSupportOptions),
    ...deps.getAppliedPolicyPresets(sandboxName).map((name) => ({ name })),
  ];
  const customPolicyPresetNames = new Set(
    deps.listCustomPolicyPresets(sandboxName).map((preset) => preset.name),
  );
  let recordedPolicyPresetsForSupport = deps.clampSetupPolicyPresetNames(
    recordedPolicyPresets || [],
    selectablePolicyPresetsForSupport,
    policyPresetSupportOptions,
    customPolicyPresetNames,
  );
  if (recordedPolicyPresets) {
    recordedPolicyPresetsForSupport = deps.mergeRequiredHermesToolGatewayPolicyPresets(
      recordedPolicyPresetsForSupport,
      hermesToolGateways,
      selectablePolicyPresetsForSupport.map((preset) => preset.name),
    );
  }
  const recordedPolicyPresetsHaveUnsupported =
    Array.isArray(recordedPolicyPresets) &&
    recordedPolicyPresetsForSupport.length !== recordedPolicyPresets.length;
  const resumePolicies =
    resume &&
    !recordedPolicyPresetsHaveUnsupported &&
    deps.arePolicyPresetsApplied(sandboxName, recordedPolicyPresetsForSupport);

  let appliedPolicyPresets = recordedPolicyPresetsForSupport;
  let session: Session | null;
  if (resumePolicies) {
    deps.skippedStepMessage("policies", recordedPolicyPresetsForSupport.join(", "));
    await deps.recordStateSkipped("policies", {
      reason: "resume",
      policyPresets: recordedPolicyPresetsForSupport,
    });
    session = await deps.recordStepComplete(
      "policies",
      deps.toSessionUpdates({
        sandboxName,
        provider,
        model,
        policyPresets: recordedPolicyPresetsForSupport,
      }),
    );
  } else {
    await deps.startRecordedStep("policies", {
      sandboxName,
      provider,
      model,
      policyPresets: recordedPolicyPresetsForSupport,
    });
    appliedPolicyPresets = await deps.setupPoliciesWithSelection(sandboxName, {
      selectedPresets: Array.isArray(recordedPolicyPresets)
        ? recordedPolicyPresetsForSupport
        : null,
      enabledChannels:
        selectedMessagingChannels.length > 0
          ? selectedMessagingChannels
          : recordedMessagingChannels,
      webSearchConfig,
      provider,
      webSearchSupported,
      hermesToolGateways,
      onSelection: (policyPresets) => {
        deps.updateSession((current) => {
          current.policyPresets = policyPresets;
          return current;
        });
      },
    });
    session = await deps.recordStepComplete(
      "policies",
      deps.toSessionUpdates({ sandboxName, provider, model, policyPresets: appliedPolicyPresets }),
    );
  }

  return { session, recordedMessagingChannels, appliedPolicyPresets };
}
