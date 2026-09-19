#!/usr/bin/env node
/**
 * doctor.mjs — what this machine can do, and what it cannot.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Before this, every capability failed at the point of use and nowhere else. A
 * walk would run for six minutes and then die on `missing in .env.local:
 * OPENAI_API_KEY`, which tells you the name of a variable and nothing about
 * whether you needed it. Worse, a *set but revoked* key failed the same way and
 * looked like a different problem.
 *
 * So: one command, run before anything, that answers three questions the old
 * error messages never separated —
 *
 *   1. Do I need this at all?   (some capabilities the host already has)
 *   2. Is it configured?        (the variable is present)
 *   3. Does it actually work?   (a real request was accepted)
 *
 * Exit code is 1 only when something REQUIRED is missing. A machine with no
 * image provider is not broken; it produces a project page with monograms
 * instead of portraits, and says so.
 *
 * Usage:
 *   pnpm doctor                 full report, with live credential checks
 *   pnpm doctor --no-verify     skip the network calls
 *   pnpm doctor --json          machine-readable
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEnvironment } from "./lib/environment.mjs";
import { detectCapabilities, describeCapabilities } from "./lib/capture/capabilities.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const VERIFY = !argv.includes("--no-verify");

const MARK = {
  ready: "✓",
  partial: "≈",
  ask: "?",
  degraded: "○",
  missing: "○",
  "opted-out": "—",
  unknown: "○",
  blocked: "✗",
  rejected: "✗",
  unreachable: "✗",
};

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s) => wrap("2", s);
const bold = (s) => wrap("1", s);
const green = (s) => wrap("32", s);
const yellow = (s) => wrap("33", s);
const red = (s) => wrap("31", s);

function tint(state, s) {
  if (state === "ready") return green(s);
  if (state === "blocked" || state === "rejected" || state === "unreachable") return red(s);
  if (state === "partial" || state === "ask") return yellow(s);
  return dim(s);
}

const SUMMARY = {
  ready: "ready",
  partial: "configured, but not completely",
  ask: "ask the agent",
  degraded: "not configured — this degrades, it does not fail",
  blocked: "MISSING — nothing can run without it",
  "opted-out": "opted out",
};

const capture = detectCapabilities();
const report = await resolveEnvironment(ROOT, { verify: VERIFY, capture });
const blocked = report.capabilities.some((c) => c.state === "blocked");

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(blocked ? 1 : 0);
}

console.log();
console.log(bold("  Walkthrough Studio · environment"));
console.log();

// ── Host ───────────────────────────────────────────────────────────────────
console.log(`  ${bold("Host")}        ${report.host.name} ${dim(`(${report.host.evidence})`)}`);
console.log(
  `  ${bold("Env file")}    ${
    report.envFilePresent ? ".env.local found" : dim("no .env.local — nothing is configured locally")
  }`,
);
console.log();
console.log(dim(`  ${report.principle.headline}`));
console.log();

// ── Capabilities ───────────────────────────────────────────────────────────
for (const cap of report.capabilities) {
  const mark = MARK[cap.state] ?? "○";
  console.log(`  ${tint(cap.state, `${mark} ${bold(cap.name)}`)}  ${dim(SUMMARY[cap.state] ?? cap.state)}`);
  console.log(dim(`      ${cap.for}`));

  for (const p of cap.providers) {
    const pm = MARK[p.state] ?? "○";
    const active = p.id === cap.activeProvider && cap.state !== "degraded" ? "  ← in use" : "";
    console.log(tint(p.state, `      ${pm} ${p.name}${active}`));
    if (p.detail) console.log(dim(`         ${p.detail}`));
    if (p.unverified) console.log(dim("         not verified — rerun without --no-verify"));
    for (const c of p.consequences ?? []) console.log(dim(`         ${c}`));
    if (p.install && p.state === "missing") console.log(dim(`         ${p.install}`));
  }

  if (cap.state === "degraded" || cap.state === "blocked" || cap.state === "ask") {
    console.log(dim(`      → ${cap.without}`));
  }
  console.log();
}

// ── Capture backends, in the capture layer's own words ─────────────────────
console.log(bold("  Capture backends, in detail"));
console.log(
  describeCapabilities(capture)
    .split("\n")
    .map((l) => dim(`      ${l}`))
    .join("\n"),
);
console.log();

// ── What to do about it ────────────────────────────────────────────────────
const gaps = report.capabilities.filter((c) => c.state === "degraded" || c.state === "blocked");
if (gaps.length === 0) {
  console.log(green("  Everything this machine needs is present."));
} else {
  console.log(bold("  To close a gap"));
  for (const cap of gaps) {
    const apiProvider = cap.providers.find((p) => p.kind === "api" && p.state === "missing");
    const localProvider = cap.providers.find((p) => p.kind === "local" && p.state === "missing");
    if (apiProvider) {
      console.log(
        `      ${cap.name}: set ${apiProvider.env.join(", ")} in .env.local ${dim("(see .env.example)")}`,
      );
    } else if (localProvider?.install) {
      console.log(`      ${cap.name}: ${localProvider.install}`);
    } else {
      console.log(`      ${cap.name}: ${cap.without}`);
    }
  }
}
console.log();
console.log(dim("  The same report, rendered: pnpm dev → /setup"));
console.log();

process.exit(blocked ? 1 : 0);
