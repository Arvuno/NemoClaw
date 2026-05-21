// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { Flags } from "@oclif/core";

import type { PublicCommandDisplayEntry } from "../../lib/cli/command-display";
import { NemoClawCommand } from "../../lib/cli/nemoclaw-oclif-command";
import { runDebug } from "../../lib/diagnostics/debug";
import { runDebugCommandWithOptions } from "../../lib/diagnostics/debug-command";

export default class DiagnosticsExportCommand extends NemoClawCommand {
  static id = "diagnostics:export";
  static strict = true;
  static summary = "Export diagnostics tarball";
  static description = "Export NemoClaw diagnostics to a tarball for recovery or support.";
  static usage = ["diagnostics export --output <path> [--sandbox NAME] [--quick]"];
  static examples = ["<%= config.bin %> diagnostics export --output /tmp/nemoclaw-debug.tar.gz"];
  static publicDisplay = [
    {
      usage: "nemoclaw diagnostics export",
      description: "Export diagnostics tarball",
      flags: "--output <path> [--sandbox NAME] [--quick]",
      group: "Troubleshooting",
      scope: "global",
      order: 37.5,
    },
  ] satisfies readonly PublicCommandDisplayEntry[];
  static flags = {
    output: Flags.string({
      char: "o",
      description: "Write a tarball to FILE",
      required: true,
    }),
    sandbox: Flags.string({ description: "Target sandbox name" }),
    quick: Flags.boolean({ char: "q", description: "Only collect minimal diagnostics" }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DiagnosticsExportCommand);
    runDebugCommandWithOptions(
      {
        output: flags.output,
        sandboxName: flags.sandbox,
        quick: flags.quick === true,
      },
      {
        getDefaultSandbox: () => undefined,
        runDebug,
      },
    );
  }
}
