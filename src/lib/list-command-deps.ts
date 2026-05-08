// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/* v8 ignore start -- runtime dependency adapter covered through CLI integration tests. */

import * as onboardSession from "./state/onboard-session";
import type { ListSandboxesCommandDeps } from "./inventory-commands";
import { parseGatewayInference } from "./inference/config";
import { OPENSHELL_PROBE_TIMEOUT_MS } from "./adapters/openshell/timeouts";
import { parseSshProcesses, createSystemDeps } from "./state/sandbox-session";
import { resolveOpenshell } from "./adapters/openshell/resolve";
import { captureOpenshell } from "./adapters/openshell/runtime";
import { recoverRegistryEntries } from "./registry-recovery-action";
import * as registry from "./state/registry";

export function buildListCommandDeps(): ListSandboxesCommandDeps {
  const opsBinList = resolveOpenshell();
  const sessionDeps = opsBinList ? createSystemDeps(opsBinList) : null;

  // Cache the SSH process probe once for all sandboxes — avoids spawning ps
  // per sandbox row. The getSshProcesses() call is the expensive part (5s timeout).
  let cachedSshOutput: string | null | undefined;
  const getCachedSshOutput = () => {
    if (cachedSshOutput === undefined && sessionDeps) {
      try {
        cachedSshOutput = sessionDeps.getSshProcesses();
      } catch {
        cachedSshOutput = null;
      }
    }
    return cachedSshOutput ?? null;
  };

  return {
    // #2666: never let an unexpected throw from gateway-side recovery (e.g.
    // openshell hanging on a foreign port-holder while its container is
    // stopped) suppress the registry-only listing. The registry lives on
    // disk and is independent of runtime state.
    recoverRegistryEntries: async () => {
      try {
        return await recoverRegistryEntries();
      } catch {
        const fallback = registry.listSandboxes();
        return { ...fallback, recoveredFromSession: false, recoveredFromGateway: 0 };
      }
    },
    getLiveInference: () => {
      try {
        return parseGatewayInference(
          captureOpenshell(["inference", "get"], {
            ignoreError: true,
            timeout: OPENSHELL_PROBE_TIMEOUT_MS,
          }).output,
        );
      } catch {
        return null;
      }
    },
    loadLastSession: () => onboardSession.loadSession(),
    getActiveSessionCount: sessionDeps
      ? (name) => {
          try {
            const sshOutput = getCachedSshOutput();
            if (sshOutput === null) return null;
            return parseSshProcesses(sshOutput, name).length;
          } catch {
            return null;
          }
        }
      : undefined,
  };
}
