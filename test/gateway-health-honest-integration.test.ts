// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Source-shape guards for the #3111 fix in startDockerDriverGateway.
//
// The fix gates the "Docker-driver gateway is healthy" log on:
//   1. a real HTTP liveness probe (isGatewayHttpReady — shared helper
//      introduced in #3312 for the K3s reuse path), and
//   2. a child-exit listener that catches zombied detached children that
//      process.kill(pid, 0) would otherwise report as alive.
//
// These guards keep future edits from silently regressing #3111.
//
// See: https://github.com/NVIDIA/NemoClaw/issues/3111
//      https://github.com/NVIDIA/NemoClaw/pull/3312 (shared HTTP helper)

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("startDockerDriverGateway integration (#3111)", () => {
  const content = fs.readFileSync(path.join(ROOT, "src/lib/onboard.ts"), "utf-8");
  // Scope assertions to the startDockerDriverGateway function body so other
  // occurrences of the helpers (e.g. in stale-gateway reuse paths or in
  // module.exports) don't satisfy the source-shape checks and mask a
  // regression inside this function.
  const fnMatch = content.match(
    /async function startDockerDriverGateway\([\s\S]*?\n\}\n/,
  );
  if (!fnMatch) {
    throw new Error(
      "Expected 'async function startDockerDriverGateway' block in src/lib/onboard.ts",
    );
  }
  const fnBody = fnMatch[0];

  it("tracks child-exit so zombies don't fool isPidAlive", () => {
    // The fix pattern: a single 'exit' listener on the spawned ChildProcess
    // that flips a flag the poll loop reads instead of relying solely on
    // process.kill(pid, 0), which returns true for zombies.
    expect(fnBody).toMatch(/child\.once\(\s*["']exit["']/);
    expect(fnBody).toMatch(/childExited\s*=\s*true/);
  });

  it("breaks the poll loop when the child has exited", () => {
    // The top of the loop body should consult childExited OR isPidAlive,
    // not isPidAlive alone.
    expect(fnBody).toMatch(/childExited\s*\|\|\s*!isPidAlive\(childPid\)/);
  });

  it("gates the 'healthy' log on the shared HTTP readiness probe", () => {
    // The poll loop must call isGatewayHttpReady() before logging
    // "✓ Docker-driver gateway is healthy". Reusing the shared helper
    // introduced in #3312 keeps the Docker-driver path consistent with
    // every other gateway-reuse decision site in onboard.ts.
    const healthyIdx = fnBody.indexOf("Docker-driver gateway is healthy");
    expect(healthyIdx).toBeGreaterThan(0);
    const before = fnBody.slice(0, healthyIdx);
    expect(before).toMatch(/await\s+isGatewayHttpReady\(/);
  });

  it("does NOT add a parallel TCP/HTTP probe inside onboard.ts", () => {
    // We deliberately reuse isGatewayHttpReady from the
    // ./onboard/gateway-http-readiness module rather than adding a
    // second probe implementation. This test catches accidental
    // reintroduction of a local probe helper and keeps the surface
    // small for future refactoring (#2562, #3213).
    expect(fnBody).not.toMatch(/verifyDockerDriverGatewayListening\s*\(/);
    expect(fnBody).not.toMatch(/net\.createConnection\(/);
  });

  it("surfaces child-exit details in the final failure message", () => {
    // On failure, the user must see *why* the gateway didn't come up —
    // signal or exit code — not just "failed to start". This is a UX
    // improvement that falls out of tracking childExitCode/Signal.
    expect(fnBody).toMatch(/childExited/);
    expect(fnBody).toMatch(/childExitSignal|childExitCode/);
  });
});

describe("shared HTTP readiness import (#3111 reuses #3312)", () => {
  const content = fs.readFileSync(path.join(ROOT, "src/lib/onboard.ts"), "utf-8");

  it("imports isGatewayHttpReady from the shared gateway-http-readiness module", () => {
    // Guards against someone adding a parallel import or a local
    // reimplementation. isGatewayHttpReady must come from the canonical
    // ./onboard/gateway-http-readiness module so the Docker-driver and
    // K3s paths converge on the same probe semantics.
    expect(content).toMatch(
      /isGatewayHttpReady,[\s\S]{0,200}?require\(\s*["']\.\/onboard\/gateway-http-readiness["']/,
    );
  });
});
