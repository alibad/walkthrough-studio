#!/usr/bin/env node
/**
 * reset-demo.mjs — empty the hub.
 *
 * Removes the shipped sample so the hub starts blank: no registered apps, no
 * captures. Point it at your own app and the library, drift card and health
 * checks all come alive against that instead.
 *
 * Deliberately a script rather than a README paragraph, because "delete these
 * two paths and edit that JSON" is the kind of instruction people get half
 * right.
 *
 *   node scripts/reset-demo.mjs          # empty it
 *   node scripts/reset-demo.mjs --dry-run
 */

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = resolve(ROOT, "apps/hub/projects.json");
const STORAGE = resolve(ROOT, "apps/hub/public/walkthroughs");
const dryRun = process.argv.includes("--dry-run");

const EMPTY_REGISTRY = `{
  "$comment": [
    "The app registry. One entry per app-on-a-platform.",
    "",
    "A product shipping both a web app and an iOS app is TWO entries, even",
    "though they share a repo: they are reached differently, driven by",
    "different drivers, and captured on different surfaces.",
    "",
    "Never put a literal secret in this file. Use a $ENV_VAR placeholder in",
    "auth.roles.<role>.password and set the variable in .env.local.",
    "",
    "Add your first app with:  node scripts/new-project.mjs --help"
  ],
  "projects": []
}
`;

// Story rendering leaves narration caches and intermediate clips here. They
// are derived, but they are also keyed by project and persona, so leaving them
// behind means the next `persona:story` for a re-registered slug silently
// reuses narration written for a journey that no longer exists.
const TMP_STORY = resolve(ROOT, ".tmp-story");

const captureDirs = existsSync(STORAGE)
  ? readdirSync(STORAGE, { withFileTypes: true }).filter((e) => e.isDirectory())
  : [];

const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
const entryCount = registry.projects?.length ?? 0;

if (captureDirs.length === 0 && entryCount === 0) {
  console.log("The hub is already empty — nothing to remove.");
  process.exit(0);
}

console.log(dryRun ? "Would remove:" : "Removing:");
for (const d of captureDirs) console.log(`  apps/hub/public/walkthroughs/${d.name}/`);
if (existsSync(TMP_STORY)) console.log("  .tmp-story/ (narration caches, intermediate clips)");
if (entryCount > 0) {
  console.log(
    `  ${entryCount} registry ${entryCount === 1 ? "entry" : "entries"} from apps/hub/projects.json` +
      ` (${registry.projects.map((p) => p.slug).join(", ")})`,
  );
}

if (!dryRun) {
  for (const d of captureDirs) rmSync(join(STORAGE, d.name), { recursive: true, force: true });
  rmSync(TMP_STORY, { recursive: true, force: true });
  writeFileSync(REGISTRY, EMPTY_REGISTRY);
  console.log(`\n✓ hub is empty. Register an app:\n  node scripts/new-project.mjs --slug=my-app --name="My App" --platform=web --url=http://localhost:3000 --codebase=~/code/my-app\n\nThen walk it:  /walkthrough --project=my-app`);
} else {
  console.log("\n(dry run — nothing changed)");
}
