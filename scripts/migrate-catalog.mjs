#!/usr/bin/env node
/**
 * migrate-catalog.mjs — upgrade catalog files on disk to the current schema.
 *
 * The hub already upgrades old catalogs when it reads them, so nothing is
 * *broken* before you run this. What this fixes is the committed artifact: a
 * file that says `route` is a file the next agent will copy, and the drift
 * starts again. Run it when you want the bytes in git to be canonical.
 *
 *   node scripts/migrate-catalog.mjs                      # this repo, dry run
 *   node scripts/migrate-catalog.mjs --write              # this repo, apply
 *   node scripts/migrate-catalog.mjs --path ~/Code/GitHub/openstage/public/walkthroughs --write
 *
 * Dry run by default, and it prints what each change is, because a silent
 * rewrite of an evidence artifact is exactly the move this project exists to
 * avoid.
 *
 * ── What it does NOT do ───────────────────────────────────────────────────
 *
 * It does not invent data. A v1 catalog has no `platform`, so it gets `web` —
 * which is a fact about that generation, not a guess, because v1 could not
 * express anything else. It does not touch captures, walkthrough files or run
 * manifests.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const pathArgIdx = argv.indexOf("--path");
const SEARCH_ROOT =
  pathArgIdx >= 0 && argv[pathArgIdx + 1]
    ? resolve(argv[pathArgIdx + 1].replace(/^~/, process.env.HOME ?? "~"))
    : join(ROOT, "apps/hub/public/walkthroughs");

const CATALOG_SCHEMA_VERSION = 2;

// A standalone copy of the upgrade, so this script runs without building the
// hub. The hub's TypeScript version in apps/hub/src/lib/catalog-schema.ts is
// the reference; if you change one, change both — they are tested against the
// same fixtures by `node scripts/migrate-catalog.mjs` on the sample project.
function detectSchemaVersion(cat) {
  if (!cat || typeof cat !== "object") return CATALOG_SCHEMA_VERSION;
  if (typeof cat.schemaVersion === "number") return cat.schemaVersion;
  const features = cat.features ?? [];
  const looksLegacy = features.some(
    (f) => f.route !== undefined || f.desktopStatus !== undefined || f.mobileStatus !== undefined,
  );
  if (looksLegacy || cat.baseUrl !== undefined) return 1;
  return CATALOG_SCHEMA_VERSION;
}

function upgradeFeature(f) {
  const surfaceStatus =
    f.surfaceStatus && Object.keys(f.surfaceStatus).length > 0
      ? f.surfaceStatus
      : {
          ...(f.desktopStatus ? { desktop: f.desktopStatus } : {}),
          ...(f.mobileStatus ? { mobile: f.mobileStatus } : {}),
        };
  const out = {
    featureId: f.featureId,
    featureName: f.featureName,
    location: f.location ?? f.route ?? "",
    category: f.category ?? "general",
    requiresAuth: f.requiresAuth ?? false,
    ...(f.authRole ? { authRole: f.authRole } : {}),
    surfaceStatus,
    ...(f.videoStatus ? { videoStatus: f.videoStatus } : {}),
    ...(f.issueCount !== undefined ? { issueCount: f.issueCount } : {}),
    ...(f.lastWalkthroughAt !== undefined ? { lastWalkthroughAt: f.lastWalkthroughAt } : {}),
    ...(f.lastCodeChangeAt !== undefined ? { lastCodeChangeAt: f.lastCodeChangeAt } : {}),
    ...(f.synthetic !== undefined ? { synthetic: f.synthetic } : {}),
    ...(f.syntheticReason ? { syntheticReason: f.syntheticReason } : {}),
    ...(f.testIds ? { testIds: f.testIds } : {}),
    ...((f.notes ?? f.description) ? { notes: f.notes ?? f.description } : {}),
  };
  return out;
}

function upgradePersona(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    ...(p.authRole ? { authRole: p.authRole } : {}),
    ...(p.entryPoint ? { entryPoint: p.entryPoint } : {}),
    ...(p.keyJourneys ? { keyJourneys: p.keyJourneys } : {}),
    ...(p.navItems
      ? { navItems: p.navItems.map((n) => ({ label: n.label, location: n.location ?? n.route ?? "" })) }
      : {}),
    ...(p.portrait ? { portrait: p.portrait } : {}),
    ...(p.scene ? { scene: p.scene } : {}),
  };
}

function upgrade(cat) {
  const notes = [];
  const from = detectSchemaVersion(cat);

  const routeRenames = (cat.features ?? []).filter((f) => f.route !== undefined && f.location === undefined).length;
  const statusRenames = (cat.features ?? []).filter(
    (f) => (f.desktopStatus !== undefined || f.mobileStatus !== undefined) && !f.surfaceStatus,
  ).length;
  const navRenames = (cat.personas ?? []).filter((p) => (p.navItems ?? []).some((n) => n.route !== undefined)).length;

  if (routeRenames) notes.push(`${routeRenames} feature route → location`);
  if (statusRenames) notes.push(`${statusRenames} feature desktopStatus/mobileStatus → surfaceStatus`);
  if (navRenames) notes.push(`${navRenames} persona navItems[].route → location`);
  if (cat.baseUrl && !cat.capturedAgainst) notes.push("baseUrl → capturedAgainst");
  if (cat.schemaVersion !== CATALOG_SCHEMA_VERSION) notes.push(`schemaVersion stamped ${CATALOG_SCHEMA_VERSION}`);

  const out = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    projectName: cat.projectName ?? "Untitled project",
    platform: cat.platform ?? "web",
    ...(cat.driver ? { driver: cat.driver } : {}),
    ...(cat.capturedAgainst ?? cat.baseUrl ? { capturedAgainst: cat.capturedAgainst ?? cat.baseUrl } : {}),
    ...(cat.surfaces ? { surfaces: cat.surfaces } : {}),
    ...(cat.brand ? { brand: cat.brand } : {}),
    discoveredAt: cat.discoveredAt ?? new Date(0).toISOString(),
    updatedAt: cat.updatedAt ?? cat.discoveredAt ?? new Date(0).toISOString(),
    features: (cat.features ?? []).map(upgradeFeature),
    ...(cat.personas ? { personas: cat.personas.map(upgradePersona) } : {}),
    ...(cat.synthetic !== undefined ? { synthetic: cat.synthetic } : {}),
    ...(cat.syntheticNote ? { syntheticNote: cat.syntheticNote } : {}),
    ...(cat.attribution ? { attribution: cat.attribution } : {}),
    ...(cat.githubRepo ? { githubRepo: cat.githubRepo } : {}),
  };
  return { out, from, notes };
}

function findCatalogs(root) {
  if (!existsSync(root)) return [];
  const found = [];
  const walk = (dir, depth = 0) => {
    if (depth > 3) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, depth + 1);
      else if (entry.name === "catalog.json") found.push(abs);
    }
  };
  if (statSync(root).isFile()) return [root];
  walk(root);
  return found;
}

const files = findCatalogs(SEARCH_ROOT);
if (!files.length) {
  console.log(`No catalog.json under ${SEARCH_ROOT}`);
  process.exit(0);
}

console.log(`${WRITE ? "Migrating" : "Checking"} ${files.length} catalog(s) under ${SEARCH_ROOT}\n`);
let changedCount = 0;

for (const file of files) {
  let cat;
  try {
    cat = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.log(`  ✗ ${file}\n      unreadable: ${err.message}`);
    continue;
  }
  const { out, from, notes } = upgrade(cat);
  const before = JSON.stringify(cat);
  const after = JSON.stringify(out);
  const rel = file.replace(SEARCH_ROOT + "/", "");

  if (before === after) {
    console.log(`  · ${rel} — already v${CATALOG_SCHEMA_VERSION}, unchanged`);
    continue;
  }
  changedCount += 1;
  console.log(`  ${WRITE ? "✓" : "→"} ${rel}  (v${from} → v${CATALOG_SCHEMA_VERSION})`);
  for (const n of notes) console.log(`      ${n}`);
  if (!notes.length) console.log(`      field order and defaults normalised`);
  if (WRITE) writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
}

console.log(
  `\n${changedCount} file(s) ${WRITE ? "migrated" : "would change"}.` +
    (WRITE ? "" : "  Re-run with --write to apply."),
);
