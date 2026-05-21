// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { PublicCommandDisplayEntry } from "../../../lib/cli/command-display";
import { NemoClawCommand } from "../../../lib/cli/nemoclaw-oclif-command";
import { loadNativeInstallerInstallPlan } from "../../../lib/native-installer/macos/describe";

export default class NativeInstallerDescribeCommand extends NemoClawCommand {
  static id = "native-installer:mac:describe";
  static strict = true;
  static enableJsonFlag = true;
  static summary = "Describe the Mac Installer Preview plan";
  static description = "Return the YAML-backed, app-facing native Mac installer plan.";
  static usage = ["native-installer mac describe --json"];
  static examples = ["<%= config.bin %> native-installer mac describe --json"];
  static publicDisplay = [
    {
      usage: "nemoclaw native-installer mac describe",
      description: "Describe the Mac Installer Preview install plan",
      flags: "--json",
      group: "Getting Started",
      scope: "global",
      order: 1.05,
    },
  ] satisfies readonly PublicCommandDisplayEntry[];
  static flags = {};

  public async run(): Promise<unknown> {
    await this.parse(NativeInstallerDescribeCommand);
    const plan = loadNativeInstallerInstallPlan();
    if (this.jsonEnabled()) return plan;
    this.log("NemoClaw Mac Installer Preview plan");
    this.log("");
    for (const agent of plan.agents) {
      this.log(`- ${agent.displayName}: ${agent.description}`);
    }
    this.log("");
    this.log("Use --json for the structured app contract.");
  }
}
