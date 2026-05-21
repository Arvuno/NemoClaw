// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import os from "node:os";

import {
  assessHost,
  planHostRemediation,
  type AssessHostOpts,
  type HostAssessment,
  type RemediationAction,
} from "../../onboard/preflight";
import { loadNativeInstallerInstallPlan, type NativeInstallerInstallPlan } from "./describe";

export interface NativeInstallerRequirement {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  recovery?: string;
}

export interface NativeInstallerAssessment {
  experimental: true;
  supported: boolean;
  platform: {
    os: NodeJS.Platform | string;
    arch: string;
    macosVersion?: string | null;
    target: "Apple Silicon macOS 13+";
  };
  host: Pick<
    HostAssessment,
    | "runtime"
    | "dockerInstalled"
    | "dockerRunning"
    | "dockerReachable"
    | "dockerInfoSummary"
    | "dockerCpus"
    | "dockerMemTotalBytes"
    | "openshellInstalled"
    | "nodeInstalled"
  >;
  requirements: NativeInstallerRequirement[];
  remediation: RemediationAction[];
  recoveryActions: string[];
  baseImages: NativeInstallerInstallPlan["install"]["baseImages"];
}

export interface NativeInstallerAssessmentDeps extends AssessHostOpts {
  arch?: string;
  macosVersion?: string | null;
  hostAssessment?: HostAssessment;
  remediationActions?: RemediationAction[];
  spawnSync?: typeof spawnSync;
  rootDir?: string;
  planPath?: string;
}

function readMacosVersion(deps: NativeInstallerAssessmentDeps): string | null {
  if (deps.macosVersion !== undefined) return deps.macosVersion;
  if ((deps.platform ?? process.platform) !== "darwin") return null;
  const result = (deps.spawnSync ?? spawnSync)("sw_vers", ["-productVersion"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...(deps.env ?? {}) },
  });
  return result.status === 0 ? (result.stdout || "").trim() || null : null;
}

function macosMajor(version: string | null): number | null {
  if (!version) return null;
  const major = Number.parseInt(version.split(".")[0] || "", 10);
  return Number.isFinite(major) ? major : null;
}

function getHostAssessment(deps: NativeInstallerAssessmentDeps): HostAssessment {
  if (deps.hostAssessment) return deps.hostAssessment;
  return assessHost({
    platform: deps.platform,
    env: deps.env,
    release: deps.release,
    procVersion: deps.procVersion,
    dockerInfoOutput: deps.dockerInfoOutput,
    dockerInfoError: deps.dockerInfoError,
    readFileImpl: deps.readFileImpl,
    readdirImpl: deps.readdirImpl,
    runCaptureImpl: deps.runCaptureImpl,
    commandExistsImpl: deps.commandExistsImpl,
    gpuProbeImpl: deps.gpuProbeImpl,
  });
}

function recoveryFrom(actions: readonly RemediationAction[], ids: readonly string[]): string | undefined {
  const action = actions.find((candidate) => ids.includes(candidate.id));
  return action && action.commands.length > 0 ? action.commands.join("\n") : action?.reason;
}

function runtimeLabel(runtime: HostAssessment["runtime"]): string {
  switch (runtime) {
    case "docker-desktop":
      return "Docker Desktop";
    case "colima":
      return "Colima";
    case "docker":
      return "Docker";
    case "podman":
      return "Podman";
    default:
      return "Docker runtime";
  }
}

function formatRuntimeResources(host: HostAssessment): string {
  const parts: string[] = [];
  if (typeof host.dockerCpus === "number") parts.push(`${String(host.dockerCpus)} vCPU`);
  if (typeof host.dockerMemTotalBytes === "number") {
    parts.push(`${(host.dockerMemTotalBytes / 1024 ** 3).toFixed(1)} GiB RAM`);
  }
  return parts.length > 0 ? parts.join(" / ") : "resource limits unknown";
}

function buildRequirements(
  host: HostAssessment,
  actions: readonly RemediationAction[],
  deps: NativeInstallerAssessmentDeps,
): NativeInstallerRequirement[] {
  const platform = deps.platform ?? process.platform;
  const arch = deps.arch ?? process.arch;
  const macosVersion = readMacosVersion(deps);
  const major = macosMajor(macosVersion);
  const platformOk = platform === "darwin" && arch === "arm64" && (major === null || major >= 13);
  const requirements: NativeInstallerRequirement[] = [
    {
      id: "platform",
      label: "Apple Silicon macOS 13+",
      status: platformOk ? "pass" : "fail",
      detail:
        platform === "darwin"
          ? `Detected macOS ${macosVersion ?? os.release()} on ${arch}.`
          : `Detected ${platform} on ${arch}.`,
      ...(platformOk
        ? {}
        : {
            recovery:
              "Use the standard NemoClaw installer on Linux, WSL, DGX Spark, Intel Macs, or older macOS releases.",
          }),
    },
    {
      id: "docker-cli",
      label: "Docker CLI",
      status: host.dockerInstalled ? "pass" : "fail",
      detail: host.dockerInstalled ? "Docker CLI is available." : "Docker CLI was not found.",
      ...(host.dockerInstalled
        ? {}
        : { recovery: recoveryFrom(actions, ["install_docker"]) ?? "Install Docker, then retry." }),
    },
    {
      id: "docker-daemon",
      label: "Docker daemon",
      status: host.dockerReachable ? "pass" : "fail",
      detail: host.dockerReachable
        ? host.dockerInfoSummary
          ? `Docker daemon is reachable (${host.dockerInfoSummary}).`
          : "Docker daemon is reachable."
        : host.dockerInstalled
          ? "Docker CLI is installed, but the daemon is not reachable."
          : "Docker daemon was not checked because Docker CLI is missing.",
      ...(host.dockerReachable
        ? {}
        : {
            recovery:
              recoveryFrom(actions, [
                "start_docker",
                "docker_group_permission",
                "install_docker",
              ]) ?? "Start Docker Desktop or Colima, then retry.",
          }),
    },
  ];

  if (host.dockerReachable) {
    requirements.push({
      id: "container-runtime",
      label: runtimeLabel(host.runtime),
      status: host.isUnsupportedRuntime ? "warn" : "pass",
      detail: host.isUnsupportedRuntime
        ? "This runtime is not the standard Docker path used by NemoClaw onboarding."
        : `${runtimeLabel(host.runtime)} is the active container runtime.`,
      ...(host.isUnsupportedRuntime
        ? { recovery: recoveryFrom(actions, ["unsupported_runtime_warning"]) }
        : {}),
    });
  }

  if (host.dockerReachable && host.isContainerRuntimeUnderProvisioned) {
    requirements.push({
      id: "container-runtime-resources",
      label: "Runtime resources",
      status: "warn",
      detail: `Container runtime looks small (${formatRuntimeResources(host)}).`,
      recovery: recoveryFrom(actions, ["container_runtime_under_provisioned"]),
    });
  }

  requirements.push({
    id: "openshell",
    label: "OpenShell",
    status: host.openshellInstalled ? "pass" : "warn",
    detail: host.openshellInstalled
      ? "OpenShell CLI is available."
      : "OpenShell CLI is not on PATH; the app bundle or standard installer can provide it.",
    ...(host.openshellInstalled
      ? {}
      : { recovery: recoveryFrom(actions, ["install_openshell"]) }),
  });

  if (!host.nodeInstalled) {
    requirements.push({
      id: "nodejs",
      label: "Node.js",
      status: "warn",
      detail: "Node.js is not on PATH; the app payload is expected to include its runtime.",
      recovery: recoveryFrom(actions, ["install_nodejs"]),
    });
  }

  return requirements;
}

export function assessNativeInstallerHost(deps: NativeInstallerAssessmentDeps = {}): NativeInstallerAssessment {
  const host = getHostAssessment(deps);
  const remediation = deps.remediationActions ?? planHostRemediation(host);
  const requirements = buildRequirements(host, remediation, deps);
  const plan = loadNativeInstallerInstallPlan({ rootDir: deps.rootDir, planPath: deps.planPath });
  const hardFailures = requirements.filter((requirement) => requirement.status === "fail");

  return {
    experimental: true,
    supported: hardFailures.length === 0,
    platform: {
      os: deps.platform ?? process.platform,
      arch: deps.arch ?? process.arch,
      macosVersion: readMacosVersion(deps),
      target: "Apple Silicon macOS 13+",
    },
    host: {
      runtime: host.runtime,
      dockerInstalled: host.dockerInstalled,
      dockerRunning: host.dockerRunning,
      dockerReachable: host.dockerReachable,
      dockerInfoSummary: host.dockerInfoSummary,
      dockerCpus: host.dockerCpus,
      dockerMemTotalBytes: host.dockerMemTotalBytes,
      openshellInstalled: host.openshellInstalled,
      nodeInstalled: host.nodeInstalled,
    },
    requirements,
    remediation,
    recoveryActions: remediation
      .filter((action) => action.blocking)
      .flatMap((action) => action.commands.length > 0 ? action.commands : [action.reason]),
    baseImages: plan.install.baseImages,
  };
}

export function renderNativeInstallerAssessmentText(assessment: NativeInstallerAssessment): string[] {
  const lines = ["NemoClaw Mac Installer Preview assessment", ""];
  for (const requirement of assessment.requirements) {
    const marker =
      requirement.status === "pass" ? "OK" : requirement.status === "warn" ? "WARN" : "FAIL";
    lines.push(`[${marker}] ${requirement.label}: ${requirement.detail}`);
    if (requirement.status !== "pass" && requirement.recovery) {
      lines.push(`      ${requirement.recovery}`);
    }
  }
  lines.push("");
  lines.push(
    assessment.supported
      ? "This Mac is eligible for the experimental Mac Installer Preview."
      : "Use the standard installer or fix the failed requirements before trying native Mac installer.",
  );
  return lines;
}
