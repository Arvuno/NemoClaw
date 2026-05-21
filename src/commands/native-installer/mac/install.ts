// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { Flags } from "@oclif/core";

import type { PublicCommandDisplayEntry } from "../../../lib/cli/command-display";
import { NemoClawCommand } from "../../../lib/cli/nemoclaw-oclif-command";
import { loadNativeInstallerConfigFile } from "../../../lib/native-installer/macos/config";
import {
  NativeInstallerInstallError,
  progressEventToJsonLine,
  runNativeInstallerInstall,
} from "../../../lib/native-installer/macos/install";

export default class NativeInstallerInstallCommand extends NemoClawCommand {
  static id = "native-installer:mac:install";
  static strict = true;
  static summary = "Install a stock agent through the Mac Installer Preview";
  static description = "Install stock OpenClaw or Hermes through the experimental native macOS installer path.";
  static usage = ["native-installer mac install --config <json> [--json-progress]"];
  static examples = ["<%= config.bin %> native-installer mac install --config mac-installer.json --json-progress"];
  static publicDisplay = [
    {
      usage: "nemoclaw native-installer mac install",
      description: "Install stock OpenClaw or Hermes through Mac Installer Preview",
      flags: "--config <json> [--json-progress]",
      group: "Getting Started",
      scope: "global",
      order: 1.2,
    },
  ] satisfies readonly PublicCommandDisplayEntry[];
  static flags = {
    config: Flags.string({
      description: "Path to native Mac installer config JSON",
      required: true,
    }),
    "json-progress": Flags.boolean({
      description: "Emit newline-delimited JSON progress events",
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(NativeInstallerInstallCommand);
    let config;
    try {
      config = loadNativeInstallerConfigFile(flags.config);
    } catch (error) {
      this.failWithLines([error instanceof Error ? error.message : String(error)]);
      return;
    }

    const emit = flags["json-progress"]
      ? (event: Parameters<typeof progressEventToJsonLine>[0]) => this.log(progressEventToJsonLine(event))
      : (event: Parameters<typeof progressEventToJsonLine>[0]) => this.log(`${event.phase}: ${event.message}`);

    try {
      await runNativeInstallerInstall(config, { emit });
    } catch (error) {
      if (error instanceof NativeInstallerInstallError) {
        this.setExitCode(1);
        return;
      }
      throw error;
    }
  }
}
