// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  assessNativeInstallerHost,
  buildNativeInstallerLaunchInfo,
  buildNativeInstallerOnboardArgs,
  buildNativeInstallerOnboardEnv,
  loadNativeInstallerInstallPlan,
  runNativeInstallerInstall,
  toLegacyOnboardArgs,
  validateNativeInstallerConfig,
} from "../../../../dist/lib/native-installer";

function hostAssessment(overrides: Record<string, unknown> = {}) {
  return {
    platform: "darwin",
    isWsl: false,
    runtime: "docker-desktop",
    packageManager: "brew",
    systemctlAvailable: false,
    dockerServiceActive: null,
    dockerServiceEnabled: null,
    dockerInstalled: true,
    dockerRunning: true,
    dockerReachable: true,
    nodeInstalled: true,
    openshellInstalled: true,
    dockerInfoSummary: "29.0.0 · Docker Desktop",
    dockerCgroupVersion: "v2",
    dockerDefaultCgroupnsMode: "private",
    dockerStorageDriver: "overlay2",
    dockerUsesContainerdSnapshotter: false,
    dockerCpus: 6,
    dockerMemTotalBytes: 12 * 1024 ** 3,
    isContainerRuntimeUnderProvisioned: false,
    hasNestedOverlayConflict: false,
    requiresHostCgroupnsFix: false,
    isUnsupportedRuntime: false,
    isHeadlessLikely: false,
    hasNvidiaGpu: false,
    dockerCdiSpecDirs: [],
    cdiNvidiaGpuSpecMissing: false,
    nvidiaContainerToolkitInstalled: false,
    notes: [],
    ...overrides,
  };
}

describe("native Mac installer config", () => {
  it("accepts stock OpenClaw/Hermes configs and maps them to onboard", () => {
    const validation = validateNativeInstallerConfig({
      agent: "hermes",
      sandboxName: "hermes-mac-preview",
      provider: "openai",
      model: "gpt-5.4",
      endpoint: "https://api.openai.com/v1/",
      mode: "fresh",
      ports: { api: 18642 },
      security: { tier: "balanced", presets: ["github"] },
      messaging: ["slack"],
    });

    expect(validation.ok).toBe(true);
    expect(validation.config?.endpoint).toBe("https://api.openai.com/v1/");
    expect(buildNativeInstallerOnboardArgs(validation.config!)).toEqual([
      "--non-interactive",
      "--yes",
      "--yes-i-accept-third-party-software",
      "--fresh",
      "--agent",
      "hermes",
      "--name",
      "hermes-mac-preview",
      "--control-ui-port",
      "18642",
    ]);
    const env = buildNativeInstallerOnboardEnv(validation.config!, {});
    expect(env.NEMOCLAW_AGENT).toBe("hermes");
    expect(env.NEMOCLAW_PROVIDER).toBe("openai");
    expect(env.NEMOCLAW_POLICY_MODE).toBe("custom");
    expect(env.NEMOCLAW_POLICY_PRESETS).toBe("github");
    expect(env.NEMOCLAW_MESSAGING_CHANNELS).toBe("slack");
  });

  it("rejects provider ids that are not backed by the onboard installer catalog", () => {
    const validation = validateNativeInstallerConfig({
      agent: "openclaw",
      provider: "future-provider",
      model: "future/model",
      security: { tier: "future-tier" },
    });

    expect(validation.ok).toBe(false);
    expect(validation.errors.join("\n")).toContain("installer-supported native Mac installer providers");
  });

  it("rejects secrets and custom Dockerfiles in preview config", () => {
    const validation = validateNativeInstallerConfig({
      agent: "openclaw",
      customDockerfile: "./Dockerfile",
      OPENAI_API_KEY: "sk-test",
      token: "secret",
    });

    expect(validation.ok).toBe(false);
    expect(validation.errors.join("\n")).toContain("secrets must not be stored");
    expect(validation.errors.join("\n")).toContain("custom Dockerfiles");
  });
});

describe("native Mac installer assessment", () => {
  it("reports supported on a mocked macOS arm64 host with Docker reachable", () => {
    const assessment = assessNativeInstallerHost({
      platform: "darwin",
      arch: "arm64",
      macosVersion: "14.5",
      hostAssessment: hostAssessment() as any,
    });

    expect(assessment.supported).toBe(true);
    expect(assessment.host.dockerInstalled).toBe(true);
    expect(assessment.host.dockerReachable).toBe(true);
    expect(assessment.requirements.find((entry) => entry.id === "docker-daemon")?.status).toBe("pass");
  });

  it("surfaces missing Docker without trying to install a runtime", () => {
    const assessment = assessNativeInstallerHost({
      platform: "darwin",
      arch: "arm64",
      macosVersion: "14.5",
      hostAssessment: hostAssessment({
        dockerInstalled: false,
        dockerRunning: false,
        dockerReachable: false,
        dockerInfoSummary: undefined,
      }) as any,
    });

    expect(assessment.supported).toBe(false);
    expect(assessment.requirements.find((entry) => entry.id === "docker-cli")?.status).toBe("fail");
    expect(assessment.recoveryActions.join(" ")).toContain("Install Docker Desktop or Colima");
  });

  it("distinguishes installed Docker from an unreachable daemon", () => {
    const assessment = assessNativeInstallerHost({
      platform: "darwin",
      arch: "arm64",
      macosVersion: "14.5",
      hostAssessment: hostAssessment({
        dockerRunning: false,
        dockerReachable: false,
        dockerInfoSummary: undefined,
      }) as any,
    });

    expect(assessment.supported).toBe(false);
    expect(assessment.host.dockerInstalled).toBe(true);
    expect(assessment.requirements.find((entry) => entry.id === "docker-cli")?.status).toBe("pass");
    const daemon = assessment.requirements.find((entry) => entry.id === "docker-daemon");
    expect(daemon?.detail).toContain("installed");
    expect(daemon?.recovery).toContain("Start Docker Desktop or Colima");
    expect(assessment.recoveryActions.join(" ")).not.toContain("Install Docker");
  });
});

describe("native Mac installer describe", () => {
  it("validates and resolves install-plan.yaml with agent manifests", () => {
    const plan = loadNativeInstallerInstallPlan();

    expect(plan.experimental).toBe(true);
    expect(plan.source).toBe("release/native-installers/macos/install-plan.yaml");
    expect(plan.agents.map((agent) => agent.name)).toEqual(["openclaw", "hermes"]);
    expect(plan.install.defaultSandboxName).toBe("nemoclaw-mac-preview");
    expect(plan.agents.find((agent) => agent.name === "openclaw")?.description).toContain(
      "browser UI and messaging support",
    );
    expect(plan.agents.find((agent) => agent.name === "hermes")?.description).toContain(
      "OpenAI-compatible local API endpoint",
    );
    expect(plan.agents.find((agent) => agent.name === "hermes")?.dashboardKind).toBe("api");
    expect(plan.model.providers.some((provider) => provider.id === "openai")).toBe(true);
    expect(plan.model.providers.find((provider) => provider.id === "build")?.defaultModel).toBe(
      "nvidia/nemotron-3-super-120b-a12b",
    );
    expect(plan.model.providers.find((provider) => provider.id === "anthropic")?.defaultModel).toBe(
      "claude-sonnet-4-6",
    );
    expect(plan.model.providers.find((provider) => provider.id === "gemini")?.title).toBe(
      "Google Gemini",
    );
    expect(plan.model.providers.find((provider) => provider.id === "ollama")?.defaultModel).toBe(
      "nemotron-3-nano:30b",
    );
    expect(plan.model.providers.find((provider) => provider.id === "hermesProvider")?.envVar).toBe(
      "NOUS_API_KEY",
    );
    expect(
      plan.model.providers.find((provider) => provider.id === "hermesProvider")?.supportedAgents,
    ).toEqual(["hermes"]);
    expect(plan.install.baseImages.find((image) => image.agent === "openclaw")?.env).toBe(
      "NEMOCLAW_SANDBOX_BASE_IMAGE_REF",
    );
  });
});

describe("native Mac installer install", () => {
  it("delegates to onboard without pulling Docker images directly", async () => {
    const events: string[] = [];
    const runOnboardAction = vi.fn(async () => {});

    await runNativeInstallerInstall(
      { agent: "openclaw", sandboxName: "alpha", provider: "openai", model: "gpt-5.4" },
      {
        runOnboardAction,
        emit: (event) => events.push(`${event.phase}:${event.status}:${event.message}`),
      },
    );

    expect(events).toEqual([
      "plan_loaded:ok:Mac Installer Preview plan loaded.",
      "onboard_started:started:Starting standard NemoClaw onboard for openclaw.",
      "onboard_finished:ok:NemoClaw onboard completed.",
      "launch_ready:ok:Launch details are ready.",
    ]);
    expect(runOnboardAction).toHaveBeenCalledWith(
      expect.arrayContaining(["--agent", "openclaw", "--name", "alpha"]),
    );
  });

  it("maps onboard-owned base image overrides only when the plan opts in", () => {
    const plan = loadNativeInstallerInstallPlan();
    const optInPlan = {
      ...plan,
      install: {
        ...plan.install,
        baseImages: [
          {
            agent: "openclaw" as const,
            ref: "example.test/openclaw-base:preview",
            env: "NEMOCLAW_SANDBOX_BASE_IMAGE_REF",
            applyByDefault: true,
          },
        ],
      },
    };

    const env = buildNativeInstallerOnboardEnv({ agent: "openclaw" }, {}, optInPlan);
    expect(env.NEMOCLAW_SANDBOX_BASE_IMAGE_REF).toBe("example.test/openclaw-base:preview");
  });

  it("uses Hermes Provider's installer-supported API-key auth path in non-interactive mode", () => {
    const env = buildNativeInstallerOnboardEnv({ agent: "hermes", provider: "hermesProvider" }, {});

    expect(env.NEMOCLAW_PROVIDER).toBe("hermesProvider");
    expect(env.NEMOCLAW_HERMES_AUTH_METHOD).toBe("api_key");
  });

  it("keeps the legacy onboard argv translation explicit", () => {
    expect(toLegacyOnboardArgs({ agent: "hermes", mode: "resume", ports: { api: 18642 } })).toEqual([
      "--non-interactive",
      "--yes",
      "--yes-i-accept-third-party-software",
      "--resume",
      "--agent",
      "hermes",
      "--control-ui-port",
      "18642",
    ]);
  });
});

describe("Mac Installer Preview app", () => {
  it("uses a GUI-safe PATH with Homebrew locations", () => {
    const source = readFileSync(
      "apps/native-installers/macos/NemoClawMacInstaller/Sources/NemoClawMacInstaller/NemoClawMacInstallerApp.swift",
      "utf8",
    );

    expect(source).toContain("/opt/homebrew/bin:/usr/local/bin");
    expect(source).toContain("NEMOCLAW_MAC_INSTALLER_DIAGNOSTICS_DIR");
  });
});

describe("native Mac installer launch", () => {
  it("returns tokenized OpenClaw and Hermes endpoint details", () => {
    const openclaw = buildNativeInstallerLaunchInfo("openclaw", {
      listSandboxes: () => ({
        defaultSandbox: "alpha",
        sandboxes: { alpha: { name: "alpha", agent: "openclaw", dashboardPort: 18790 } },
      }),
      fetchOpenClawToken: () => "ui-token",
    });
    expect(openclaw.url).toBe("http://127.0.0.1:18790/#token=ui-token");
    expect(openclaw.terminalCommand).toBe("nemoclaw alpha connect");

    const hermes = buildNativeInstallerLaunchInfo("hermes", {
      listSandboxes: () => ({
        defaultSandbox: "hermes-box",
        sandboxes: { "hermes-box": { name: "hermes-box", agent: "hermes", dashboardPort: 18642 } },
      }),
      fetchHermesApiServerKey: () => "api-token",
    });
    expect(hermes.api?.baseUrl).toBe("http://127.0.0.1:18642/v1");
    expect(hermes.api?.authHeader).toBe("Authorization: Bearer api-token");
  });
});
