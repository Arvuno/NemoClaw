// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  type MessagingChannelConfig,
  mergeMessagingChannelConfigs,
  sanitizeMessagingChannelConfig,
} from "../messaging-channel-config";
import type { Session } from "../state/onboard-session";
import * as onboardSession from "../state/onboard-session";
import * as registry from "../state/registry";

export function getStoredMessagingChannelConfig(
  sandboxName: string | null,
  session: Session | null,
): MessagingChannelConfig | null {
  const registryConfig = sandboxName
    ? sanitizeMessagingChannelConfig(registry.getSandbox(sandboxName)?.messagingChannelConfig)
    : null;
  const sessionMatchesSandbox =
    !session?.sandboxName || !sandboxName || session.sandboxName === sandboxName;
  const sessionConfig = sessionMatchesSandbox
    ? sanitizeMessagingChannelConfig(session?.messagingChannelConfig)
    : null;
  return mergeMessagingChannelConfigs(registryConfig, sessionConfig);
}

export function persistMessagingChannelConfigToSession(config: MessagingChannelConfig | null): void {
  onboardSession.updateSession((current: Session) => {
    current.messagingChannelConfig = config;
    return current;
  });
}

export function messagingChannelConfigsEqual(
  left: MessagingChannelConfig | null,
  right: MessagingChannelConfig | null,
): boolean {
  const leftKeys = Object.keys(left || {}).sort();
  const rightKeys = Object.keys(right || {}).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left?.[key] === right?.[key]);
}
