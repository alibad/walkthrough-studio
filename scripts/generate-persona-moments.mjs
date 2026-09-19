#!/usr/bin/env node
/**
 * generate-persona-moments.mjs — the persona away from the screen.
 *
 * Three illustrations per journey, woven between the scenes: the persona
 * before they start, at the point of decision, and after the payoff.
 *
 * ── Why bother ─────────────────────────────────────────────────────────────
 *
 * A journey made only of captures reads as a UI inventory no matter how good
 * the narrative is, because every single frame is a rectangle of somebody
 * else's chrome. Three pictures of a person in a room is the difference
 * between a screenshot gallery and a story about an afternoon.
 *
 * ── The honesty problem, and how it's handled ──────────────────────────────
 *
 * These are invented. Nobody was photographed, no moment was observed. That
 * makes them categorically different from everything else this repo produces,
 * and the contract says so: `JourneyMoment` documents that `synthetic` is the
 * only honest value here, and the renderer prints "Illustration" on every one
 * unconditionally. If that label ever becomes optional, delete this script.
 *
 * ── Identity ───────────────────────────────────────────────────────────────
 *
 * Each moment is generated through `images/edits` with the persona's portrait
 * attached, so it is the same person across all three. Without that you get
 * three strangers and a reader who trusts none of them.
 *
 * Usage:
 *   node scripts/generate-persona-moments.mjs --project=wikipedia --persona=fact-checker
 *   node scripts/generate-persona-moments.mjs --project=wikipedia --persona=fact-checker --force
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chat, image, loadEnv, stripMarkdown } from "./lib/models.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
loadEnv(ROOT);

const argv = process.argv.slice(2);
const arg = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const PROJECT = arg("project");
const PERSONA = arg("persona");
const FORCE = argv.includes("--force");

if (!PROJECT || !PERSONA) {
  console.error("usage: node scripts/generate-persona-moments.mjs --project=<slug> --persona=<id> [--force]");
  process.exit(1);
}

const PROJECT_DIR = resolve(ROOT, "apps/hub/public/walkthroughs", PROJECT);
const ART_DIR = join(PROJECT_DIR, "personas");
const catalog = JSON.parse(readFileSync(join(PROJECT_DIR, "catalog.json"), "utf8"));
const persona = (catalog.personas ?? []).find((p) => p.id === PERSONA);
if (!persona) {
  console.error(`no persona "${PERSONA}" in ${PROJECT}`);
  process.exit(1);
}

const journeyFile = readdirSync(PROJECT_DIR).find(
  (n) => n.startsWith(`persona-${PERSONA}.`) && n.endsWith(".json"),
);
if (!journeyFile) {
  console.error(`no journey file for ${PERSONA} — walk the journey before illustrating it`);
  process.exit(1);
}
const journeyPath = join(PROJECT_DIR, journeyFile);
const journey = JSON.parse(readFileSync(journeyPath, "utf8"));

const portrait = join(ART_DIR, `${PERSONA}.png`);
if (!existsSync(portrait)) {
  console.error(
    `no portrait at personas/${PERSONA}.png — run generate-persona-art.mjs first, or the\n` +
      `three moments will be three different people`,
  );
  process.exit(1);
}

/**
 * Where the three moments land.
 *
 * Derived from scene count rather than fixed, so a five-scene journey and a
 * nine-scene journey both get their beats in the right places. `afterScene`
 * is a zero-based scene index, and the payoff moment deliberately lands after
 * the LAST scene so the story ends on the person rather than on a screenshot.
 */
function slots(sceneCount) {
  const at = (frac) => Math.max(0, Math.min(sceneCount - 1, Math.round(sceneCount * frac) - 1));
  return [
    { id: "setting-out", phase: "before they begin — the question that sent them here", afterScene: -1 },
    { id: "deciding", phase: "mid-journey, weighing what they have found so far", afterScene: at(0.6) },
    { id: "payoff", phase: "afterwards, with what they came for", afterScene: sceneCount - 1 },
  ];
}

const STYLE = `
Fine-grained pointillist stipple engraving, in the manner of a 19th-century printed plate.
STRICT MONOCHROME: warm off-white paper ground and near-black ink only. No colour, no tint, no sepia, no blue cast, no flat grey fills. Every tone is built from ink dots and fine hatching.
The paper ground is LIGHT and the ink is DARK — ink printed ON paper, never white-on-black, never a negative.
No border, no frame, no card, no drop shadow, no vignette, no background panel.
Absolutely no text: no letters, no numbers, no words, no captions, no labels, no logos, no signature. Any screen or page visible shows only abstract geometry — rules, blocks, bars — never anything that reads as writing.
Photo-real human proportions. Never cartoon, never caricature.
`.trim();

const SYSTEM =
  "You write terse, concrete art direction and dialogue for a documentary-style " +
  "illustrated case study. You never use marketing language, never use adjectives " +
  "like 'seamless' or 'powerful', and never describe a feeling the picture cannot show.";

async function sceneDescription(slot) {
  const out = await chat(
    `A persona for the product "${catalog.projectName}".

Persona: ${persona.name}, role "${persona.authRole ?? "user"}".
About them: ${stripMarkdown(persona.description).slice(0, 400)}
The journey they are on: ${stripMarkdown(journey.headline)}
Journey overview: ${stripMarkdown(journey.overview).slice(0, 400)}

Describe ONE photograph of this person ${slot.phase}. They are NOT at a computer in this shot — this is the moment around the work, not the work.

Give me 3 to 4 sentences of pure visual description: the room or place, the time of day, the light, what their body is doing, and one specific object in frame. Be concrete and ordinary. No feelings, no abstractions, no interface, no screens.

The object must be one that carries NO writing. Never name a titled book, a branded cup, a lanyard, a poster, a printed programme, a signboard or anything else whose identity is its text — the plate is rendered without letterforms, so a described title comes back either as invented words that claim something untrue about the product, or as convincing nonsense. Choose a thing with a shape instead: a folded jacket, a key, a paper cup, a stacked chair, a door handle, a cable.`,
    { system: SYSTEM, maxTokens: 1200, effort: "none" },
  );
  return stripMarkdown(out);
}

/**
 * The caption.
 *
 * First person, present tense, and capped hard. The predecessor to this script
 * asked for "at most 14 words" and routinely got 40–60 back, so the limit is
 * enforced here in code with a second call rather than trusted to the prompt.
 */
async function caption(slot) {
  const ask = `Persona: ${persona.name} — ${stripMarkdown(persona.description).slice(0, 250)}
Journey: ${stripMarkdown(journey.headline)}
Moment: ${slot.phase}

Write what ${persona.name} would say about this moment, in the FIRST PERSON, present tense.
One sentence. AT MOST 14 WORDS. No quotation marks. No product name. Plain, specific, unsentimental.`;

  let line = stripMarkdown(await chat(ask, { system: SYSTEM, maxTokens: 800, effort: "none" })).replace(/^["']|["']$/g, "");
  if (line.split(/\s+/).length > 14) {
    line = stripMarkdown(
      await chat(
        `Compress to AT MOST 14 words, same meaning, first person, present tense, no quotes:\n\n${line}`,
        { system: SYSTEM, maxTokens: 600, effort: "none" },
      ),
    ).replace(/^["']|["']$/g, "");
  }
  // Still over? Truncate rather than ship a caption that overruns its frame.
  const words = line.split(/\s+/);
  if (words.length > 16) line = words.slice(0, 16).join(" ").replace(/[,;:]$/, "") + "…";
  return line;
}

// ── run ────────────────────────────────────────────────────────────────────

console.log(`moments · ${PROJECT}/${PERSONA} · ${journey.scenes.length} scenes\n`);

const moments = [];
for (const slot of slots(journey.scenes.length)) {
  const file = `${PERSONA}-moment-${slot.id}.png`;
  const abs = join(ART_DIR, file);

  const existing = (journey.moments ?? []).find((m) => m.id === slot.id);
  if (existsSync(abs) && !FORCE && existing) {
    console.log(`· ${file} — exists, skipped`);
    moments.push({ ...existing, afterScene: slot.afterScene });
    continue;
  }

  process.stdout.write(`▸ ${slot.id} … `);
  const [description, line] = await Promise.all([sceneDescription(slot), caption(slot)]);
  const bytes = await image({
    prompt: `${STYLE}

A WIDE environmental plate of the SAME PERSON as in the attached reference image.
Keep their face, age, build, hair and manner of dress exactly as the reference. This must read as one more plate of the same individual.

${description}

FINAL CONSTRAINT, overriding anything above: this plate contains NO LETTERFORMS ANYWHERE.
No title on a book, no word on a cup, no sign, no poster, no badge, no screen text, no signature.
If the description names an object that would normally carry writing, draw the object with its surface blank.
A plate with invented words on it is worse than a plate with nothing on it: the words read as a claim about a real product, and they are not one.`,
    size: "1536x1024",
    reference: portrait,
  });
  writeFileSync(abs, bytes);
  console.log(`${(bytes.length / 1024).toFixed(0)}kb · "${line}"`);

  moments.push({
    id: slot.id,
    image: `personas/${file}`,
    caption: line,
    afterScene: slot.afterScene,
  });
}

journey.moments = moments;
writeFileSync(journeyPath, JSON.stringify(journey, null, 2) + "\n");
console.log(`\n✓ ${moments.length} moments → ${journeyFile}`);
console.log(`  next: node scripts/optimize-art.mjs`);
