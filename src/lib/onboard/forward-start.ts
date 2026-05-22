// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";

import { compactText } from "../core/url-utils";
import { redact } from "../security/redact";
import { getOccupiedPorts } from "./dashboard-port";
import { cleanupTempDir, secureTempFile } from "./temp-files";

// `openshell forward start --background` daemonises the actual forward
// process, but the parent CLI's stdio is inherited by the daemon child on
// some platforms (notably the Docker compatibility gateway used when the
// host glibc is older than the openshell-gateway requirement). spawnSync
// then waits on those fds until the daemon exits — minutes later — and
// reports ETIMEDOUT even though the forward is established. See #4064.
//
// The detached path below spawns the CLI with `detached: true`, hands it
// independent diagnostic file descriptors, and confirms success by polling
// `openshell forward list` for an entry matching `(port, sandboxName)`.
// The CLI's exit code is no longer the success signal — the appearance of
// the live forward in the list is.

export type ForwardListFetcher = () => string;

export type DetachedForwardSpawnRunner = (stdio: {
  stdout: number;
  stderr: number;
}) => { pid?: number; error?: Error };

export interface DetachedForwardStartOutcome {
  ok: boolean;
  diagnostic: string;
  pid?: number;
  reason: "ok" | "spawn-error" | "timeout" | "spawn-conflict";
}

export interface DetachedForwardStartOptions {
  overallTimeoutMs?: number;
  pollIntervalMs?: number;
  sleepMs?: (ms: number) => void;
}

function readDiagnosticFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return "";
    }
    throw error;
  }
}

export function looksLikeForwardPortConflict(diagnostic: string): boolean {
  return /eaddrinuse|address already in use|port .* in use|bind: .*in use/i.test(diagnostic);
}

function blockingSleepMs(ms: number): void {
  if (ms <= 0) return;
  // Synchronous sleep — onboard's forward-start sits in a sync code path,
  // so we cannot await. spawnSync of `node -e setTimeout` is the same
  // primitive `sleepMs` in core/wait uses, but we keep the call site
  // injectable so tests can stub it without spawning subprocesses.
  const { spawnSync } = require("node:child_process");
  spawnSync(process.execPath, ["-e", `setTimeout(() => {}, ${ms}).unref();`], {
    stdio: "ignore",
    timeout: ms + 5_000,
  });
}

function isForwardConfirmed(
  forwardListOutput: string,
  expect: { port: number; sandboxName: string },
): boolean {
  return getOccupiedPorts(forwardListOutput).get(String(expect.port)) === expect.sandboxName;
}

/**
 * Spawn `openshell forward start --background` as a detached child and wait
 * for the resulting forward to appear in `openshell forward list`. Returns
 * `ok: true` as soon as the live entry is observed, regardless of whether
 * the original spawn process has exited yet. Returns `ok: false` with a
 * captured diagnostic when:
 *   - the spawn itself failed (ENOENT, permission denied, …);
 *   - the parent process wrote an EADDRINUSE-style error to stderr before
 *     the deadline (port conflict — retry path);
 *   - the deadline expired without the forward appearing.
 *
 * The diagnostic file pair is removed before return, so the temp dir does
 * not leak across retries.
 */
export function runDetachedForwardStartWithDiagnostics(
  runDetachedSpawn: DetachedForwardSpawnRunner,
  fetchForwardList: ForwardListFetcher,
  expect: { port: number; sandboxName: string },
  options: DetachedForwardStartOptions = {},
): DetachedForwardStartOutcome {
  const overallTimeoutMs = options.overallTimeoutMs ?? 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const sleepImpl = options.sleepMs ?? blockingSleepMs;

  const forwardDiagPath = secureTempFile("nemoclaw-forward-start", ".out");
  const forwardDiagDir = path.dirname(forwardDiagPath);
  const forwardErrPath = path.join(forwardDiagDir, "nemoclaw-forward-start.err");
  // `fs.openSync` with `"w"` truncates / creates the diagnostic files; the
  // child inherits the fds via posix_spawn semantics. We close the host's
  // copies immediately so only the child's reference keeps them alive,
  // which lets the kernel reclaim them when the (detached) child exits.
  const outFd = fs.openSync(forwardDiagPath, "w", 0o600);
  const errFd = fs.openSync(forwardErrPath, "w", 0o600);

  let pid: number | undefined;
  let spawnError: Error | undefined;
  try {
    const spawnResult = runDetachedSpawn({ stdout: outFd, stderr: errFd });
    pid = spawnResult.pid;
    spawnError = spawnResult.error;
  } finally {
    try {
      fs.closeSync(outFd);
    } catch {
      /* best effort */
    }
    try {
      fs.closeSync(errFd);
    } catch {
      /* best effort */
    }
  }

  const readDiag = (): string => {
    const stderr = readDiagnosticFile(forwardErrPath);
    const stdout = readDiagnosticFile(forwardDiagPath);
    const message = spawnError instanceof Error ? spawnError.message : "";
    return compactText(redact(`${stderr} ${stdout} ${message}`));
  };

  try {
    if (spawnError) {
      return { ok: false, diagnostic: readDiag(), pid, reason: "spawn-error" };
    }

    const start = Date.now();
    const deadline = start + overallTimeoutMs;
    while (Date.now() < deadline) {
      let list: string;
      try {
        list = fetchForwardList() || "";
      } catch {
        list = "";
      }
      if (isForwardConfirmed(list, expect)) {
        return { ok: true, diagnostic: readDiag(), pid, reason: "ok" };
      }
      const diagSoFar = readDiag();
      if (looksLikeForwardPortConflict(diagSoFar)) {
        return { ok: false, diagnostic: diagSoFar, pid, reason: "spawn-conflict" };
      }
      sleepImpl(pollIntervalMs);
    }
    const finalDiag = readDiag();
    return {
      ok: false,
      diagnostic:
        finalDiag || `forward did not appear in list within ${overallTimeoutMs}ms`,
      pid,
      reason: "timeout",
    };
  } finally {
    cleanupTempDir(forwardDiagPath, "nemoclaw-forward-start");
  }
}

/**
 * Retry the detached forward-start when the diagnostic looks like an
 * EADDRINUSE-style port conflict. `beforeRetry` runs between attempts so
 * the caller can drop any stale forward bound to the same port before
 * trying again.
 */
export function runDetachedForwardStartWithPortReleaseRetries(
  runDetachedSpawn: DetachedForwardSpawnRunner,
  fetchForwardList: ForwardListFetcher,
  expect: { port: number; sandboxName: string },
  beforeRetry: () => void,
  maxRetries = 3,
  options: DetachedForwardStartOptions = {},
): DetachedForwardStartOutcome {
  let attempt = runDetachedForwardStartWithDiagnostics(
    runDetachedSpawn,
    fetchForwardList,
    expect,
    options,
  );
  for (
    let retries = 0;
    !attempt.ok && looksLikeForwardPortConflict(attempt.diagnostic) && retries < maxRetries;
    retries++
  ) {
    beforeRetry();
    attempt = runDetachedForwardStartWithDiagnostics(
      runDetachedSpawn,
      fetchForwardList,
      expect,
      options,
    );
  }
  return attempt;
}
