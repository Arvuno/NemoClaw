// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

// DGX Station preflight: model picker, vLLM container lifecycle, and
// HuggingFace-token discovery / validation. Invoked from onboard.ts during
// step [1/8] Preflight checks. Sets NEMOCLAW_PROVIDER / NEMOCLAW_ENDPOINT_URL /
// NEMOCLAW_MODEL / NEMOCLAW_PREFERRED_API so the [3/8] inference step
// auto-prefills against the running vLLM endpoint.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { prompt } from "./credentials";

const C = {
  RED: "\x1b[0;31m",
  GREEN: "\x1b[0;32m",
  YELLOW: "\x1b[1;33m",
  CYAN: "\x1b[0;36m",
  RESET: "\x1b[0m",
};

const VLLM_CONTAINER = "nemoclaw-vllm";
const VLLM_PORT = 8000;
const VLLM_IMAGE = "docker.io/vllm/vllm-openai:latest";
const HF_WHOAMI_URL = "https://huggingface.co/api/whoami-v2";
const HEALTH_TIMEOUT_SEC = 3600; // 60-minute ceiling for first-time downloads
const HEALTH_POLL_SEC = 5;
const HEARTBEAT_SEC = 30;

interface ModelChoice {
  id: string;
  label: string;
  gated: boolean;
}

const STATION_MODELS: ModelChoice[] = [
  { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen2.5 72B Instruct", gated: false },
  {
    id: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B",
    label: "DeepSeek-R1 Distill 70B",
    gated: false,
  },
  { id: "MiniMaxAI/MiniMax-M2.7", label: "MiniMax M2.7", gated: false },
  {
    id: "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4",
    label: "Nemotron-3 Super 120B NVFP4",
    gated: true,
  },
];
const DEFAULT_MODEL_INDEX = 3; // Nemotron — last entry, the [default]

export interface PreflightOutcome {
  station: boolean;
  selectedModel: string | null;
  vllmEndpoint: string | null;
  hfTokenAvailable: boolean;
}

// ── helpers ────────────────────────────────────────────────────────────────

const info = (msg: string): void => console.log(`  ${C.CYAN}[preflight]${C.RESET} ${msg}`);
const ok = (msg: string): void =>
  console.log(`  ${C.CYAN}[preflight]${C.RESET} ${C.GREEN}✓${C.RESET} ${msg}`);
const warn = (msg: string): void => console.log(`  ${C.YELLOW}[preflight]${C.RESET} ${msg}`);

function shellOut(cmd: string, args: string[], timeoutMs?: number): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: timeoutMs });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function commandExists(cmd: string): boolean {
  return spawnSync("command", ["-v", cmd], { shell: "/bin/bash", encoding: "utf8" }).status === 0;
}

// ── platform detection ─────────────────────────────────────────────────────

export function isDgxStation(): boolean {
  if (process.env.NEMOCLAW_DETECTED_PLATFORM === "station") return true;
  // /sys/firmware/devicetree/base/model carries a NUL-terminated string on
  // ARM/devicetree boxes. DGX Station GB300 reports its product name there.
  try {
    const buf = fs.readFileSync("/sys/firmware/devicetree/base/model", "utf8");
    return /DGX Station|GB300/i.test(buf.replace(/\0/g, ""));
  } catch {
    return false;
  }
}

// ── GPU helpers ────────────────────────────────────────────────────────────

interface GpuInfo {
  index: string;
  vramMb: number;
}

function bestVramGpu(): GpuInfo | null {
  if (!commandExists("nvidia-smi")) return null;
  const r = shellOut("nvidia-smi", [
    "--query-gpu=index,memory.total",
    "--format=csv,noheader,nounits",
  ]);
  if (r.code !== 0) return null;
  const rows = r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [idx, mb] = l.split(",").map((s) => s.trim());
      return { index: idx, vramMb: Number(mb) || 0 };
    })
    .filter((g) => g.index !== "");
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.vramMb - a.vramMb);
  return rows[0];
}

function gpuMemoryUsedMb(idx: string): string {
  const r = shellOut("nvidia-smi", [
    "--query-gpu=memory.used",
    "--format=csv,noheader,nounits",
    "-i",
    idx,
  ]);
  return r.stdout.trim();
}

// ── HuggingFace token discovery + validation ───────────────────────────────

interface TokenSource {
  token: string;
  source: string;
}

function readTokenFile(filepath: string): string {
  try {
    return fs.readFileSync(filepath, "utf8").replace(/\s+/g, "");
  } catch {
    return "";
  }
}

function readStoredTokensJson(filepath: string): string {
  try {
    const data = JSON.parse(fs.readFileSync(filepath, "utf8"));
    if (data && typeof data === "object") {
      // Multi-token JSON: {"name1": "hf_...", ...} OR {"token": "hf_..."}
      for (const v of Object.values(data) as unknown[]) {
        if (typeof v === "string" && v.startsWith("hf_")) return v;
      }
      for (const k of ["token", "default"]) {
        const v = (data as Record<string, unknown>)[k];
        if (typeof v === "string" && v.startsWith("hf_")) return v;
      }
    }
  } catch {
    /* fall through */
  }
  return "";
}

function discoverHfToken(): TokenSource | null {
  const hfHome = process.env.HF_HOME || path.join(os.homedir(), ".cache", "huggingface");

  if (process.env.HUGGING_FACE_HUB_TOKEN) {
    return { token: process.env.HUGGING_FACE_HUB_TOKEN, source: "HUGGING_FACE_HUB_TOKEN env var" };
  }
  if (process.env.HF_TOKEN) {
    return { token: process.env.HF_TOKEN, source: "HF_TOKEN env var" };
  }

  const candidates = [
    path.join(hfHome, "token"),
    path.join(os.homedir(), ".huggingface", "token"),
  ];
  for (const f of candidates) {
    const t = readTokenFile(f);
    if (t) return { token: t, source: `${f} (huggingface-cli login)` };
  }

  const stored = path.join(hfHome, "stored_tokens");
  if (fs.existsSync(stored)) {
    const t = readStoredTokensJson(stored);
    if (t) return { token: t, source: `${stored} (huggingface-cli login)` };
  }

  return null;
}

type TokenValidation = "valid" | "invalid" | "unknown";

function validateHfToken(token: string): TokenValidation {
  if (!token || !commandExists("curl")) return "unknown";
  const r = shellOut("curl", [
    "-s",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    "--max-time",
    "10",
    "-H",
    `Authorization: Bearer ${token}`,
    HF_WHOAMI_URL,
  ]);
  const code = r.stdout.trim();
  if (code === "200") return "valid";
  if (code === "401" || code === "403") return "invalid";
  return "unknown";
}

function persistHfToken(token: string): string {
  const hfHome = process.env.HF_HOME || path.join(os.homedir(), ".cache", "huggingface");
  fs.mkdirSync(hfHome, { recursive: true });
  const tokenPath = path.join(hfHome, "token");
  fs.writeFileSync(tokenPath, token);
  try {
    fs.chmodSync(tokenPath, 0o600);
  } catch {
    /* best-effort; chmod may fail on filesystems that don't support modes */
  }
  return tokenPath;
}

function purgeStaleTokenFiles(): void {
  const hfHome = process.env.HF_HOME || path.join(os.homedir(), ".cache", "huggingface");
  for (const f of [
    path.join(hfHome, "token"),
    path.join(hfHome, "stored_tokens"),
    path.join(os.homedir(), ".huggingface", "token"),
  ]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* missing or already gone */
    }
  }
}

async function resolveHfToken(): Promise<{ token: string; source: string } | null> {
  const discovered = discoverHfToken();
  if (discovered) {
    info(`HuggingFace token discovered (${discovered.source}). Validating against HF…`);
    const v = validateHfToken(discovered.token);
    if (v === "valid") {
      ok(`HuggingFace token: valid (${discovered.source})`);
      return discovered;
    }
    if (v === "invalid") {
      warn(`HuggingFace token from ${discovered.source} is invalid or revoked (HTTP 401/403).`);
      if (!discovered.source.includes("env var")) {
        purgeStaleTokenFiles();
        warn("  Removed stale token files. Will re-prompt below.");
      } else {
        warn("  The stale token came from a shell env var; unset it and re-export a fresh one.");
      }
    } else {
      warn("Could not validate HuggingFace token (network error or HF unreachable).");
      warn("  Proceeding with the discovered token anyway; vLLM will surface 401 if it is bad.");
      return discovered;
    }
  }

  // Interactive re-prompt — skipped for non-interactive / no TTY.
  if (!process.stdin.isTTY || process.env.NEMOCLAW_NON_INTERACTIVE) return null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log("");
    if (attempt === 1) {
      console.log(`  ${C.YELLOW}No valid HuggingFace token found.${C.RESET}`);
      console.log("  Gated models (Nemotron, Llama, etc.) require a token; open models will");
      console.log(
        "  download faster with one. Get a token at https://huggingface.co/settings/tokens",
      );
    }
    const raw = await prompt(`  Paste your hf_... token (attempt ${attempt}/3, Enter to skip): `, {
      secret: true,
    });
    const token = raw.replace(/\s+/g, "");
    if (!token) return null;
    if (!token.startsWith("hf_")) {
      warn("Token does not start with 'hf_' — try again.");
      continue;
    }
    info("Validating token against HuggingFace…");
    const v = validateHfToken(token);
    if (v === "valid") {
      const filepath = persistHfToken(token);
      ok(`HuggingFace token validated and saved to ${filepath} (mode 600)`);
      return { token, source: `user-provided (saved to ${filepath})` };
    }
    if (v === "invalid") {
      warn("Token rejected by HuggingFace (HTTP 401/403). Try again.");
      continue;
    }
    warn("Could not reach HuggingFace to validate the token. Saving it anyway.");
    const filepath = persistHfToken(token);
    return { token, source: `user-provided, unvalidated (saved to ${filepath})` };
  }
  return null;
}

function emitNoTokenBanner(): void {
  const hfHome = process.env.HF_HOME || path.join(os.homedir(), ".cache", "huggingface");
  const bar = "═".repeat(68);
  console.log("");
  console.log(`${C.RED}${bar}${C.RESET}`);
  console.log(`${C.RED}[WARN]  PROCEEDING WITHOUT A HUGGINGFACE TOKEN${C.RESET}`);
  console.log(`${C.RED}${bar}${C.RESET}`);
  console.log(`${C.RED}  Gated models (e.g. Nemotron-3 Super 120B NVFP4) will fail to${C.RESET}`);
  console.log(`${C.RED}  download with HTTP 401.${C.RESET}`);
  console.log(`${C.RED}  Open-weight models (Qwen, DeepSeek) will download unauthenticated${C.RESET}`);
  console.log(`${C.RED}  and HF will rate-limit you (a 70B model can take 18+ minutes).${C.RESET}`);
  console.log(`${C.RED}${C.RESET}`);
  console.log(`${C.RED}  To recover later without re-running the installer:${C.RESET}`);
  console.log(
    `${C.RED}    mkdir -p ${hfHome} && printf '%s' "<token>" > ${hfHome}/token${C.RESET}`,
  );
  console.log(`${C.RED}    chmod 600 ${hfHome}/token${C.RESET}`);
  console.log(`${C.RED}${bar}${C.RESET}`);
  console.log("");
}

// ── Model picker ───────────────────────────────────────────────────────────

async function pickStationModel(): Promise<string> {
  // Honour an explicit override (CI / scripted installs) without prompting.
  if (process.env.NEMOCLAW_VLLM_MODEL) {
    info(`NEMOCLAW_VLLM_MODEL set — using ${process.env.NEMOCLAW_VLLM_MODEL}`);
    return process.env.NEMOCLAW_VLLM_MODEL;
  }
  // Non-interactive: silently pick the default (Nemotron).
  if (!process.stdin.isTTY || process.env.NEMOCLAW_NON_INTERACTIVE) {
    return STATION_MODELS[DEFAULT_MODEL_INDEX].id;
  }

  console.log("");
  console.log("  ──────────────────────────────────────────────────");
  console.log("  Select inference model for this DGX Station");
  console.log("  ──────────────────────────────────────────────────");
  STATION_MODELS.forEach((m, i) => {
    const tag = m.gated ? "(gated — requires HF token)" : "(open weights, no HF token required)";
    const def = i === DEFAULT_MODEL_INDEX ? "  [default]" : "";
    console.log(`  ${i + 1}) ${m.label.padEnd(31)} ${tag}${def}`);
  });
  console.log("  ──────────────────────────────────────────────────");
  const raw = (await prompt("  Choose 1-4: ")).trim();
  const idx = raw === "" ? DEFAULT_MODEL_INDEX : Number(raw) - 1;
  const choice = STATION_MODELS[idx];
  if (!choice) {
    warn(`Unrecognised choice '${raw}' — using default (${STATION_MODELS[DEFAULT_MODEL_INDEX].label})`);
    return STATION_MODELS[DEFAULT_MODEL_INDEX].id;
  }
  info(`Selected model: ${choice.id}`);
  return choice.id;
}

// ── vLLM container lifecycle ───────────────────────────────────────────────

function getRunningVllmModel(): string {
  const r = shellOut("docker", [
    "inspect",
    "--format",
    '{{join .Config.Cmd " "}}',
    VLLM_CONTAINER,
  ]);
  if (r.code !== 0) return "";
  const m = /--model\s+(\S+)/.exec(r.stdout);
  return m ? m[1] : "";
}

function vllmContainerExists(): boolean {
  const r = shellOut("docker", ["ps", "-a", "--format", "{{.Names}}"]);
  return r.stdout.split("\n").some((n) => n.trim() === VLLM_CONTAINER);
}

function vllmContainerRunning(): boolean {
  const r = shellOut("docker", ["ps", "--format", "{{.Names}}"]);
  return r.stdout.split("\n").some((n) => n.trim() === VLLM_CONTAINER);
}

function isPortListening(port: number): boolean {
  const r = shellOut("bash", ["-c", `(echo > /dev/tcp/127.0.0.1/${port}) 2>/dev/null`]);
  return r.code === 0;
}

async function teardownVllmContainer(gpuIdx: string | null): Promise<void> {
  let vramBefore = "";
  if (gpuIdx) vramBefore = gpuMemoryUsedMb(gpuIdx);
  shellOut("docker", ["stop", VLLM_CONTAINER]);
  shellOut("docker", ["rm", VLLM_CONTAINER]);
  if (gpuIdx) {
    // Wait for the container to disappear and CUDA to release memory.
    let prev = "";
    let after = "";
    for (let i = 0; i < 30; i++) {
      if (vllmContainerExists()) {
        await sleep(1000);
        continue;
      }
      after = gpuMemoryUsedMb(gpuIdx);
      if (prev && after === prev) break;
      prev = after;
      await sleep(1000);
    }
    console.log(
      `${C.RED}        GPU ${gpuIdx} VRAM used: ${vramBefore || "?"} MiB → ${after || "?"} MiB (memory released)${C.RESET}`,
    );
  }
}

function launchVllmContainer(model: string, gpuIdx: string | null, hfToken: string): boolean {
  const gpusArg = gpuIdx ? `device=${gpuIdx}` : "all";
  const hfCache = process.env.HF_HOME || path.join(os.homedir(), ".cache", "huggingface");
  fs.mkdirSync(hfCache, { recursive: true });

  // --network host so the host's port-bind check sees the port only when
  // Uvicorn is actually serving (Docker bridge networking publishes the port
  // via docker-proxy before vLLM is ready, causing false positives) and so
  // the onboard wizard's curl probe can reach the server via any host IP.
  info(`Launching vLLM container (model: ${model}, port: ${VLLM_PORT}, gpu: ${gpusArg})…`);
  const args = [
    "run",
    "--detach",
    "--gpus",
    gpusArg,
    "--network",
    "host",
    "--name",
    VLLM_CONTAINER,
    "--restart",
    "unless-stopped",
    "-v",
    `${hfCache}:/root/.cache/huggingface`,
    "-e",
    `HUGGING_FACE_HUB_TOKEN=${hfToken}`,
    "-e",
    `HF_TOKEN=${hfToken}`,
    VLLM_IMAGE,
    "--model",
    model,
    "--port",
    String(VLLM_PORT),
  ];
  const r = shellOut("docker", args);
  if (r.code !== 0) {
    warn(`docker run failed (exit ${r.code}): ${r.stderr.trim()}`);
    return false;
  }
  return true;
}

function classifyVllmStage(logs: string): string {
  if (/Uvicorn running/.test(logs)) return "serving (handshake pending)";
  if (/Capturing CUDA graph|Graph capturing/.test(logs)) return "capturing CUDA graphs";
  if (/Loading safetensors/.test(logs)) return "loading weights into GPU";
  if (/downloading weights|Time spent downloading/.test(logs)) return "downloading weights from HuggingFace";
  if (/Starting to load model/.test(logs)) return "initializing model";
  return "starting up";
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function vllmHealthy(): boolean {
  if (!commandExists("curl")) return isPortListening(VLLM_PORT);
  return (
    shellOut("curl", ["-sf", `http://127.0.0.1:${VLLM_PORT}/health`]).code === 0
  );
}

async function waitForVllmReady(): Promise<boolean> {
  info(`Waiting for vLLM to become ready on :${VLLM_PORT}…`);
  info("First-time downloads of large models can take 30+ minutes; this is normal.");
  const start = Date.now();
  let lastStage = "";
  let lastPrintMs = 0;
  while (true) {
    if (vllmHealthy()) {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      ok(`vLLM ready on :${VLLM_PORT} after ${fmtElapsed(elapsed)}`);
      return true;
    }
    const elapsedSec = Math.floor((Date.now() - start) / 1000);
    if (elapsedSec >= HEALTH_TIMEOUT_SEC) {
      warn(`vLLM did not become healthy within ${Math.floor(HEALTH_TIMEOUT_SEC / 60)} min.`);
      warn(`Check progress with:  docker logs -f ${VLLM_CONTAINER}`);
      warn(`Once you see 'Uvicorn running on http://0.0.0.0:${VLLM_PORT}', re-run the installer.`);
      return false;
    }
    if (!vllmContainerRunning()) {
      warn(`vLLM container '${VLLM_CONTAINER}' is no longer running — last logs:`);
      const tail = shellOut("docker", ["logs", "--tail", "30", VLLM_CONTAINER]);
      const out = (tail.stderr || tail.stdout).trim();
      for (const line of out.split("\n")) console.log(`    ${line}`);
      return false;
    }
    const logs = shellOut("docker", ["logs", "--tail", "50", VLLM_CONTAINER]).stdout;
    const stage = classifyVllmStage(logs);
    const remainSec = HEALTH_TIMEOUT_SEC - elapsedSec;
    const nowMs = Date.now();
    if (stage !== lastStage) {
      console.log(`  ${C.CYAN}[vLLM]${C.RESET} stage: ${stage}`);
      console.log(
        `  ${C.CYAN}[vLLM]${C.RESET} ${stage} — still loading… ${fmtElapsed(elapsedSec)} elapsed (timeout in ${fmtElapsed(remainSec)})`,
      );
      lastStage = stage;
      lastPrintMs = nowMs;
    } else if (nowMs - lastPrintMs >= HEARTBEAT_SEC * 1000) {
      console.log(
        `  ${C.CYAN}[vLLM]${C.RESET} ${stage} — still loading… ${fmtElapsed(elapsedSec)} elapsed (timeout in ${fmtElapsed(remainSec)})`,
      );
      lastPrintMs = nowMs;
    }
    await sleep(HEALTH_POLL_SEC * 1000);
  }
}

// ── prefill helpers ────────────────────────────────────────────────────────

function getLanIp(): string {
  // Prefer the first non-loopback IPv4 we can find. Linux: `ip -4 -o addr`
  // gives a stable parseable line. Fall back to `hostname -I`, then loopback.
  const ip = shellOut("ip", ["-4", "-o", "addr", "show", "scope", "global"]);
  if (ip.code === 0) {
    for (const line of ip.stdout.split("\n")) {
      const m = /\binet\s+(\d+\.\d+\.\d+\.\d+)/.exec(line);
      if (m) return m[1];
    }
  }
  const h = shellOut("hostname", ["-I"]);
  if (h.code === 0) {
    const t = h.stdout.trim().split(/\s+/)[0];
    if (t) return t;
  }
  return "127.0.0.1";
}

function exportPrefillEnv(model: string): void {
  // Don't clobber values the user explicitly exported.
  if (!process.env.NEMOCLAW_PROVIDER) process.env.NEMOCLAW_PROVIDER = "custom";
  if (!process.env.NEMOCLAW_ENDPOINT_URL) {
    process.env.NEMOCLAW_ENDPOINT_URL = `http://${getLanIp()}:${VLLM_PORT}/v1`;
  }
  if (!process.env.NEMOCLAW_MODEL) process.env.NEMOCLAW_MODEL = model;
  if (!process.env.NEMOCLAW_PREFERRED_API) process.env.NEMOCLAW_PREFERRED_API = "chat-completions";
  info("Wizard defaults from running vLLM:");
  info("  Provider:  Other OpenAI-compatible endpoint (3)");
  info(`  Base URL:  ${process.env.NEMOCLAW_ENDPOINT_URL}`);
  info(`  Model:     ${process.env.NEMOCLAW_MODEL}`);
}

// ── Public entrypoint ──────────────────────────────────────────────────────

/**
 * Run the DGX Station preflight: pick a model, ensure vLLM is serving it, and
 * pre-populate the inference-step environment. Returns immediately on
 * non-Station hosts or when the user has already pointed at a remote endpoint
 * via NEMOCLAW_ENDPOINT_URL.
 */
export async function runStationVllmPreflight(): Promise<PreflightOutcome> {
  const outcome: PreflightOutcome = {
    station: false,
    selectedModel: null,
    vllmEndpoint: null,
    hfTokenAvailable: false,
  };
  if (!isDgxStation()) return outcome;
  if (process.env.NEMOCLAW_ENDPOINT_URL) {
    info(
      `NEMOCLAW_ENDPOINT_URL=${process.env.NEMOCLAW_ENDPOINT_URL} set; skipping Station vLLM lifecycle.`,
    );
    return outcome;
  }
  outcome.station = true;

  if (!commandExists("docker")) {
    warn("docker not available — skipping Station vLLM lifecycle.");
    return outcome;
  }

  console.log("");
  console.log("  ──────────────────────────────────────────────────");
  console.log("  DGX Station preflight (vLLM lifecycle)");
  console.log("  ──────────────────────────────────────────────────");

  const model = await pickStationModel();
  outcome.selectedModel = model;

  // Reuse path: if a vLLM container is already serving the chosen model,
  // skip the full pull/launch and just publish the wizard defaults.
  if (vllmContainerRunning() && isPortListening(VLLM_PORT)) {
    const running = getRunningVllmModel();
    if (!running || running === model) {
      info(`vLLM already running on :${VLLM_PORT} with model '${model}' — reusing.`);
      outcome.vllmEndpoint = `http://${getLanIp()}:${VLLM_PORT}/v1`;
      exportPrefillEnv(model);
      return outcome;
    }
    console.log(`${C.RED}[WARN]  vLLM is running a different model — replacing it:${C.RESET}`);
    console.log(`${C.RED}        Loaded:    ${running}${C.RESET}`);
    console.log(`${C.RED}        Requested: ${model}${C.RESET}`);
    console.log(`${C.RED}        Stopping container '${VLLM_CONTAINER}'...${C.RESET}`);
    const gpu = bestVramGpu();
    await teardownVllmContainer(gpu?.index ?? null);
  } else if (vllmContainerExists()) {
    // Stopped container left over — clean it up so docker run doesn't conflict.
    shellOut("docker", ["stop", VLLM_CONTAINER]);
    shellOut("docker", ["rm", VLLM_CONTAINER]);
  }

  const tokenInfo = await resolveHfToken();
  outcome.hfTokenAvailable = !!tokenInfo;
  if (!tokenInfo) emitNoTokenBanner();

  info(`Pulling vLLM container (${VLLM_IMAGE})…`);
  shellOut("docker", ["pull", VLLM_IMAGE]);

  const gpu = bestVramGpu();
  const launched = launchVllmContainer(model, gpu?.index ?? null, tokenInfo?.token ?? "");
  if (!launched) {
    warn("vLLM launch failed — onboard cannot proceed without a healthy vLLM endpoint.");
    return outcome;
  }
  const ready = await waitForVllmReady();
  if (!ready) return outcome;

  outcome.vllmEndpoint = `http://${getLanIp()}:${VLLM_PORT}/v1`;
  exportPrefillEnv(model);
  return outcome;
}
