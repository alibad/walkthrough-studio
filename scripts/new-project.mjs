#!/usr/bin/env node
/**
 * new-project.mjs — add an app to the registry.
 *
 * Writes a platform-appropriate entry into `apps/hub/projects.json` and creates
 * the storage directory. It deliberately does *not* invent values it can't
 * know: a bundle id, a base URL or an executable path left as a placeholder is
 * better than a plausible guess, because a guess gets walked and produces
 * captures of the wrong app.
 *
 *   node scripts/new-project.mjs --slug=acme-web --name="Acme" --platform=web \
 *     --url=http://localhost:5173 --codebase=~/code/acme
 *
 *   node scripts/new-project.mjs --slug=acme-ios --name="Acme for iOS" \
 *     --platform=ios --bundle-id=com.acme.app --device="iPhone 17 Pro"
 *
 * Flags:
 *   --slug          required, kebab-case. Becomes the URL and the storage dir.
 *   --name          required, human name.
 *   --platform      required: web | ios | android | desktop | cli
 *   --description   one-liner for the card
 *   --codebase      local checkout path — REQUIRED for drift detection to work
 *   --github        owner/repo
 *   --url           web: base URL
 *   --bundle-id     ios/android: bundle or package id
 *   --device        ios/android: simulator or emulator
 *   --executable    desktop: path to the app
 *   --binary        cli: the command
 *   --auth          auth type (default: none)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = resolve(ROOT, "apps/hub/projects.json");

const args = new Map(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, ...v] = a.slice(2).split("=");
      return [k, v.join("=") || "true"];
    }),
);

const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const slug = args.get("slug");
const name = args.get("name");
const platform = args.get("platform");

if (!slug || !name || !platform) die("--slug, --name and --platform are all required.");
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  die(`--slug must be kebab-case (got "${slug}"). It becomes a URL and a directory name.`);
}
const PLATFORMS = ["web", "ios", "android", "desktop", "cli"];
if (!PLATFORMS.includes(platform)) die(`--platform must be one of: ${PLATFORMS.join(", ")}`);

// ── build the target, per platform ──────────────────────────────────────────
// Placeholders are wrapped in <angle brackets> so they're obviously unfilled.
// A walk against "<base url>" fails immediately; a walk against a guessed
// localhost port silently documents whatever else is on that port.

const target = { platform };

switch (platform) {
  case "web":
    target.driver = "playwright";
    target.local = args.get("url") ?? "<base url, e.g. http://localhost:3000>";
    break;
  case "ios":
    target.driver = "ios-simulator";
    target.bundleId = args.get("bundle-id") ?? "<bundle id, e.g. com.acme.app>";
    target.device = args.get("device") ?? "iPhone 17 Pro";
    target.appPath = "<path to the built .app for the simulator>";
    break;
  case "android":
    target.driver = "android-emulator";
    target.bundleId = args.get("bundle-id") ?? "<package id, e.g. com.acme.app>";
    target.device = args.get("device") ?? "<avd name, e.g. Pixel_9_API_36>";
    target.appPath = "<path to the debug .apk>";
    break;
  case "desktop":
    target.driver = "electron";
    target.executable = args.get("executable") ?? "<path to the app bundle or executable>";
    break;
  case "cli":
    target.driver = "terminal";
    target.binary = args.get("binary") ?? "<the command, e.g. ./bin/acme>";
    break;
}

const entry = {
  slug,
  name,
  description: args.get("description") ?? `${name} — not yet described.`,
  target,
  codebase: {
    // Without this, staleness is permanently `unknown` and the hub can't tell
    // anyone whether the docs still match the app. It's the single most
    // valuable field in the entry.
    local: args.get("codebase") ?? "<local checkout path — required for drift detection>",
    ...(args.get("github") ? { github: args.get("github") } : {}),
  },
  auth: { type: args.get("auth") ?? "none" },
};

// ── write it ───────────────────────────────────────────────────────────────

if (!existsSync(REGISTRY)) die(`registry not found at ${REGISTRY}`);
const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));

if (registry.projects.some((p) => p.slug === slug)) {
  die(`"${slug}" is already registered. Edit apps/hub/projects.json directly.`);
}

registry.projects.push(entry);
writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + "\n");

const storage = resolve(ROOT, "apps/hub/public/walkthroughs", slug);
mkdirSync(storage, { recursive: true });

// ── report, and be specific about what still needs filling in ──────────────

const placeholders = JSON.stringify(entry).match(/<[^>]+>/g) ?? [];

console.log(`✓ registered "${name}" as ${slug} (${platform})`);
console.log(`  storage: apps/hub/public/walkthroughs/${slug}/`);

if (placeholders.length > 0) {
  console.log(`\n${placeholders.length} value${placeholders.length === 1 ? "" : "s"} still to fill in, in apps/hub/projects.json:`);
  for (const p of placeholders) console.log(`  · ${p}`);
}

if (entry.auth.type === "none") {
  console.log(
    `\nIf the app has an auth gate, set auth.type and add roles with $ENV_VAR\nplaceholders — never literal passwords. See references/auth.md.`,
  );
}

console.log(`\nThen walk it:\n  /walkthrough --project=${slug}`);
