// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { StdioOptions } from "node:child_process";

import { ROOT } from "./runner";
import {
  captureOpenshellCommand,
  getInstalledOpenshellVersion,
  runOpenshellCommand,
} from "./openshell";
import { resolveOpenshell } from "./resolve-openshell";

type CommandArgs = string[];

type RunnerOptions = {
  env?: NodeJS.ProcessEnv;
  stdio?: StdioOptions;
  ignoreError?: boolean;
  timeout?: number;
};

let openshellBin: string | null = null;

export function getOpenshellBinary(): string {
  if (!openshellBin) {
    openshellBin = resolveOpenshell();
  }
  if (!openshellBin) {
    console.error("openshell CLI not found. Install OpenShell before using sandbox commands.");
    process.exit(1);
  }
  return openshellBin;
}

export function runOpenshell(args: CommandArgs, opts: RunnerOptions = {}) {
  return runOpenshellCommand(getOpenshellBinary(), args, {
    cwd: ROOT,
    env: opts.env,
    stdio: opts.stdio,
    ignoreError: opts.ignoreError,
    timeout: opts.timeout,
    errorLine: console.error,
    exit: (code: number) => process.exit(code),
  });
}

export function captureOpenshell(args: CommandArgs, opts: RunnerOptions = {}) {
  return captureOpenshellCommand(getOpenshellBinary(), args, {
    cwd: ROOT,
    env: opts.env,
    ignoreError: opts.ignoreError,
    timeout: opts.timeout,
    errorLine: console.error,
    exit: (code: number) => process.exit(code),
  });
}

export function getInstalledOpenshellVersionOrNull(): string | null {
  return getInstalledOpenshellVersion(getOpenshellBinary(), {
    cwd: ROOT,
  });
}
