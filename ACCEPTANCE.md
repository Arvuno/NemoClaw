<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Issue #3111 — Development Plan + Acceptance Criterion

**Worktree:** `/Users/jyaunches/Development/NemoClaw-working/issue-3111`
**Branch:** `issue-3111-gateway-health-honesty`
**Base:** `origin/main` at `32cab9d5f` (post PR #3362 merge)
**Related merged:** PR #3362 (coverage guard)

---

## Definition of Done (auto-added by `pr-e2e-loop`)

Nightly job **`gateway-health-honest-e2e`** (added in PR #3362) must flip from red on `main` to green on the fix branch. Dispatch locally with:

```bash
gh workflow run nightly-e2e.yaml -f jobs=gateway-health-honest-e2e --ref <this-branch>
```

**Expected failing assertion on main** (reproduced in run [25698031380](https://github.com/NVIDIA/NemoClaw/actions/runs/25698031380)):

> `[PASS] Sabotage shim was invoked as expected (GLIBC/sabotage markers present in gateway log)`
> `[FAIL] Onboard reported '✓ Docker-driver gateway is healthy' although the gateway binary crashed on startup (#3111 false-positive health check)`

After the fix the log must show:

```text
[PASS] Sabotage shim was invoked as expected (GLIBC/sabotage markers present in gateway log)
[PASS] Onboard did not falsely log 'Docker-driver gateway is healthy' when the binary crashed
[PASS] startGateway() did not resolve successfully with a crashed binary (node exit=1 or 3)
[PASS] Onboard surfaced a user-visible gateway failure message
[PASS] No live (non-zombie) gateway process is running after the simulated crash
[PASS] #3111 coverage guard green: onboard correctly surfaces a crashed gateway
```

---

## Diagnosis

The Docker-driver gateway startup path in `src/lib/onboard.ts:startDockerDriverGateway` spawns the `openshell-gateway` binary with `spawn(..., { detached: true })` + `child.unref()`, then enters a poll loop that checks `isPidAlive(childPid)` and `isGatewayHealthy(status, gwInfo, activeGwInfo)`.

Both checks can lie:

1. `isPidAlive` (`src/lib/onboard.ts:4101`) uses `process.kill(pid, 0)` which returns `true` for **zombies** (detached children that exited but haven't been reaped). Since the parent Node process never `wait()`s on the detached child, zombies persist indefinitely.

2. `isGatewayHealthy` (`src/lib/state/gateway.ts:99`) is a **pure string-matching function** over `openshell status` / `openshell gateway info` output. `isGatewayConnected` matches `Connected` OR **`Server Status`** — the latter is a **header line** that `openshell status` prints unconditionally, even when the body contains `Connection refused (os error 111)`. `registerDockerDriverGatewayEndpoint` (`src/lib/onboard.ts:4347`) is metadata-only (`openshell gateway add --local`), no TCP probe.

The reported symptom on Ubuntu 22.04 (GLIBC 2.38/2.39 link mismatch) is a *specific trigger*. The class of bug is triggered by anything that makes the gateway binary exit immediately — GLIBC mismatch, missing shared library, corrupted binary, permission error, port conflict, CDI spec error.

---

## Root Causes

### RC-1: `isPidAlive` treats zombies as alive

**Location:** `src/lib/onboard.ts:4101-4109`

`process.kill(pid, 0)` returns true for both live and zombie processes. For detached `spawn()` children where the parent doesn't `wait()`, zombies accumulate. The poll loop thus never breaks on a crashed-but-unreaped child and proceeds to the metadata check.

### RC-2: `isGatewayConnected` matches a header, not a state

**Location:** `src/lib/state/gateway.ts:80-85`

```js
statusOutput.includes("Connected") || statusOutput.includes("Server Status")
```

`Server Status` is the **title of the table** `openshell status` prints — it's always present. The real connectivity signal is buried in the body (`Connection refused` / `Error: × client error (Connect)`). The function can't distinguish "connected" from "metadata says there's a gateway at 127.0.0.1:8080, but nothing listens there."

### RC-3: No live TCP probe in the Docker-driver startup poll loop

**Location:** `src/lib/onboard.ts:5519-5540` (poll loop body)

The K3s path has a live container probe (`verifyGatewayContainerRunning()` added for #2020 — checks `docker inspect {{.State.Running}}`). The Docker-driver path has no equivalent — it trusts the metadata match. A live TCP connect to `127.0.0.1:${GATEWAY_PORT}` would instantly reveal a crashed binary.

---

## Fix Areas & Test Depth Classification

| # | Area | Change | Test Level | Rationale |
|---|------|--------|-----------|-----------|
| 1 | `src/lib/onboard.ts` — reuse `isGatewayHttpReady` from `./onboard/gateway-http-readiness` (introduced by #3312) in the `startDockerDriverGateway` poll loop | Gate the `"✓ Docker-driver gateway is healthy"` log on a real HTTP probe. Converges with the K3s-path pattern rather than adding a parallel TCP probe. | **[E2E]** required | Spawns real process, binds real port. `gateway-health-honest-e2e` IS the E2E for this change. |
| 2 | `src/lib/onboard.ts` — reap zombie child before `isPidAlive` | After spawn, periodically `waitpid`-equivalent check so zombies get detected | **[Unit]** + **[E2E]** | Same E2E catches this; also add a unit test that mocks a zombied PID. |
| 3 | `src/lib/state/gateway.ts` — **do NOT modify** | The gateway-liveness-probe test pins this file to pure-function status (see #2020 follow-up test at `test/gateway-liveness-probe.test.ts:74`). Keep the string match; fix at the caller. | **[Unit]** only | No source change. |
| 4 | `scripts/install-openshell.sh` — OPTIONAL: add a preflight that verifies the downloaded `openshell-gateway` binary can actually exec (`$BIN --version` or similar) before writing the installed marker | Surface GLIBC / linker errors at install time rather than onboard time | **[Unit]** (install script) | Out of scope for the primary fix but a useful secondary safety net for #3111's specific Ubuntu 22.04 trigger. Split into follow-up issue if larger. |

---

## Refactoring Alignment

| # | Refactoring Goal | Overlap | Recommendation |
|---|-----------------|---------|----------------|
| 1 | **PR #3312** (laitingsheng, **MERGED**) — `fix(onboard): require host HTTP readiness before reusing the gateway` | Added `isGatewayHttpReady(timeoutMs, url)` — an HTTP-level readiness probe in `src/lib/onboard/gateway-http-readiness.ts`. Already used at every gateway-reuse decision site on the K3s path. | **Adopted.** We now call `isGatewayHttpReady()` directly from `startDockerDriverGateway`'s poll loop instead of adding a parallel TCP probe. Docker-driver and K3s paths share the same probe semantics. |
| 2 | **PR #3306** (cv) — `refactor(onboard): extract gateway bootstrap repair helpers` | Extracts `src/lib/onboard/gateway-bootstrap.ts` module. | No conflict with our change — doesn't touch `startDockerDriverGateway`. |
| 3 | **#3213** — Epic: unify warnings, advisories, and fatal exits under a single registry | When onboard exits with "gateway failed to start", that message should eventually flow through the unified advisory registry. | **Seed the pattern.** `TODO(#3213)` comment added on the `startDockerDriverGateway` poll loop so the future migration to structured advisories is mechanical. |

---

## Implementation Plan

### Phase 1 — Reuse `isGatewayHttpReady` from #3312 (**[OK]** No new helper)

**Goal:** Use the shared `isGatewayHttpReady` helper introduced by PR #3312 (`src/lib/onboard/gateway-http-readiness.ts`) as the liveness gate for the Docker-driver path.

- **File:** `src/lib/onboard.ts` — the import is already there, we only add a call site in `startDockerDriverGateway`.
- **Rationale:** #3312 landed before this PR. Its HTTP probe (whitelists `{200, 401}`, handles timeouts, injectable for tests) is strictly stronger than a raw TCP connect and already the de-facto standard at every other gateway-reuse decision site in `onboard.ts` (K3s startup, preflight reuse, adopt-port-listener, etc.). Reusing it keeps the Docker-driver path from drifting away from the K3s path.
- **Tests:** `test/gateway-http-reuse-wait.test.ts` already covers the helper's behavior (21 tests). We only need source-shape guards for the new call site, in `test/gateway-health-honest-integration.test.ts`.
- **Dependencies:** None.

### Phase 2 — Reap zombie children in the startup poll loop (**[Unit]** only)

**Goal:** Detect crashed-then-zombied children so `isPidAlive` returns false as expected.

- **File:** `src/lib/onboard.ts:startDockerDriverGateway` — the `spawn()` call.
- **Implementation:** Even with `detached: true` / `child.unref()`, we can keep a reference to the `ChildProcess` object, attach a one-shot `child.on("exit", ...)` handler that sets a `childCrashed: boolean` flag, and check that flag at the top of each poll iteration alongside `isPidAlive`. Alternative: `child.removeAllListeners(); child.once("exit", ...);` with a closure-captured flag.
- **Tests:** Extend `test/onboard.test.ts` (or add `test/gateway-zombie-reap.test.ts`) — spawn a shim that exits immediately, assert the flag flips within N ms.
- **Dependencies:** None. Runs in parallel with Phase 1.

### Phase 3 — Integrate both checks into the poll loop (**[E2E]** required)

**Goal:** Make `startDockerDriverGateway` fail closed — "healthy" is only logged when the process is running AND metadata matches AND the port is serving.

- **File:** `src/lib/onboard.ts:5519-5540` (the poll loop body).
- **Implementation:**

  ```ts
  for (let i = 0; i < pollCount; i += 1) {
    if (childCrashed || !isPidAlive(childPid)) {
      break;  // existing
    }
    if (!registerDockerDriverGatewayEndpoint()) { ...continue }
    const status = runCaptureOpenshell(["status"], { ignoreError: true });
    const namedInfo = runCaptureOpenshell(["gateway", "info", "-g", GATEWAY_NAME], { ignoreError: true });
    const currentInfo = runCaptureOpenshell(["gateway", "info"], { ignoreError: true });
    if (isGatewayHealthy(status, namedInfo, currentInfo)) {
      // NEW: gate the healthy log on a real TCP probe
      if (await verifyDockerDriverGatewayListening(GATEWAY_PORT, 500)) {
        console.log("  ✓ Docker-driver gateway is healthy");
        return;
      }
      // Metadata says healthy but nothing is listening — keep polling
    }
    if (i < pollCount - 1) sleep(pollInterval);
  }
  ```

- **Tests:**
  - **E2E (primary, already exists):** `gateway-health-honest-e2e` (from PR #3362) must flip from red to green.
  - **Unit:** mock `verifyDockerDriverGatewayListening` to return `false`; assert the loop doesn't print "healthy" and eventually throws.
- **Dependencies:** Phase 1 and Phase 2 must land first.
- **Refactoring notes:** Format the final "failed to start" message as structured data with `code: "gateway-failed-to-start"` for future #3213 migration. Leave the log-tail output intact — it's already user-facing diagnostic.

### Phase 4 (OPTIONAL) — Install-time GLIBC check (**[Unit]** only)

**Goal:** Surface the GLIBC mismatch at install time, not onboard time. Addresses the specific #3111 trigger, not the class.

- **File:** `scripts/install-openshell.sh`
- **Implementation:** After `install -m 755 $tmpdir/openshell-gateway $target_dir/openshell-gateway`, run `"$target_dir/openshell-gateway" --version` (or `--help`). Capture exit code + stderr. On non-zero, print a warn/fatal message that includes the stderr (which contains GLIBC requirement) and a suggestion to upgrade to Ubuntu 24.04.
- **Tests:** Extend `test/install-openshell-version-check.test.ts`.
- **Dependencies:** None — can run in parallel with any other phase.
- **Verdict:** Ask the user whether to split this into a separate follow-up issue. The primary fix (Phases 1–3) closes the NemoClaw-side false-positive; this Phase 4 is a secondary safety net tied to the OpenShell binary packaging choice.

---

## Recommended Order

- **Phases 1 and 2 in parallel** → both are small, independent, unit-testable.
- **Phase 3 sequentially after 1 + 2.**
- **Phase 4 optional / follow-up.**

## Verdict: **[E2E]** required

| Phase | Test Depth |
|---|---|
| Phase 1 (reuse `isGatewayHttpReady`) | **[Unit]** only |
| Phase 2 (zombie-reap) | **[Unit]** only |
| Phase 3 (poll-loop integration) | **[E2E]** (`gateway-health-honest-e2e`) |
| Phase 4 (install-time check) | **[Unit]** only (optional) |

The PR-level verdict is **[E2E]** — Phase 3 is the acceptance gate, and it's already implemented as the merged coverage guard. The fix PR's definition-of-done is "this E2E flips green."

---

## Notes for the PR author

- PR title: `fix(onboard): verify Docker-driver gateway is really serving before reporting healthy (#3111)`
- PR body MUST include `Fixes #3111` to auto-close the issue (and get the coverage guard flipping green).
- Do NOT modify `src/lib/state/gateway.ts:isGatewayHealthy` — pinned by `test/gateway-liveness-probe.test.ts:74`.
- Adopted PR #3312's `isGatewayHttpReady` helper (merged); no parallel TCP probe added.
- No conflict with open PR #3306 (gateway-bootstrap refactor) — our change does not touch the files being extracted.
- The nightly-dispatch for validation:

  ```bash
  gh workflow run nightly-e2e.yaml -f jobs=gateway-health-honest-e2e --ref issue-3111-gateway-health-honesty
  ```
