#!/usr/bin/env node
/** One local gate for the exact checks required before a deploying push. */
import { spawnSync } from "node:child_process";

const checks = [
  ["environment", ["run", "doctor", "--no-verify"]],
  ["policy tests", ["test"]],
  ["capture layer", ["run", "verify:capture"]],
  ["evidence on disk", ["run", "verify:evidence"]],
  ["media render sites", ["run", "audit:art"]],
  ["TypeScript", ["typecheck"]],
  ["production build", ["build"]],
];

for (const [label, args] of checks) {
  console.log(`\n── ${label}`);
  const result = spawnSync("pnpm", args, { stdio: "inherit", env: { ...process.env, NO_COLOR: "1" } });
  if (result.error) {
    console.error(`${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${label}: failed with exit ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n✓ local release gate passed");
