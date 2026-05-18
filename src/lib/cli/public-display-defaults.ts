// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { PublicCommandDisplayEntry } from "./command-display";

export const PUBLIC_DISPLAY_ENTRIES: Record<string, readonly PublicCommandDisplayEntry[]> = {
  "backup-all": [
    {
      "usage": "nemoclaw backup-all",
      "description": "Back up all sandbox state before upgrade",
      "group": "Backup",
      "scope": "global",
      "order": 40
    }
  ],
  "credentials:list": [
    {
      "usage": "nemoclaw credentials list",
      "description": "List stored credential keys",
      "group": "Credentials",
      "scope": "global",
      "order": 38
    }
  ],
  "credentials:reset": [
    {
      "usage": "nemoclaw credentials reset",
      "description": "Remove a stored credential so onboard re-prompts",
      "flags": "<PROVIDER> [--yes|-y]",
      "group": "Credentials",
      "scope": "global",
      "order": 39
    }
  ],
  "debug": [
    {
      "usage": "nemoclaw debug",
      "description": "Collect diagnostics for bug reports",
      "flags": "[--quick] [--output FILE|-o FILE] [--sandbox NAME]",
      "group": "Troubleshooting",
      "scope": "global",
      "order": 37
    }
  ],
  "deploy": [
    {
      "usage": "nemoclaw deploy",
      "description": "Deprecated Brev-specific bootstrap path",
      "group": "Compatibility Commands",
      "deprecated": true,
      "scope": "global",
      "order": 31
    }
  ],
  "gc": [
    {
      "usage": "nemoclaw gc",
      "description": "Remove orphaned sandbox Docker images",
      "flags": "(--yes|-y|--force, --dry-run)",
      "group": "Cleanup",
      "scope": "global",
      "order": 42
    }
  ],
  "inference:get": [
    {
      "usage": "nemoclaw inference get",
      "description": "Show the active inference provider and model",
      "flags": "[--json]",
      "group": "Services",
      "scope": "global",
      "order": 36
    }
  ],
  "inference:set": [
    {
      "usage": "nemoclaw inference set",
      "description": "Switch inference and sync the running agent config",
      "flags": "--provider <provider> --model <model> [--sandbox <name>] [--no-verify]",
      "group": "Services",
      "scope": "global",
      "order": 37
    }
  ],
  "list": [
    {
      "usage": "nemoclaw list",
      "description": "List all sandboxes",
      "flags": "[--json]",
      "group": "Sandbox Management",
      "scope": "global",
      "order": 2
    }
  ],
  "onboard": [
    {
      "usage": "nemoclaw onboard",
      "description": "Configure inference endpoint and credentials",
      "group": "Getting Started",
      "scope": "global",
      "order": 0
    },
    {
      "usage": "nemoclaw onboard --from",
      "description": "Use a custom Dockerfile for the sandbox image",
      "group": "Getting Started",
      "scope": "global",
      "order": 1
    }
  ],
  "root:help": [
    {
      "usage": "nemoclaw help",
      "description": "Show help",
      "group": "Getting Started",
      "hidden": true,
      "scope": "global",
      "order": 44
    },
    {
      "usage": "nemoclaw --help",
      "description": "Show help",
      "group": "Getting Started",
      "hidden": true,
      "scope": "global",
      "order": 45
    },
    {
      "usage": "nemoclaw -h",
      "description": "Show help",
      "group": "Getting Started",
      "hidden": true,
      "scope": "global",
      "order": 46
    }
  ],
  "root:version": [
    {
      "usage": "nemoclaw version",
      "description": "Show version",
      "group": "Getting Started",
      "hidden": true,
      "scope": "global",
      "order": 46
    },
    {
      "usage": "nemoclaw --version",
      "description": "Show version",
      "group": "Getting Started",
      "hidden": true,
      "scope": "global",
      "order": 47
    },
    {
      "usage": "nemoclaw -v",
      "description": "Show version",
      "group": "Getting Started",
      "hidden": true,
      "scope": "global",
      "order": 48
    }
  ],
  "sandbox:channels:add": [
    {
      "usage": "nemoclaw <name> channels add",
      "description": "Save credentials and rebuild",
      "flags": "<channel> [--dry-run]",
      "group": "Messaging Channels",
      "scope": "sandbox",
      "order": 21
    }
  ],
  "sandbox:channels:list": [
    {
      "usage": "nemoclaw <name> channels list",
      "description": "List supported messaging channels",
      "group": "Messaging Channels",
      "scope": "sandbox",
      "order": 20
    }
  ],
  "sandbox:channels:remove": [
    {
      "usage": "nemoclaw <name> channels remove",
      "description": "Remove a configured messaging channel",
      "flags": "<channel> [--dry-run]",
      "group": "Messaging Channels",
      "scope": "sandbox",
      "order": 22
    }
  ],
  "sandbox:channels:start": [
    {
      "usage": "nemoclaw <name> channels start",
      "description": "Re-enable a previously stopped channel",
      "flags": "<channel> [--dry-run]",
      "group": "Messaging Channels",
      "scope": "sandbox",
      "order": 24
    }
  ],
  "sandbox:channels:stop": [
    {
      "usage": "nemoclaw <name> channels stop",
      "description": "Disable channel (keeps credentials)",
      "flags": "<channel> [--dry-run]",
      "group": "Messaging Channels",
      "scope": "sandbox",
      "order": 23
    }
  ],
  "sandbox:config:get": [
    {
      "usage": "nemoclaw <name> config get",
      "description": "Get sandbox configuration",
      "flags": "[--key <dotpath>] [--format json|yaml]",
      "group": "Sandbox Management",
      "hidden": true,
      "scope": "sandbox",
      "order": 28
    }
  ],
  "sandbox:config:rotate-token": [
    {
      "usage": "nemoclaw <name> config rotate-token",
      "description": "Rotate sandbox provider credentials",
      "group": "Sandbox Management",
      "hidden": true,
      "scope": "sandbox",
      "order": 30
    }
  ],
  "sandbox:config:set": [
    {
      "usage": "nemoclaw <name> config set",
      "description": "Set sandbox configuration with SSRF validation",
      "flags": "--key <dotpath> --value <value> [--restart] [--config-accept-new-path]",
      "group": "Sandbox Management",
      "hidden": true,
      "scope": "sandbox",
      "order": 29
    }
  ],
  "sandbox:connect": [
    {
      "usage": "nemoclaw <name> connect",
      "description": "Shell into a running sandbox",
      "flags": "[--probe-only]",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 3
    }
  ],
  "sandbox:destroy": [
    {
      "usage": "nemoclaw <name> destroy",
      "description": "Stop NIM + delete sandbox",
      "flags": "[--yes|-y|--force] [--cleanup-gateway|--no-cleanup-gateway]",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 15
    }
  ],
  "sandbox:doctor": [
    {
      "usage": "nemoclaw <name> doctor",
      "description": "Run host, gateway, sandbox, and inference health checks",
      "flags": "[--json]",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 5
    }
  ],
  "sandbox:gateway:token": [
    {
      "usage": "nemoclaw <name> gateway-token",
      "description": "Print the OpenClaw gateway auth token to stdout",
      "flags": "[--quiet|-q]",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 14
    }
  ],
  "sandbox:hosts:add": [
    {
      "usage": "nemoclaw <name> hosts-add",
      "description": "Add a sandbox /etc/hosts alias",
      "flags": "<hostname> <ip> [--dry-run]",
      "group": "Policy Presets",
      "scope": "sandbox",
      "order": 19.1
    }
  ],
  "sandbox:hosts:list": [
    {
      "usage": "nemoclaw <name> hosts-list",
      "description": "List sandbox host aliases",
      "group": "Policy Presets",
      "scope": "sandbox",
      "order": 19.2
    }
  ],
  "sandbox:hosts:remove": [
    {
      "usage": "nemoclaw <name> hosts-remove",
      "description": "Remove a sandbox /etc/hosts alias",
      "flags": "(--dry-run)",
      "group": "Policy Presets",
      "scope": "sandbox",
      "order": 19.3
    }
  ],
  "sandbox:logs": [
    {
      "usage": "nemoclaw <name> logs",
      "description": "Stream sandbox logs",
      "flags": "[--follow] [--tail <lines>|-n <lines>] [--since <duration>]",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 6
    }
  ],
  "sandbox:policy:add": [
    {
      "usage": "nemoclaw <name> policy-add",
      "description": "Add a network or filesystem policy preset",
      "flags": "(--yes, -y, --dry-run, --from-file <path>, --from-dir <path>)",
      "group": "Policy Presets",
      "scope": "sandbox",
      "order": 17
    }
  ],
  "sandbox:policy:list": [
    {
      "usage": "nemoclaw <name> policy-list",
      "description": "List presets (● = applied)",
      "group": "Policy Presets",
      "scope": "sandbox",
      "order": 19
    }
  ],
  "sandbox:policy:remove": [
    {
      "usage": "nemoclaw <name> policy-remove",
      "description": "Remove an applied policy preset (built-in or custom)",
      "flags": "(--yes, -y, --dry-run)",
      "group": "Policy Presets",
      "scope": "sandbox",
      "order": 18
    }
  ],
  "sandbox:rebuild": [
    {
      "usage": "nemoclaw <name> rebuild",
      "description": "Upgrade sandbox to current agent version",
      "flags": "[--yes|-y|--force] [--verbose|-v]",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 13
    }
  ],
  "sandbox:recover": [
    {
      "usage": "nemoclaw <name> recover",
      "description": "Restart the sandbox gateway and dashboard port-forward",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 3.5
    }
  ],
  "sandbox:share:mount": [
    {
      "usage": "nemoclaw <name> share mount",
      "description": "Mount sandbox filesystem on the host via SSHFS",
      "flags": "[sandbox-path] [local-mount-point]",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 10
    }
  ],
  "sandbox:share:status": [
    {
      "usage": "nemoclaw <name> share status",
      "description": "Check whether the sandbox filesystem is currently mounted",
      "flags": "[local-mount-point]",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 12
    }
  ],
  "sandbox:share:unmount": [
    {
      "usage": "nemoclaw <name> share unmount",
      "description": "Unmount a previously mounted sandbox filesystem",
      "flags": "[local-mount-point]",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 11
    }
  ],
  "sandbox:shields:down": [
    {
      "usage": "nemoclaw <name> shields down",
      "description": "Lower sandbox security shields",
      "flags": "[--timeout 5m] [--reason <text>] [--policy permissive]",
      "group": "Sandbox Management",
      "hidden": true,
      "scope": "sandbox",
      "order": 25
    }
  ],
  "sandbox:shields:status": [
    {
      "usage": "nemoclaw <name> shields status",
      "description": "Show current shields state",
      "group": "Sandbox Management",
      "hidden": true,
      "scope": "sandbox",
      "order": 27
    }
  ],
  "sandbox:shields:up": [
    {
      "usage": "nemoclaw <name> shields up",
      "description": "Raise sandbox security shields",
      "group": "Sandbox Management",
      "hidden": true,
      "scope": "sandbox",
      "order": 26
    }
  ],
  "sandbox:skill:install": [
    {
      "usage": "nemoclaw <name> skill install",
      "description": "Deploy a skill directory to the sandbox",
      "flags": "<path>",
      "group": "Skills",
      "scope": "sandbox",
      "order": 16
    }
  ],
  "sandbox:snapshot:create": [
    {
      "usage": "nemoclaw <name> snapshot create",
      "description": "Create a snapshot of sandbox state",
      "flags": "[--name <name>]",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 7
    }
  ],
  "sandbox:snapshot:list": [
    {
      "usage": "nemoclaw <name> snapshot list",
      "description": "List available snapshots",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 8
    }
  ],
  "sandbox:snapshot:restore": [
    {
      "usage": "nemoclaw <name> snapshot restore",
      "description": "Restore state from a snapshot",
      "flags": "[selector] [--to <dst>]",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 9
    }
  ],
  "sandbox:status": [
    {
      "usage": "nemoclaw <name> status",
      "description": "Sandbox health + NIM status",
      "group": "Sandbox Management",
      "scope": "sandbox",
      "order": 4
    }
  ],
  "setup": [
    {
      "usage": "nemoclaw setup",
      "description": "Deprecated alias for nemoclaw onboard",
      "group": "Compatibility Commands",
      "deprecated": true,
      "scope": "global",
      "order": 29
    }
  ],
  "setup-spark": [
    {
      "usage": "nemoclaw setup-spark",
      "description": "Deprecated alias for nemoclaw onboard",
      "group": "Compatibility Commands",
      "deprecated": true,
      "scope": "global",
      "order": 30
    }
  ],
  "start": [
    {
      "usage": "nemoclaw start",
      "description": "Deprecated alias for 'tunnel start'",
      "group": "Services",
      "deprecated": true,
      "scope": "global",
      "order": 34
    }
  ],
  "status": [
    {
      "usage": "nemoclaw status",
      "description": "Show sandbox list and service status",
      "flags": "[--json]",
      "group": "Services",
      "scope": "global",
      "order": 36
    }
  ],
  "stop": [
    {
      "usage": "nemoclaw stop",
      "description": "Deprecated alias for 'tunnel stop'",
      "group": "Services",
      "deprecated": true,
      "scope": "global",
      "order": 35
    }
  ],
  "tunnel:start": [
    {
      "usage": "nemoclaw tunnel start",
      "description": "Start the cloudflared public-URL tunnel",
      "group": "Services",
      "scope": "global",
      "order": 32
    }
  ],
  "tunnel:stop": [
    {
      "usage": "nemoclaw tunnel stop",
      "description": "Stop the cloudflared public-URL tunnel",
      "group": "Services",
      "scope": "global",
      "order": 33
    }
  ],
  "uninstall": [
    {
      "usage": "nemoclaw uninstall",
      "description": "Run uninstall.sh (local only; no remote fallback)",
      "group": "Cleanup",
      "scope": "global",
      "order": 43
    }
  ],
  "update": [
    {
      "usage": "nemoclaw update",
      "description": "Run the maintained NemoClaw installer update flow",
      "flags": "(--check, --yes|-y)",
      "group": "Upgrade",
      "scope": "global",
      "order": 40
    }
  ],
  "upgrade-sandboxes": [
    {
      "usage": "nemoclaw upgrade-sandboxes",
      "description": "Detect and rebuild stale sandboxes",
      "flags": "(--check, --auto, --yes|-y)",
      "group": "Upgrade",
      "scope": "global",
      "order": 41
    }
  ]
};
