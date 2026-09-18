#!/usr/bin/env node
/**
 * audit-art.mjs — prove every generated plate is actually on screen.
 *
 * This exists because of a real failure: the first pass of this brand generated
 * nine plates and wired up two. The four platform emblems sat in a data field
 * nothing read, and nobody would have noticed without being asked "where are
 * the visuals?".
 *
 * Generated art is expensive and slow, so an unused plate is pure waste — but
 * more importantly, a manifest that *claims* a render site it doesn't have is
 * the same class of dishonesty the hub's own health checks exist to catch. So
 * this audit is the equivalent check, one level up: it holds the brand to the
 * standard the product holds walkthroughs to.
 *
 * Three ways a plate can be wrong:
 *   ORPHANED — on disk, referenced nowhere in the UI
 *   MISSING  — referenced by the UI, not on disk
 *   UNCLAIMED — in the manifest with no `renders` site declared
 *
 *   node scripts/audit-art.mjs          # exits 1 if anything is wrong
 *   node scripts/audit-art.mjs --quiet  # only print problems
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ART = resolve(ROOT, "apps/hub/public/art");
const SRC = resolve(ROOT, "apps/hub/src");
const quiet = process.argv.includes("--quiet");

/** Every .ts/.tsx file under src, concatenated — our search corpus. */
function sourceText() {
  let out = "";
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry.name)) out += readFileSync(p, "utf8");
    }
  };
  walk(SRC);
  return out;
}

const source = sourceText();

/**
 * Is this plate reachable from the UI?
 *
 * Two mechanisms count, and both are real renders:
 *   1. the filename appears literally in source (`src="/art/hero-studio.png"`)
 *   2. the filename is produced by a template the UI builds — `categoryArt()`
 *      returns `/art/cat-${plate}.png`, so a `cat-*.png` counts if that helper
 *      lists its key. Checking only for literals would mark all fourteen
 *      category plates orphaned even though every one of them renders.
 */
function isReferenced(file) {
  if (source.includes(file)) return true;

  const catMatch = /^cat-(.+)\.png$/.exec(file);
  if (catMatch) {
    const artLib = resolve(SRC, "lib/category-art.ts");
    if (existsSync(artLib)) {
      const lib = readFileSync(artLib, "utf8");
      // The plate key must be a declared entry AND the template must exist.
      return (
        new RegExp(`^\\s*${catMatch[1]}:\\s*\\[`, "m").test(lib) &&
        lib.includes("/art/cat-")
      );
    }
  }

  // Platform emblems are referenced through `platformProfile().art`.
  if (/^platform-/.test(file)) {
    const platforms = resolve(SRC, "lib/platforms.ts");
    const usesArtField = /\bprofile\.art\b|\{profile\.art\}|src=\{profile\.art\}/.test(source);
    return existsSync(platforms) && readFileSync(platforms, "utf8").includes(file) && usesArtField;
  }

  return false;
}

// ── manifest ───────────────────────────────────────────────────────────────

const manifestSrc = readFileSync(resolve(ROOT, "scripts/generate-creatives.mjs"), "utf8");
const entries = [...manifestSrc.matchAll(/id:\s*"([^"]+)",\s*\n\s*renders:\s*"([^"]*)"/g)].map(
  (m) => ({ id: m[1], renders: m[2] }),
);
const declaredIds = new Set([...manifestSrc.matchAll(/^\s*id:\s*"([^"]+)"/gm)].map((m) => m[1]));
const unclaimed = [...declaredIds].filter((id) => !entries.some((e) => e.id === id));

// ── audit /art ─────────────────────────────────────────────────────────────

const plates = existsSync(ART)
  ? readdirSync(ART).filter((f) => f.endsWith(".png")).sort()
  : [];

const orphaned = [];
const used = [];
for (const file of plates) {
  (isReferenced(file) ? used : orphaned).push(file);
}

// ── audit persona plates (they live in project dirs, by convention) ────────

const WT = resolve(ROOT, "apps/hub/public/walkthroughs");
const personaPlates = [];
if (existsSync(WT)) {
  for (const slug of readdirSync(WT)) {
    const dir = join(WT, slug, "personas");
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".png"))) {
      personaPlates.push(`${slug}/personas/${f}`);
    }
  }
}

// Persona art is resolved by convention rather than by a literal path, so its
// render site is the resolver's existence. Name kept in one place because it
// has moved once already: the cut deleted `getPersonaArt()` and this check
// went on reporting a failure that nothing acted on.
const PERSONA_RESOLVER = "resolvePersonaArt";
const personaResolverExists = source.includes(PERSONA_RESOLVER);
const personaResolverMissing = personaPlates.length > 0 && !personaResolverExists;

// ── missing: referenced by source but absent from disk ─────────────────────

const missing = [...source.matchAll(/["'`](\/art\/[a-z0-9-]+\.png)["'`]/g)]
  .map((m) => m[1].replace("/art/", ""))
  .filter((f, i, a) => a.indexOf(f) === i)
  .filter((f) => !plates.includes(f));

// ── report ─────────────────────────────────────────────────────────────────

const problems =
  orphaned.length + missing.length + unclaimed.length + (personaResolverMissing ? 1 : 0);

if (!quiet) {
  console.log(`Walkthrough Studio · art audit\n`);
  console.log(`${plates.length} plates in public/art, ${personaPlates.length} persona plates\n`);
  for (const f of used) {
    const entry = entries.find((e) => f.startsWith(e.id) || e.id === f.replace(/\.png$/, ""));
    console.log(`  ✓ ${f.padEnd(32)} ${entry?.renders ?? "(rendered)"}`);
  }
  if (personaPlates.length > 0) {
    console.log(
      `\n  ✓ ${String(personaPlates.length).padStart(2)} persona plates` +
        `${personaResolverExists ? ` — resolved by ${PERSONA_RESOLVER}() convention` : " — NO RESOLVER"}`,
    );
  }
}

if (orphaned.length > 0) {
  console.log(`\n  ✗ ORPHANED — on disk, rendered nowhere:`);
  for (const f of orphaned) console.log(`      ${f}`);
  console.log(`    Either wire it into a surface, or delete it. Generated art`);
  console.log(`    that nobody sees is waste and it dilutes the set.`);
}

if (missing.length > 0) {
  console.log(`\n  ✗ MISSING — referenced by the UI, not on disk:`);
  for (const f of missing) console.log(`      ${f}`);
  console.log(`    Run: node scripts/generate-creatives.mjs`);
}

if (unclaimed.length > 0) {
  console.log(`\n  ✗ UNCLAIMED — in the manifest with no \`renders\` site:`);
  for (const id of unclaimed) console.log(`      ${id}`);
  console.log(`    Every manifest entry must name where it appears.`);
}

if (personaResolverMissing) {
  console.log(
    `\n  ✗ ${personaPlates.length} persona plate(s) on disk but no ${PERSONA_RESOLVER}() in the` +
      ` source — they render nowhere.`,
  );
  console.log(`    Either restore the resolver, or delete the plates.`);
}

console.log(
  problems === 0
    ? `\n✓ every plate has a render site`
    : `\n${problems} problem${problems === 1 ? "" : "s"}`,
);

process.exit(problems === 0 ? 0 : 1);
