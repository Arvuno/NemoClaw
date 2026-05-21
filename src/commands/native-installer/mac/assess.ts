// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { PublicCommandDisplayEntry } from "../../../lib/cli/command-display";
import { NemoClawCommand } from "../../../lib/cli/nemoclaw-oclif-command";
import {
  assessNativeInstallerHost,
  renderNativeInstallerAssessmentText,
} from "../../../lib/native-installer/macos/assess";

export default class NativeInstallerAssessCommand extends NemoClawCommand {
  static id = "native-installer:mac:assess";
  static strict = true;
  static enableJsonFlag = true;
  static summary = "Assess Mac Installer Preview eligibility";
  static description = "Check whether this Mac can use the experimental NemoClaw Mac Installer Preview.";
  static usage = ["native-installer mac assess [--json]"];
  static examples = ["<%= config.bin %> native-installer mac assess --json"];
  static publicDisplay = [
    {
      usage: "nemoclaw native-installer mac assess",
      description: "Assess Mac Installer Preview eligibility",
      flags: "[--json]",
      group: "Getting Started",
      scope: "global",
      order: 1.1,
    },
  ] satisfies readonly PublicCommandDisplayEntry[];
  static flags = {};

  public async run(): Promise<unknown> {
    await this.parse(NativeInstallerAssessCommand);
    const assessment = assessNativeInstallerHost();
    if (this.jsonEnabled()) return assessment;
    for (const line of renderNativeInstallerAssessmentText(assessment)) this.log(line);
    if (!assessment.supported) this.setExitCode(1);
  }
}
