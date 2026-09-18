#!/usr/bin/env node
/**
 * generate-persona-art.mjs — portraits and scene-setters for a project's personas.
 *
 * Two plates per persona, and they are not interchangeable:
 *
 *   {id}.png        2:3  head-and-shoulders. The avatar, everywhere.
 *   {id}-scene.png  3:2  the persona in their physical setting, mid-action.
 *
 * The scene is the one that earns its cost. A journey is a column of captured
 * software; the scene-setter is the only image in it that shows the person the
 * software is for, and it is what turns a list of screenshots into a story
 * about somebody's afternoon.
 *
 * ── Why the scene is generated FROM the portrait ───────────────────────────
 *
 * These began as two independent text-to-image calls and produced two
 * different people — one face on the persona card, a different face in the
 * masthead of that same persona's page. Nobody reviewing it believed either.
 *
 * So the scene goes through `images/edits` with the portrait attached as a
 * visual reference. Order matters: the portrait must exist before the scene is
 * requested, which is why this script does them strictly in sequence per
 * persona rather than firing everything off in parallel.
 *
 * ── Honesty ────────────────────────────────────────────────────────────────
 *
 * Both plates are invented. Nobody sat for them. That is defensible for a
 * *persona*, which is itself a composite and not a claim about a real user —
 * but it is only defensible while the UI says so, which is why every render
 * site for these files prints "illustration". See `components/journey/moment.tsx`.
 *
 * Requires in .env.local: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT,
 * AZURE_OPENAI_IMAGE_DEPLOYMENT (and optionally AZURE_OPENAI_IMAGE_API_VERSION).
 *
 * Usage:
 *   node scripts/generate-persona-art.mjs --project=wikipedia
 *   node scripts/generate-persona-art.mjs --project=wikipedia --persona=fact-checker
 *   node scripts/generate-persona-art.mjs --project=wikipedia --force
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { azure, image, loadEnv, stripMarkdown } from "./lib/models.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
loadEnv(ROOT);

const argv = process.argv.slice(2);
const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const PROJECT = arg("project");
const ONLY = arg("persona");
const FORCE = argv.includes("--force");

if (!PROJECT) {
  console.error(
    "usage: node scripts/generate-persona-art.mjs --project=<slug> [--persona=<id>] [--force]",
  );
  process.exit(1);
}

const PROJECT_DIR = resolve(ROOT, "apps/hub/public/walkthroughs", PROJECT);
const ART_DIR = join(PROJECT_DIR, "personas");
const catalogPath = join(PROJECT_DIR, "catalog.json");
if (!existsSync(catalogPath)) {
  console.error(`no catalog at ${catalogPath}`);
  process.exit(1);
}
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

/**
 * The shared visual signature.
 *
 * Deliberately the same idiom as `generate-creatives.mjs` — ink on warm paper,
 * never white-on-black. The old hub's portraits were stipple on PURE BLACK,
 * which looked striking on a dark UI and like a hole punched in the page on a
 * light one. A persona card and a platform emblem have to be able to sit in
 * the same grid.
 */
const STYLE = `
Fine-grained pointillist stipple engraving, in the manner of a 19th-century printed portrait plate or a newspaper hedcut.
STRICT MONOCHROME: warm off-white paper ground and near-black ink only. No colour, no tint, no sepia wash, no blue cast, no flat grey fills. Every tone is built from ink dots and fine hatching — dense dots for shadow, sparse dots for light, bare paper for highlights.
The paper ground is LIGHT and the ink is DARK. This is ink printed ON paper. Never white-on-black, never a negative, never a black background.
No border, no frame, no rounded-rectangle card, no drop shadow, no vignette, no background panel. The subject sits on bare paper and the edges dissolve softly into it.
Absolutely no text of any kind: no letters, no numbers, no words, no captions, no labels, no logos, no watermark, no signature. Any screen, page or printed matter in the image shows only abstract geometry — horizontal rules, solid blocks, thin bars — never anything that reads as writing.
Photo-real human proportions and a dignified, particular face. Never cartoon, never caricature, never a stock-photo expression, never stereotyped.
`.trim();

function portraitPrompt(persona) {
  return `${STYLE}

A stippled head-and-shoulders portrait of ONE person, tightly cropped, shoulders dissolving into bare paper.
Directional light from one side: the near cheek and brow catch bare-paper highlights, the far side falls into dense stipple shadow.
The subject looks just past the viewer with a composed, alert, unperformed expression — someone caught thinking, not posing for a camera.

Subject: a working person in the role "${persona.authRole ?? "user"}" of the product "${catalog.projectName}".
Persona name: "${persona.name}".
Context: ${stripMarkdown(persona.description).slice(0, 480)}

Render one specific, believable individual plausible for this role and this context. Give them an age, a build and a way of dressing that follow from the description rather than a default. Respectful and particular, never generic.`;
}

function scenePrompt(persona, journey) {
  const arc = journey
    ? `Journey: ${stripMarkdown(journey.headline).slice(0, 200)}
Overview: ${stripMarkdown(journey.overview).slice(0, 500)}`
    : "";
  return `${STYLE}

A WIDE environmental plate: the SAME PERSON as in the attached reference image, in their real physical setting, mid-action.
Keep the face, age, build, hair and manner of dress of the reference exactly. This must read as one more plate of the same individual, not a similar person.
Three-quarter environmental medium shot. The setting is half the picture: architecture, furniture, weather, time of day and props all read clearly. Directional natural light with strong contrast — sparse dots in the highlights, near-solid ink in the shadows.
Their posture, hands and gaze all reinforce what they are doing. If a screen or a page is visible it shows abstract geometry only.

Subject: ${persona.name}, in the role "${persona.authRole ?? "user"}" of "${catalog.projectName}".
Persona: ${stripMarkdown(persona.description).slice(0, 480)}
${arc}

Place them in the SPECIFIC physical room or place implied by that journey — a library carrel, a shared kitchen table at night, a cramped office, a train — and mid-action with whatever object they would actually be holding. Place-specific, never generic stock.`;
}

// ── run ────────────────────────────────────────────────────────────────────

const personas = (catalog.personas ?? []).filter((p) => !ONLY || p.id === ONLY);
if (personas.length === 0) {
  console.error(ONLY ? `no persona "${ONLY}" in ${PROJECT}` : `no personas in ${PROJECT}`);
  process.exit(1);
}

mkdirSync(ART_DIR, { recursive: true });
console.log(`persona art · ${PROJECT} · deployment ${azure().image}\n`);

let made = 0;
let skipped = 0;

for (const persona of personas) {
  const portraitPath = join(ART_DIR, `${persona.id}.png`);
  const scenePath = join(ART_DIR, `${persona.id}-scene.png`);

  // Portrait first — the scene needs it as a reference.
  if (existsSync(portraitPath) && !FORCE) {
    console.log(`· ${persona.id}.png — exists, skipped`);
    skipped += 1;
  } else {
    process.stdout.write(`▸ ${persona.id}.png … `);
    const t = Date.now();
    const bytes = await image({ prompt: portraitPrompt(persona), size: "1024x1536" });
    writeFileSync(portraitPath, bytes);
    console.log(`${(bytes.length / 1024).toFixed(0)}kb in ${((Date.now() - t) / 1000).toFixed(0)}s`);
    made += 1;
  }

  if (existsSync(scenePath) && !FORCE) {
    console.log(`· ${persona.id}-scene.png — exists, skipped`);
    skipped += 1;
    continue;
  }
  // Find the persona's journey so the scene matches the story told on the page.
  const journeyFile = readdirSync(PROJECT_DIR).find(
    (n) => n.startsWith(`persona-${persona.id}.`) && n.endsWith(".json"),
  );
  const journey = journeyFile
    ? JSON.parse(readFileSync(join(PROJECT_DIR, journeyFile), "utf8"))
    : null;

  process.stdout.write(`▸ ${persona.id}-scene.png … `);
  const t = Date.now();
  const bytes = await image({
    prompt: scenePrompt(persona, journey),
    size: "1536x1024",
    reference: portraitPath,
  });
  writeFileSync(scenePath, bytes);
  console.log(`${(bytes.length / 1024).toFixed(0)}kb in ${((Date.now() - t) / 1000).toFixed(0)}s`);
  made += 1;
}

console.log(`\n✓ ${made} generated, ${skipped} skipped → ${ART_DIR}`);
console.log(`  next: node scripts/optimize-art.mjs`);
