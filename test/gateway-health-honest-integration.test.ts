// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Source-shape + behavioural guards for the #3111 fix in startDockerDriverGateway.
//
// The fix gates the "Docker-driver gateway is healthy" log on:
//   1. a real TCP liveness probe (isDockerDriverGatewayTcpReady) — plain
//      TCP, not HTTP, because the Docker-driver gateway and the K3s
//      gateway expose different root paths (see isGatewayHttpReady in
//      ./onboard/gateway-http-readiness for the K3s-path probe); and
//   2. a child-exit listener that catches zombied detached children that
//      process.kill(pid, 0) would otherwise report as alive.
//
// These guards keep future edits from silently regressing #3111.
//
// See: https://github.com/NVIDIA/NemoClaw/issues/3111
//      https://github.com/NVIDIA/NemoClaw/pull/3312 (K3s-path HTTP helper)

import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isDockerDriverGatewayTcpReady } = require("../dist/lib/onboard");

const ROOT = path.resolve(import.meta.dirname, "..");

// ── Helpers ─────────────────────────────────────────────────────────────────

function startDummyServer(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.end());
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("failed to resolve server address"));
        return;
      }
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((res, rej) =>
            server.close((err) => (err ? rej(err) : res())),
          ),
      });
    });
  });
}

async function getLikelyClosedPort(): Promise<number> {
  const { port, close } = await startDummyServer();
  await close();
  return port;
}

// ── Behavioural tests for isDockerDriverGatewayTcpReady ─────────────────────

describe("isDockerDriverGatewayTcpReady (#3111)", () => {
  let teardown: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (teardown) {
      await teardown();
      teardown = null;
    }
  });

  it("resolves true when something is accepting connections", async () => {
    const { port, close } = await startDummyServer();
    teardown = close;
    await expect(isDockerDriverGatewayTcpReady(port, 500)).resolves.toBe(true);
  });

  it("resolves false when nothing is listening (Connection refused)", async () => {
    const port = await getLikelyClosedPort();
    await expect(isDockerDriverGatewayTcpReady(port, 500)).resolves.toBe(false);
  });

  it("resolves false on timeout (non-routable host)", async () => {
    // 10.255.255.1 is a non-routable RFC 1918 address that SYN-drops on most
    // CI runners, forcing the timeout path rather than immediate ECONNREFUSED.
    const started = Date.now();
    await expect(
      isDockerDriverGatewayTcpReady(9, 200, "10.255.255.1"),
    ).resolves.toBe(false);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(2000);
  });

  it("enforces a minimum timeout of 50ms even when caller passes 0", async () => {
    const port = await getLikelyClosedPort();
    const started = Date.now();
    await expect(isDockerDriverGatewayTcpReady(port, 0)).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("never throws — always resolves with a boolean", async () => {
    await expect(isDockerDriverGatewayTcpReady(0, 100)).resolves.toBeTypeOf(
      "boolean",
    );
    await expect(isDockerDriverGatewayTcpReady(65535, 100)).resolves.toBe(
      false,
    );
  });
});

// ── Source-shape guards for the integration in startDockerDriverGateway ────

describe("startDockerDriverGateway integration (#3111)", () => {
  const content = fs.readFileSync(path.join(ROOT, "src/lib/onboard.ts"), "utf-8");
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
    expect(fnBody).toMatch(/child\.once\(\s*["']exit["']/);
    expect(fnBody).toMatch(/childExited\s*=\s*true/);
  });

  it("breaks the poll loop when the child has exited", () => {
    expect(fnBody).toMatch(/childExited\s*\|\|\s*!isPidAlive\(childPid\)/);
  });

  it("gates the 'healthy' log on the TCP readiness probe", () => {
    // The poll loop must call isDockerDriverGatewayTcpReady(GATEWAY_PORT)
    // before logging "✓ Docker-driver gateway is healthy". We deliberately
    // use a TCP probe rather than the K3s-path isGatewayHttpReady because
    // the Docker-driver gateway only serves /openshell.v1.OpenShell/* —
    // GET / returns 404, which fails the HTTP probe even though the
    // gateway is functional.
    const healthyIdx = fnBody.indexOf("Docker-driver gateway is healthy");
    expect(healthyIdx).toBeGreaterThan(0);
    const before = fnBody.slice(0, healthyIdx);
    expect(before).toMatch(/await\s+isDockerDriverGatewayTcpReady\(GATEWAY_PORT/);
  });

  it("does NOT use the K3s-path HTTP probe in the Docker-driver loop", () => {
    // Regression guard: a previous version of this fix called
    // isGatewayHttpReady() here, which broke the existing
    // openshell-gateway-upgrade-e2e test because the Docker-driver
    // gateway returns 404 on GET /. Do not reintroduce that pattern.
    const healthyIdx = fnBody.indexOf("Docker-driver gateway is healthy");
    const before = fnBody.slice(0, healthyIdx);
    expect(before).not.toMatch(/await\s+isGatewayHttpReady\(/);
  });

  it("surfaces child-exit details in the final failure message", () => {
    expect(fnBody).toMatch(/childExited/);
    expect(fnBody).toMatch(/childExitSignal|childExitCode/);
  });
});
