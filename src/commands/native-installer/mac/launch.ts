// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { Flags } from "@oclif/core";

import type { PublicCommandDisplayEntry } from "../../../lib/cli/command-display";
import { NemoClawCommand } from "../../../lib/cli/nemoclaw-oclif-command";
import { isNativeInstallerAgentName } from "../../../lib/native-installer/macos/images";
import {
  renderNativeInstallerLaunchText,
  runNativeInstallerLaunch,
} from "../../../lib/native-installer/macos/launch";

export default class NativeInstallerLaunchCommand extends NemoClawCommand {
  static id = "native-installer:mac:launch";
  static strict = true;
  static enableJsonFlag = true;
  static summary = "Launch the selected Mac Installer Preview agent";
  static description = "Open OpenClaw or print Hermes API console details for a native Mac installer sandbox.";
  static usage = ["native-installer mac launch [--agent openclaw|hermes] [--json] [--no-open]"];
  static examples = [
    "<%= config.bin %> native-installer mac launch --agent openclaw",
    "<%= config.bin %> native-installer mac launch --agent hermes --json",
  ];
  static publicDisplay = [
    {
      usage: "nemoclaw native-installer mac launch",
      description: "Launch the selected Mac Installer Preview agent",
      flags: "[--agent openclaw|hermes] [--json] [--no-open]",
      group: "Getting Started",
      scope: "global",
      order: 1.3,
    },
  ] satisfies readonly PublicCommandDisplayEntry[];
  static flags = {
    agent: Flags.string({ description: "Agent to launch: openclaw or hermes" }),
    open: Flags.boolean({
      allowNo: true,
      default: true,
      description: "Open browser for UI agents",
    }),
  };

  public async run(): Promise<unknown> {
    const { flags } = await this.parse(NativeInstallerLaunchCommand);
    const requestedAgent = typeof flags.agent === "string" ? flags.agent : undefined;
    if (requestedAgent && !isNativeInstallerAgentName(requestedAgent)) {
      this.failWithLines(["--agent must be openclaw or hermes"]);
      return;
    }
    const agent = requestedAgent && isNativeInstallerAgentName(requestedAgent) ? requestedAgent : undefined;
    try {
      const info = runNativeInstallerLaunch(agent, { open: this.jsonEnabled() ? false : flags.open });
      if (this.jsonEnabled()) return info;
      for (const line of renderNativeInstallerLaunchText(info)) this.log(line);
    } catch (error) {
      this.failWithLines([error instanceof Error ? error.message : String(error)]);
    }
  }
}
