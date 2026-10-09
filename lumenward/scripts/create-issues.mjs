#!/usr/bin/env node
// Creates the planned issues with the GitHub CLI (gh).
//   node scripts/create-issues.mjs --repo <owner>/lumenward --dry-run
//   node scripts/create-issues.mjs --repo <owner>/lumenward
// Requires: gh installed and logged in (gh auth login).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    repo: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    label: { type: "string", default: "Stellar Wave" },
  },
});
if (!values.repo) {
  console.error("Usage: node scripts/create-issues.mjs --repo <owner>/<name> [--dry-run] [--label 'Stellar Wave']");
  process.exit(2);
}

const issues = JSON.parse(readFileSync(new URL("./issues.json", import.meta.url), "utf8"));
const COMPLEXITY = {
  trivial: { name: "complexity: trivial", color: "c2e0c6" },
  medium: { name: "complexity: medium", color: "fbca04" },
  high: { name: "complexity: high", color: "d93f0b" },
};

const GUIDELINES = [
  "- **Assignment required.** Comment to ask for assignment and wait for a maintainer. Do not start before you are assigned.",
  "- Include `Closes #<this issue number>` in your pull request description.",
  "- Run `npm test`, `npm run typecheck` and `npm run build` before you open the pull request.",
  "- You must be able to explain every line you submit. Untested or unexplained AI-generated work will be closed.",
  "- See [CONTRIBUTING.md](CONTRIBUTING.md).",
].join("\n");

const list = (items) => items.map((r) => `- [ ] ${r}`).join("\n");

function body(i) {
  return [
    "## Description",
    i.description,
    "",
    "## Requirements and context",
    list(i.requirements),
    "",
    "## Suggested execution",
    i.execution,
    "",
    "## Test and commit",
    i.tests,
    "",
    "## Guidelines",
    GUIDELINES,
    "",
    `**Complexity:** ${i.complexity[0].toUpperCase()}${i.complexity.slice(1)}`,
  ].join("\n");
}

const gh = (args, input) =>
  execFileSync("gh", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] }).trim();

if (!values["dry-run"]) {
  gh(["label", "create", values.label, "--repo", values.repo, "--color", "6366F1", "--force"]);
  for (const c of Object.values(COMPLEXITY)) {
    gh(["label", "create", c.name, "--repo", values.repo, "--color", c.color, "--force"]);
  }
  for (const area of new Set(issues.map((i) => i.area))) {
    gh(["label", "create", `area: ${area}`, "--repo", values.repo, "--color", "ededed", "--force"]);
  }
}

for (const i of issues) {
  const labels = [values.label, COMPLEXITY[i.complexity].name, `area: ${i.area}`].join(",");
  if (values["dry-run"]) {
    console.log(`[dry run] ${i.title}\n          labels: ${labels}`);
    continue;
  }
  const url = gh(
    ["issue", "create", "--repo", values.repo, "--title", i.title, "--label", labels, "--body-file", "-"],
    body(i),
  );
  console.log(url);
}
console.log(`\n${issues.length} issues ${values["dry-run"] ? "would be created" : "created"}.`);
