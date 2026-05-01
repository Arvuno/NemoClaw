// @ts-nocheck
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";

const START_SCRIPT = path.join(import.meta.dirname, "..", "scripts", "nemoclaw-start.sh");

function extractStartScriptHeredoc(src, marker) {
  const heredoc = src.match(new RegExp(`<<'${marker}'\\n([\\s\\S]*?)\\n${marker}`));
  if (!heredoc) {
    throw new Error(`Expected ${marker} heredoc in scripts/nemoclaw-start.sh`);
  }
  return heredoc[1];
}

describe("NVIDIA endpoint inference fix preload (#1193, #2051)", () => {
  const src = fs.readFileSync(START_SCRIPT, "utf-8");

  it("entrypoint writes the preload and registers it in NODE_OPTIONS", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-nemotron-entrypoint-"));
    const preloadPath = path.join(tempDir, "nemotron-fix.js");
    const start = src.indexOf("# NVIDIA endpoint model-specific inference parameter injection");
    const end = src.indexOf("# mDNS / ciao network interface guard", start);
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(
        "Expected NVIDIA endpoint preload entrypoint block in scripts/nemoclaw-start.sh",
      );
    }
    const block = src
      .slice(start, end)
      .replaceAll("/tmp/nemoclaw-nemotron-inference-fix.js", preloadPath);
    const wrapper = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'emit_sandbox_sourced_file() { local target="$1"; cat > "$target"; chmod 444 "$target"; }',
      "NODE_OPTIONS='--require /already-loaded.js'",
      block,
      "printf 'NODE_OPTIONS=%s\\n' \"$NODE_OPTIONS\"",
      "printf 'SCRIPT=%s\\n' \"$_NEMOTRON_FIX_SCRIPT\"",
    ].join("\n");
    const wrapperPath = path.join(tempDir, "run.sh");

    try {
      fs.writeFileSync(wrapperPath, wrapper, { mode: 0o700 });
      const result = spawnSync("bash", [wrapperPath], { encoding: "utf-8", timeout: 5000 });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`SCRIPT=${preloadPath}`);
      expect(result.stdout).toContain("--require /already-loaded.js");
      expect(result.stdout).toContain(`--require ${preloadPath}`);
      const stat = fs.statSync(preloadPath);
      expect(stat.isFile()).toBe(true);
      expect((stat.mode & 0o777).toString(8)).toBe("444");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("preload injects Nemotron chat_template_kwargs and preserves other requests", () => {
    const preload = extractStartScriptHeredoc(src, "NEMOTRON_FIX_EOF");
    const harness = `
const http = require('http');
const https = require('https');
const records = [];
function installStub(mod) {
  mod.request = function (options) {
    const record = { options, writes: [], headers: {}, removed: [] };
    records.push(record);
    return {
      write(chunk) {
        record.writes.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
        return true;
      },
      end(cb) {
        if (typeof cb === 'function') cb();
        return true;
      },
      getHeader(name) { return record.headers[name]; },
      setHeader(name, value) { record.headers[name] = value; },
      removeHeader(name) { record.removed.push(name); delete record.headers[name]; },
    };
  };
}
installStub(http);
installStub(https);
${preload}
function send(mod, options, body) {
  const req = mod.request(options);
  req.write(body);
  req.end();
}
send(http, { method: 'POST', path: '/v1/chat/completions' }, JSON.stringify({ model: 'NVIDIA/NEMOTRON-4', messages: [] }));
send(https, { method: 'POST', path: '/v1/chat/completions' }, JSON.stringify({ model: 'other-model', messages: [] }));
send(http, { method: 'POST', path: '/v1/chat/completions' }, '{not json');
send(http, { method: 'GET', path: '/v1/chat/completions' }, JSON.stringify({ model: 'nemotron' }));
console.log(JSON.stringify(records));
`;

    const result = spawnSync(process.execPath, ["-e", harness], {
      encoding: "utf-8",
      timeout: 5000,
    });
    expect(result.status).toBe(0);
    const records = JSON.parse(result.stdout.trim());
    const nemotronBody = JSON.parse(records[0].writes[0]);
    expect(nemotronBody.chat_template_kwargs.force_nonempty_content).toBe(true);
    expect(records[0].removed).toContain("content-length");
    expect(Number(records[0].headers["Content-Length"])).toBeGreaterThan(0);

    const otherBody = JSON.parse(records[1].writes[0]);
    expect(otherBody.chat_template_kwargs).toBeUndefined();
    expect(records[2].writes[0]).toBe("{not json");
    expect(JSON.parse(records[3].writes[0]).chat_template_kwargs).toBeUndefined();
  });

  it("includes the preload in the proxy-env sourced file for connect sessions", () => {
    expect(src).toMatch(/# Nemotron inference fix for connect sessions/);
    expect(src).toContain("--require $_NEMOTRON_FIX_SCRIPT");
  });

  it("passes the preload path to validate_tmp_permissions in both root and non-root branches", () => {
    const calls = src.match(/validate_tmp_permissions\s+.*"\$_NEMOTRON_FIX_SCRIPT"/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("preload wraps both http and https modules", () => {
    const script = extractStartScriptHeredoc(src, "NEMOTRON_FIX_EOF");
    expect(script).toContain("wrapModule(http)");
    expect(script).toContain("wrapModule(https)");
  });

  it("preload only intercepts POST requests to /v1/chat/completions", () => {
    const script = extractStartScriptHeredoc(src, "NEMOTRON_FIX_EOF");
    expect(script).toContain("options.method !== 'POST'");
    expect(script).toContain("/v1/chat/completions");
  });

  it("preload matches Nemotron models case-insensitively", () => {
    const script = extractStartScriptHeredoc(src, "NEMOTRON_FIX_EOF");
    expect(script).toMatch(/nemotron\/i/);
  });

  it("preload matches DeepSeek V4 Pro exactly", () => {
    const script = extractStartScriptHeredoc(src, "NEMOTRON_FIX_EOF");
    expect(script).toContain("DEEPSEEK_V4_PRO_RE");
    expect(script).toContain("^deepseek-ai\\/deepseek-v4-pro$");
  });

  it("preload injects force_nonempty_content into chat_template_kwargs", () => {
    const script = extractStartScriptHeredoc(src, "NEMOTRON_FIX_EOF");
    expect(script).toContain("chat_template_kwargs");
    expect(script).toContain("force_nonempty_content");
  });

  it("preload injects thinking false for DeepSeek V4 Pro", () => {
    const script = extractStartScriptHeredoc(src, "NEMOTRON_FIX_EOF");
    expect(script).toContain("chat_template_kwargs.thinking = false");
  });

  it("preload passes through unaffected models unmodified", () => {
    const script = extractStartScriptHeredoc(src, "NEMOTRON_FIX_EOF");
    // The else branch sends original bytes.
    expect(script).toContain("origWrite.call(req, raw)");
  });

  it("preload falls back gracefully on JSON parse failure", () => {
    const script = extractStartScriptHeredoc(src, "NEMOTRON_FIX_EOF");
    expect(script).toMatch(/catch\s*\(_e\)/);
    // Must forward original bytes on error, not crash
    expect(script).toMatch(/catch[\s\S]*?origWrite\.call\(req, raw\)/);
  });

  it("preload updates Content-Length header after body modification", () => {
    const script = extractStartScriptHeredoc(src, "NEMOTRON_FIX_EOF");
    expect(script).toContain("removeHeader('content-length')");
    expect(script).toContain("setHeader('Content-Length'");
  });

  it("preload is placed before the WebSocket fix in the script", () => {
    const nemotronPos = src.indexOf("_NEMOTRON_FIX_SCRIPT=");
    const wsPos = src.indexOf("_WS_FIX_SCRIPT=");
    expect(nemotronPos).toBeGreaterThan(-1);
    expect(wsPos).toBeGreaterThan(-1);
    expect(nemotronPos).toBeLessThan(wsPos);
  });
});
