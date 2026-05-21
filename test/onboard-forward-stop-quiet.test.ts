// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, it } from "vitest";

function parseStdoutJson<T>(stdout: string): T {
  const line = stdout.trim().split("\n").pop();
  if (!line) {
    throw new Error("Expected JSON payload on the last stdout line");
  }
  return JSON.parse(line);
}

describe("onboard bestEffortForwardStop (#3971)", () => {
  it("suppresses the noisy 'No active forward found' warning from openshell forward stop", () => {
    const repoRoot = path.join(import.meta.dirname, "..");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-forward-stop-quiet-"));
    const scriptPath = path.join(tmpDir, "forward-stop-quiet.js");
    const onboardPath = JSON.stringify(path.join(repoRoot, "dist", "lib", "onboard.js"));

    const script = String.raw`
const childProcess = require("child_process");

const stdoutWrites = [];
const stderrWrites = [];
const origStdoutWrite = process.stdout.write.bind(process.stdout);
const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stdout.write = (chunk) => { stdoutWrites.push(String(chunk)); return true; };
process.stderr.write = (chunk) => { stderrWrites.push(String(chunk)); return true; };

const calls = [];
childProcess.spawnSync = (exe, args, opts) => {
  calls.push({ exe, args, stdio: opts && opts.stdio });
  if (Array.isArray(args) && args.includes("stop")) {
    return {
      status: 0,
      stdout: "",
      stderr: "\x1b[33m!\x1b[39m No active forward found for port 18789\n",
      error: undefined,
    };
  }
  return { status: 0, stdout: "", stderr: "", error: undefined };
};

const onboard = require(${onboardPath});
onboard.bestEffortForwardStop(18789);

process.stdout.write = origStdoutWrite;
process.stderr.write = origStderrWrite;

const joinedOut = stdoutWrites.join("");
const joinedErr = stderrWrites.join("");
const callStopArgs = calls
  .filter((c) => Array.isArray(c.args) && c.args.includes("forward") && c.args.includes("stop"))
  .map((c) => c.args);
console.log(JSON.stringify({
  stdout: joinedOut,
  stderr: joinedErr,
  callStopArgs,
}));
`;
    fs.writeFileSync(scriptPath, script);

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      encoding: "utf-8",
      env: { ...process.env, HOME: tmpDir },
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = parseStdoutJson<{
      stdout: string;
      stderr: string;
      callStopArgs: string[][];
    }>(result.stdout);

    assert.equal(
      payload.callStopArgs.length,
      1,
      `Expected one forward-stop call, got ${payload.callStopArgs.length}`,
    );
    assert.deepEqual(payload.callStopArgs[0].slice(-3), ["forward", "stop", "18789"]);

    assert.ok(
      !payload.stdout.includes("No active forward found"),
      `stdout leaked openshell warning: ${payload.stdout}`,
    );
    assert.ok(
      !payload.stderr.includes("No active forward found"),
      `stderr leaked openshell warning: ${payload.stderr}`,
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
