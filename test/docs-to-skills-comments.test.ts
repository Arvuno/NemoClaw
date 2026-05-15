// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const converterPath = path.join(repoRoot, "scripts", "docs-to-skills.py");

function listMarkdownFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

describe("docs-to-skills comments", () => {
  it("omits source HTML and MDX comments without changing fenced examples", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-docs-to-skills-"));
    try {
      const docsDir = path.join(tempDir, "docs");
      const outputDir = path.join(tempDir, "skills");
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(
        path.join(docsDir, "comment-test.mdx"),
        [
          "---",
          "title: Comment Test",
          "description-agent: Use when validating docs-to-skills comment handling.",
          "content:",
          "  type: how_to",
          "---",
          "# Comment Test",
          "",
          "Visible introduction.",
          "",
          "<!--",
          "Hidden HTML comment.",
          "## Hidden Heading",
          "-->",
          "",
          "{/*",
          "<Warning title=\"Hidden warning\">",
          "This warning should not become a gotcha.",
          "</Warning>",
          "*/}",
          "",
          '<a id="visible-step"></a>',
          "## Visible Step",
          "",
          "Keep these examples literal:",
          "",
          "```md",
          "<!-- keep html comment in code -->",
          "{/* keep mdx comment in code */}",
          "```",
          "",
        ].join("\n"),
      );

      const result = spawnSync(
        "python3",
        [
          converterPath,
          docsDir,
          outputDir,
          "--prefix",
          "test",
          "--doc-platform",
          "fern-mdx",
        ],
        { cwd: repoRoot, encoding: "utf8" },
      );

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const generated = listMarkdownFiles(outputDir)
        .map((file) => fs.readFileSync(file, "utf8"))
        .join("\n");

      expect(generated).toContain("Visible introduction.");
      expect(generated).toContain('<a id="visible-step"></a>\n\n## Step 1: Visible Step');
      expect(generated).toContain("## Step 1: Visible Step");
      expect(generated).not.toContain("Hidden HTML comment.");
      expect(generated).not.toContain("Hidden Heading");
      expect(generated).not.toContain("Hidden warning");
      expect(generated).not.toContain("This warning should not become a gotcha.");
      expect(generated).toContain("<!-- keep html comment in code -->");
      expect(generated).toContain("{/* keep mdx comment in code */}");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
