// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const START_SCRIPT = path.join(import.meta.dirname, "..", "agents", "hermes", "start.sh");

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function extractShellFunctionFromSource(src: string, name: string): string {
  const match = src.match(new RegExp(`${name}\\(\\) \\{([\\s\\S]*?)^\\}`, "m"));
  if (!match) {
    throw new Error(`Expected ${name} in agents/hermes/start.sh`);
  }
  return `${name}() {${match[1]}\n}`;
}

function runTirithBootstrap(opts: { markerReason: string; failInstall?: boolean }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-hermes-tirith-"));
  const hermesHome = path.join(tmpDir, ".hermes");
  const fakeRoot = path.join(tmpDir, "fake-python");
  const toolsDir = path.join(fakeRoot, "tools");
  const marker = path.join(hermesHome, ".tirith-install-failed");
  const callsPath = path.join(tmpDir, "calls.log");
  const scriptPath = path.join(tmpDir, "run.sh");

  fs.mkdirSync(hermesHome, { recursive: true });
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.writeFileSync(marker, opts.markerReason);
  fs.writeFileSync(path.join(toolsDir, "__init__.py"), "");
  fs.writeFileSync(
    path.join(toolsDir, "tirith_security.py"),
    `
import os

def _failure_marker_path():
    return os.path.join(os.environ["HERMES_HOME"], ".tirith-install-failed")

def _clear_install_failed():
    try:
        os.unlink(_failure_marker_path())
    except FileNotFoundError:
        pass

def _mark_install_failed(reason=""):
    with open(_failure_marker_path(), "w", encoding="utf-8") as fh:
        fh.write(reason)

def _install_tirith(log_failures=True):
    with open(os.environ["CALLS_PATH"], "a", encoding="utf-8") as fh:
        fh.write("install\\n")
    if os.environ.get("TIRITH_FAIL") == "1":
        return None, "download_failed"
    bin_dir = os.path.join(os.environ["HERMES_HOME"], "bin")
    os.makedirs(bin_dir, exist_ok=True)
    dest = os.path.join(bin_dir, "tirith")
    with open(dest, "w", encoding="utf-8") as fh:
        fh.write("#!/bin/sh\\nexit 0\\n")
    os.chmod(dest, 0o644)
    return dest, ""
`.trimStart(),
  );

  const src = fs.readFileSync(START_SCRIPT, "utf-8");
  fs.writeFileSync(
    scriptPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      extractShellFunctionFromSource(src, "bootstrap_tirith_after_download_failure"),
      `HERMES_DIR=${shellQuote(hermesHome)}`,
      `HERMES_HOME=${shellQuote(hermesHome)}`,
      "bootstrap_tirith_after_download_failure",
    ].join("\n"),
    { mode: 0o700 },
  );

  try {
    const result = spawnSync("bash", [scriptPath], {
      encoding: "utf-8",
      timeout: 5000,
      env: {
        ...process.env,
        PYTHONPATH: fakeRoot,
        CALLS_PATH: callsPath,
        TIRITH_FAIL: opts.failInstall ? "1" : "0",
      },
    });
    const tirithPath = path.join(hermesHome, "bin", "tirith");
    return {
      result,
      calls: fs.existsSync(callsPath) ? fs.readFileSync(callsPath, "utf-8") : "",
      markerExists: fs.existsSync(marker),
      markerContent: fs.existsSync(marker) ? fs.readFileSync(marker, "utf-8") : "",
      tirithExecutable:
        fs.existsSync(tirithPath) && (fs.statSync(tirithPath).mode & 0o111) !== 0,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("agents/hermes/start.sh Tirith bootstrap", () => {
  it("retries a download_failed marker, installs tirith executable, and clears the marker", () => {
    const run = runTirithBootstrap({ markerReason: "download_failed" });

    expect(run.result.status).toBe(0);
    expect(run.calls).toBe("install\n");
    expect(run.tirithExecutable).toBe(true);
    expect(run.markerExists).toBe(false);
    expect(run.result.stderr).toContain("Retrying Tirith install after download_failed marker");
    expect(run.result.stderr).toContain("Tirith ready");
  });

  it("leaves unknown marker reasons untouched and does not retry", () => {
    const run = runTirithBootstrap({ markerReason: "checksum_failed" });

    expect(run.result.status).toBe(0);
    expect(run.calls).toBe("");
    expect(run.tirithExecutable).toBe(false);
    expect(run.markerExists).toBe(true);
    expect(run.markerContent).toBe("checksum_failed");
    expect(run.result.stderr).toContain("is not retryable");
  });

  it("continues startup when the retry fails and leaves the marker reason for diagnostics", () => {
    const run = runTirithBootstrap({ markerReason: "download_failed", failInstall: true });

    expect(run.result.status).toBe(0);
    expect(run.calls).toBe("install\n");
    expect(run.tirithExecutable).toBe(false);
    expect(run.markerExists).toBe(true);
    expect(run.markerContent).toBe("download_failed");
    expect(run.result.stderr).toContain("Tirith retry failed; gateway startup will continue");
  });
});
