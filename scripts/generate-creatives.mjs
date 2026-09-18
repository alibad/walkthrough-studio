#!/usr/bin/env node
/**
 * generate-creatives.mjs — Walkthrough Studio brand illustration generator.
 *
 * Renders the repo's illustrative creatives with Azure OpenAI `gpt-image-2`.
 * UI chrome (logo, favicon, icons) is hand-authored SVG and deliberately NOT
 * generated here — a raster model can't give you a crisp 16px mark, and the
 * mark has to be recolourable from CSS tokens. This script owns the things a
 * model is genuinely better at: plates, emblems, empty states, persona art.
 *
 * Every creative shares one STYLE preamble so the whole set reads as a single
 * printed field guide: ink-on-warm-paper stipple engraving, no colour, no text.
 * The "no legible text" clause matters — image models love to sprinkle garbled
 * lettering into anything that looks like a screen, which instantly cheapens
 * the plate. Screens are rendered as abstract geometry instead.
 *
 * Usage:
 *   node scripts/generate-creatives.mjs                # all missing creatives
 *   node scripts/generate-creatives.mjs --only=hero    # one, by id prefix
 *   node scripts/generate-creatives.mjs --force        # re-render everything
 *   node scripts/generate-creatives.mjs --list         # print the manifest
 *
 * Requires in .env.local: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT,
 * AZURE_OPENAI_IMAGE_DEPLOYMENT (and optionally AZURE_OPENAI_IMAGE_API_VERSION).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT_DIR = resolve(ROOT, "apps/hub/public/art");

// ─── env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const path = resolve(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [k, ...rest] = trimmed.split("=");
    if (!process.env[k]) process.env[k] = rest.join("=").trim();
  }
}
loadEnv();

const ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
const API_KEY = process.env.AZURE_OPENAI_API_KEY;
const DEPLOYMENT = process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT;
const API_VERSION = process.env.AZURE_OPENAI_IMAGE_API_VERSION || "2025-04-01-preview";

// ─── the shared house style ───────────────────────────────────────────────
// Changing this changes the entire brand. Keep the three hard constraints
// (monochrome / paper ground / no text) — they're what make the set cohere.
const STYLE = `
Fine-grained pointillist stipple engraving, in the manner of a 19th-century printed field-guide plate.
STRICT MONOCHROME: warm off-white paper ground and near-black ink only. No colour, no tint, no sepia wash, no blue cast, no gradient fills. Every tone is built from ink dots and fine hatching — dense dots for shadow, sparse dots for light, bare paper for highlights.
The paper ground is light; the ink is dark. This is ink printed ON paper, never white-on-black, never a negative.
Composition sits on bare paper with soft open margins — full bleed, no border, no frame, no rounded-rectangle card, no drop shadow, no vignette, no background panel.
Absolutely no text of any kind: no letters, no numbers, no words, no captions, no labels, no logos, no watermark, no signature. Any screen, page or display in the image shows only abstract interface geometry — horizontal rules, solid blocks, thin bars, small squares — never anything that reads as writing.
Precise, calm, technical, and hand-made. Photo-real proportions, never cartoon, never caricature.
`.trim();

/**
 * Every entry MUST name the surface that renders it. A plate with no render
 * site is waste — the first pass of this brand generated nine plates and wired
 * up two, which is the mistake `renders` exists to prevent. If you can't name
 * where it appears, don't generate it.
 *
 * `reference` makes the plate IDENTITY-CONSISTENT with another plate. Persona
 * portraits and scenes were originally two independent text-to-image calls, and
 * the result was two different people — a reader looking at a persona page saw
 * one face in the avatar and a different face in the masthead. Pointing a
 * scene at its portrait routes the call through the `images/edits` endpoint
 * with the portrait as a visual reference, so the same person appears in both.
 *
 * @type {{id:string,file:string,size:string,renders:string,dir?:string,reference?:string,subject:string}[]}
 */
const MANIFEST = [
  {
    id: "hero-studio",
    renders: "library hero (/)",
    file: "hero-studio.png",
    size: "1536x1024",
    subject: `A wide plate of a quiet documentation studio interior, mid-morning.
One person stands three-quarters to the viewer at a tall drafting table, caught mid-gesture, attention on a tidy grid of small rectangular printed plates pinned to the wall in front of them — a contact sheet of captured application screens, twelve rectangles in a calm four-by-three arrangement, each filled with abstract interface geometry.
On the table: a laptop opened flat, a phone lying face-up beside it, a jeweller's loupe, a short stack of printed sheets, a pencil.
A tall window at the left rakes daylight across the room and across the wall of plates; the far corner falls away into dense stippled shadow.
The wall grid is the focal point and must read as the subject of the person's attention. The mood is careful, unhurried documentation work.`,
  },
  {
    id: "platform-web",
    renders: "project masthead + library platform strip",
    file: "platform-web.png",
    size: "1024x1024",
    subject: `A single browser window, drawn in slight three-quarter perspective, resting alone on bare paper with generous margin.
A rounded outer frame, a row of three small circles at the top left of its chrome, and one long horizontal rule standing in for an address field.
Inside the window: abstract interface geometry only — a full-width header band, a left column of six short rules, and a three-by-two grid of plain blocks.
Nothing inside reads as writing. The object is the whole subject; no desk, no room, no hands.`,
  },
  {
    id: "platform-mobile",
    renders: "project masthead + library platform strip",
    file: "platform-mobile.png",
    size: "1024x1024",
    subject: `A single modern smartphone standing upright, drawn in slight three-quarter perspective, resting alone on bare paper with generous margin.
Thin uniform bezel, a small pill-shaped cutout at the top of the display, a soft highlight along one edge of the glass.
On the screen: abstract interface geometry only — a narrow status band, a tall stack of five rounded list rows, and a bottom tab bar of four small squares.
Nothing on the screen reads as writing. The device is the whole subject; no hand holding it, no desk, no room.`,
  },
  {
    id: "platform-desktop",
    renders: "project masthead + library platform strip",
    file: "platform-desktop.png",
    size: "1024x1024",
    subject: `A single desktop computer — an all-in-one monitor on a slim cantilevered stand — drawn in slight three-quarter perspective, resting alone on bare paper with generous margin. A low separate keyboard sits in front of it.
On the display: an application window inset within the screen, containing abstract interface geometry only — a title band, a left sidebar of short rules, and a two-column arrangement of plain blocks.
Nothing on the display reads as writing. The objects are the whole subject; no desk surface, no room, no person.`,
  },
  {
    id: "platform-cli",
    renders: "project masthead + library platform strip",
    file: "platform-cli.png",
    size: "1024x1024",
    subject: `A single terminal window, drawn straight on, resting alone on bare paper with generous margin.
A plain rectangular frame with a slim title bar above it. The terminal's interior is filled solid with dense black ink, so it reads as the one dark mass on an otherwise light plate.
Inside that dark field, in bare paper-white: eight rows of short broken dashes of varying length standing in for lines of output, and one small solid rectangle at the start of the last row standing in for a cursor.
Nothing inside reads as writing — the dashes must stay clearly abstract. The object is the whole subject.`,
  },
  {
    id: "empty-nothing-captured",
    renders: "empty library, 404",
    file: "empty-nothing-captured.png",
    size: "1536x1024",
    subject: `A wide, deliberately sparse plate: a bare studio pin-board occupying the centre of the composition, almost entirely empty.
Twelve small brass push-pins are set in a neat four-by-three grid on the board, but only one pin holds anything — a single blank rectangular plate, its face bare paper, hanging slightly askew.
The eleven empty pins cast small stippled shadows on the board. A great deal of quiet negative space around the board.
The feeling is "nothing has been captured here yet" — expectant and orderly, not desolate or sad.`,
  },
  {
    id: "og-card",
    renders: "OpenGraph / social card",
    file: "og-card.png",
    size: "1536x1024",
    subject: `A wide still-life plate. Eight rectangular printed plates of abstract interface geometry lie fanned and overlapping across the lower right two-thirds of the composition, like a spread hand of cards laid on a table.
A jeweller's loupe rests on top of the topmost plate, its lens catching a small bright highlight.
The upper-left third of the image is deliberately left as near-empty bare paper — clean, uninterrupted, with only the faintest stipple — so a caption can be set over it later.
Raking light from the upper left. The plates' edges cast crisp short shadows.`,
  },
  {
    id: "demo-persona-portrait",
    renders: "walkthrough-studio persona card + persona page",
    dir: "apps/hub/public/walkthroughs/walkthrough-studio/personas",
    file: "documentation-lead.png",
    size: "1024x1536",
    subject: `A head-and-shoulders portrait of one person: a product manager in her late thirties, shown from the chest up, turned slightly three-quarters but looking directly at the viewer with a warm, composed, intelligent expression.
Collared shirt under a soft unstructured jacket, rendered with faint dotwork patterning in the fabric.
Directional light from the upper left: one side of the face carries sparse delicate stipple, the other side falls into denser dotwork shadow. The shoulders dissolve softly into bare paper at the bottom of the frame — no hard cutoff, no oval frame, no border.
Sharp focus on the eyes. Dignified and photo-real, never caricatured, never stock-photo bland.`,
  },
  {
    id: "demo-persona-scene",
    renders: "walkthrough-studio persona page masthead",
    dir: "apps/hub/public/walkthroughs/walkthrough-studio/personas",
    file: "documentation-lead-scene.png",
    reference: "documentation-lead.png",
    size: "1536x1024",
    subject: `A wide environmental plate. The same product manager — late thirties, collared shirt under a soft jacket — stands three-quarters to the viewer at a standing desk in a bright open-plan office, mid-action, one hand raised toward a large monitor as she steps through an application screen by screen.
On the desk: a laptop, a phone propped on a small stand, a notebook open with a pen laid across it.
On the wall beside the monitor, a small printed grid of captured screens is taped up. Every screen and page shows abstract interface geometry only.
Tall windows behind her throw raking daylight across the desk; the depths of the room fall into dense stipple.
The setting is half the picture — the space must read as a real working office, not a blank studio.`,
  },
  {
    id: "cat-browsing",
    renders: "feature-grid category heading (browsing)",
    file: "cat-browsing.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
A wooden card-index drawer pulled half open, a dozen filing cards fanned upright inside it, one card standing slightly proud of the rest.`,
  },
  {
    id: "cat-reading",
    renders: "feature-grid category heading (reading)",
    file: "cat-reading.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
An open bound book lying flat, its pages carrying abstract blocks and rules rather than words, a narrow silk ribbon marker trailing from the gutter.`,
  },
  {
    id: "cat-capture",
    renders: "feature-grid category heading (capture)",
    file: "cat-capture.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
A folding bellows field camera on a short tripod, lens forward, the bellows leather rendered in dense dotwork.`,
  },
  {
    id: "cat-settings",
    renders: "feature-grid category heading (settings)",
    file: "cat-settings.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
A small brass instrument plate bearing three knurled control dials of different sizes and a single toggle lever.`,
  },
  {
    id: "cat-auth",
    renders: "feature-grid category heading (auth)",
    file: "cat-auth.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
An ornate iron key lying diagonally across a shield-shaped brass escutcheon lock plate.`,
  },
  {
    id: "cat-sync",
    renders: "feature-grid category heading (sync)",
    file: "cat-sync.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
Two interlocking brass cogwheels of unequal size linked by a narrow drive belt, mounted on a short spindle.`,
  },
  {
    id: "cat-reporting",
    renders: "feature-grid category heading (reporting)",
    file: "cat-reporting.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
A single ledger page held slightly curled, ruled into columns, with a plotted line rising across it and small square markers at its vertices.`,
  },
  {
    id: "cat-import",
    renders: "feature-grid category heading (import)",
    file: "cat-import.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
A shallow wire document tray with three sheets sliding into it at an angle, the topmost still in motion.`,
  },
  {
    id: "cat-search",
    renders: "feature-grid category heading (search)",
    file: "cat-search.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
A jeweller's loupe standing on its rim on an open index page, the lens magnifying a small patch of ruled lines beneath it.`,
  },
  {
    id: "cat-messaging",
    renders: "feature-grid category heading (messaging)",
    file: "cat-messaging.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
A sealed letter with an unbroken wax seal, resting against a brass pneumatic-tube canister lying on its side.`,
  },
  {
    id: "cat-deploy",
    renders: "feature-grid category heading (deploy)",
    file: "cat-deploy.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
A small cast-iron hand printing press, its lever raised, a single sheet lying on the bed.`,
  },
  {
    id: "cat-inspect",
    renders: "feature-grid category heading (inspect)",
    file: "cat-inspect.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
A pair of brass vernier calipers opened part way, lying across a round dial gauge.`,
  },
  {
    id: "cat-onboarding",
    renders: "feature-grid category heading (onboarding)",
    file: "cat-onboarding.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
A pair of tall panelled doors standing slightly ajar, light falling through the gap onto the ground in front of them.`,
  },
  {
    id: "cat-media",
    renders: "feature-grid category heading (media)",
    file: "cat-media.png",
    size: "1024x1024",
    subject: `A single small object study, centred on bare paper with very generous margin all round — the object occupies roughly the middle half of the plate and nothing else is present. No desk, no room, no hands, no shadow cast onto a surface.
A film reel lying flat with a short length of exposed strip unspooling from it, beside a small brass gramophone horn.`,
  },
  {
    id: "state-never-walked",
    renders: "project page — never-walked drift card",
    file: "state-never-walked.png",
    size: "1536x1024",
    subject: `A deliberately still, expectant plate: a neat stack of six blank printing plates, still wrapped in a single sheet of translucent tissue paper and tied crosswise with fine string. The knot is untouched. The stack sits alone on bare paper with a great deal of quiet negative space around it.
The topmost plate's face is visible through the tissue and is entirely blank. The feeling is 'not yet opened' — orderly and waiting, never desolate.`,
  },
  {
    id: "state-blocked",
    renders: "feature page — a surface marked blocked",
    file: "state-blocked.png",
    size: "1536x1024",
    subject: `A single rectangular printed plate lying flat, its face carrying abstract interface geometry — but a heavy solid ink bar runs diagonally across the whole plate from corner to corner, unmistakably cancelling it. A small closed brass padlock rests on the plate where the bar crosses its centre.
The bar is a clean, confident, opaque stroke, not a scribble. Bare paper all around.`,
  },
  {
    id: "state-not-captured",
    renders: "feature page — nothing captured yet",
    file: "state-not-captured.png",
    size: "1536x1024",
    subject: `A bare studio pin-board occupying the centre of the plate, holding a single empty brass push-pin and nothing else. Below the board, leaning against the wall at an angle on the floor, sits one blank rectangular plate — present, unpinned, not yet put up.
Quiet, orderly, and clearly unfinished rather than abandoned. Generous negative space.`,
  },
  {
    id: "state-synthetic",
    renders: "synthetic-catalog banner",
    file: "state-synthetic.png",
    size: "1536x1024",
    subject: `A draughtsman's measured line drawing of a smartphone — NOT a rendered object. Pure thin outline construction: crisp contour lines, faint extension and dimension lines running out past the edges of the device with small arrowheads, centre lines, and corner radius construction arcs. Almost no tone and almost no stippling; this must read as a technical plan rather than a picture of a thing.
A wooden set square and a sharpened pencil lie beside it. The contrast with a fully stippled, fully tonal object study is the entire point of the plate.`,
  },
  {
    id: "persona-field-surveyor-portrait",
    renders: "sample-ios-app persona card + persona page",
    dir: "apps/hub/public/walkthroughs/sample-ios-app/personas",
    file: "field-surveyor.png",
    size: "1024x1536",
    subject: `A head-and-shoulders portrait of one person, shown from the chest up, turned slightly three-quarters but looking directly at the viewer with a composed, intelligent, unperformed expression.
Directional light from the upper left: one side of the face carries sparse delicate stipple, the other falls into denser dotwork shadow. The shoulders dissolve softly into bare paper at the bottom of the frame — no hard cutoff, no oval frame, no border.
Sharp focus on the eyes. Dignified and photo-real, never caricatured, never stock-photo bland.
Subject: a woman in her early forties, weathered and practical, short hair pushed back, a quilted field jacket over a collared work shirt, a lanyard at her neck. She looks like she has been outdoors all morning.`,
  },
  {
    id: "persona-field-surveyor-scene",
    renders: "sample-ios-app persona page masthead",
    dir: "apps/hub/public/walkthroughs/sample-ios-app/personas",
    file: "field-surveyor-scene.png",
    reference: "field-surveyor.png",
    size: "1536x1024",
    subject: `A wide environmental plate showing THE EXACT SAME PERSON as the reference image — same face, same age, same hair, same skin tone, same build. Their identity must match the reference precisely; this is the same individual in a different moment, not a similar-looking person.
One person, three-quarters to the viewer, mid-action in their real working setting. The setting is half the picture — architecture, light, props and time of day all read clearly. Directional natural light with strong contrast; the depths of the space fall into dense stipple.
Their hands, posture and gaze all reinforce what they are doing. Any screen or page in shot shows abstract interface geometry only.
Subject: the same woman standing beside the open tailgate of a pickup truck on a rural verge, holding a phone in one hand and steadying a clipboard against the truck bed with the other, photographing a concrete culvert in a ditch below. Overcast flat daylight, wet grass, a fence line and low hills receding behind her.`,
  },
  {
    id: "persona-bookkeeper-portrait",
    renders: "sample-desktop-app persona card + persona page",
    dir: "apps/hub/public/walkthroughs/sample-desktop-app/personas",
    file: "bookkeeper.png",
    size: "1024x1536",
    subject: `A head-and-shoulders portrait of one person, shown from the chest up, turned slightly three-quarters but looking directly at the viewer with a composed, intelligent, unperformed expression.
Directional light from the upper left: one side of the face carries sparse delicate stipple, the other falls into denser dotwork shadow. The shoulders dissolve softly into bare paper at the bottom of the frame — no hard cutoff, no oval frame, no border.
Sharp focus on the eyes. Dignified and photo-real, never caricatured, never stock-photo bland.
Subject: a Black woman in her fifties, reading glasses pushed up into her hair, a fine-knit cardigan over a blouse, an air of unhurried precision.`,
  },
  {
    id: "persona-bookkeeper-scene",
    renders: "sample-desktop-app persona page masthead",
    dir: "apps/hub/public/walkthroughs/sample-desktop-app/personas",
    file: "bookkeeper-scene.png",
    reference: "bookkeeper.png",
    size: "1536x1024",
    subject: `A wide environmental plate showing THE EXACT SAME PERSON as the reference image — same face, same age, same hair, same skin tone, same build. Their identity must match the reference precisely; this is the same individual in a different moment, not a similar-looking person.
One person, three-quarters to the viewer, mid-action in their real working setting. The setting is half the picture — architecture, light, props and time of day all read clearly. Directional natural light with strong contrast; the depths of the space fall into dense stipple.
Their hands, posture and gaze all reinforce what they are doing. Any screen or page in shot shows abstract interface geometry only.
Subject: the same woman at a tidy home-office desk late in the day, one hand on a mouse and the other holding a bank statement up to compare against a large monitor showing a reconciliation table. An anglepoise lamp throws hard light across the desk; a wall of shelved box files behind her falls into dense shadow.`,
  },
  {
    id: "persona-platform-engineer-portrait",
    renders: "sample-cli persona card + persona page",
    dir: "apps/hub/public/walkthroughs/sample-cli/personas",
    file: "platform-engineer.png",
    size: "1024x1536",
    subject: `A head-and-shoulders portrait of one person, shown from the chest up, turned slightly three-quarters but looking directly at the viewer with a composed, intelligent, unperformed expression.
Directional light from the upper left: one side of the face carries sparse delicate stipple, the other falls into denser dotwork shadow. The shoulders dissolve softly into bare paper at the bottom of the frame — no hard cutoff, no oval frame, no border.
Sharp focus on the eyes. Dignified and photo-real, never caricatured, never stock-photo bland.
Subject: a man in his early thirties, close-cropped hair, wire-framed glasses, a plain crew-neck sweater, headphones resting around his neck rather than on his ears.`,
  },
  {
    id: "persona-platform-engineer-scene",
    renders: "sample-cli persona page masthead",
    dir: "apps/hub/public/walkthroughs/sample-cli/personas",
    file: "platform-engineer-scene.png",
    reference: "platform-engineer.png",
    size: "1536x1024",
    subject: `A wide environmental plate showing THE EXACT SAME PERSON as the reference image — same face, same age, same hair, same skin tone, same build. Their identity must match the reference precisely; this is the same individual in a different moment, not a similar-looking person.
One person, three-quarters to the viewer, mid-action in their real working setting. The setting is half the picture — architecture, light, props and time of day all read clearly. Directional natural light with strong contrast; the depths of the space fall into dense stipple.
Their hands, posture and gaze all reinforce what they are doing. Any screen or page in shot shows abstract interface geometry only.
Subject: the same man at a standing desk in a dim open-plan office at night, leaning in toward two stacked monitors whose screens are the brightest thing in the plate, one hand resting on a mechanical keyboard mid-keystroke. The room behind him is almost entirely dense stipple; the screen glow is the only light source and rakes across his face and forearms.`,
  },
];

// ─── generation ───────────────────────────────────────────────────────────
function buildPrompt(entry) {
  return `${STYLE}\n\nSUBJECT OF THIS PLATE:\n${entry.subject}`;
}

async function generate(entry) {
  const outDirForRef = entry.dir ? resolve(ROOT, entry.dir) : OUT_DIR;

  // With a reference, go through `images/edits` (multipart) so the model can
  // see the plate it must stay consistent with. Without one, plain generation.
  let res;
  if (entry.reference) {
    const refPath = resolve(outDirForRef, entry.reference);
    if (!existsSync(refPath)) {
      throw new Error(
        `reference ${entry.reference} not found — generate it before this entry ` +
          `(manifest order matters for referenced plates)`,
      );
    }
    const form = new FormData();
    form.append("size", entry.size);
    form.append("quality", "high");
    form.append("prompt", buildPrompt(entry));
    form.append(
      "image[]",
      new Blob([readFileSync(refPath)], { type: "image/png" }),
      entry.reference,
    );
    res = await fetch(
      `${ENDPOINT}/openai/deployments/${DEPLOYMENT}/images/edits?api-version=${API_VERSION}`,
      { method: "POST", headers: { "api-key": API_KEY }, body: form },
    );
  } else {
    res = await fetch(
      `${ENDPOINT}/openai/deployments/${DEPLOYMENT}/images/generations?api-version=${API_VERSION}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": API_KEY },
        body: JSON.stringify({
          prompt: buildPrompt(entry),
          // No `model` field: on Azure the deployment in the URL selects the
          // model, and naming a different one in the body is rejected. Point
          // AZURE_OPENAI_IMAGE_DEPLOYMENT at the deployment you want.
          size: entry.size,
          n: 1,
          quality: "high",
          output_format: "png",
        }),
      },
    );
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 400)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`no b64_json in response: ${JSON.stringify(json).slice(0, 300)}`);

  const outDir = entry.dir ? resolve(ROOT, entry.dir) : OUT_DIR;
  mkdirSync(outDir, { recursive: true });
  const target = resolve(outDir, entry.file);
  writeFileSync(target, Buffer.from(b64, "base64"));
  return target;
}

// ─── cli ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.split("=")[1] : null;

if (args.includes("--list")) {
  for (const e of MANIFEST) {
    console.log(`${e.id.padEnd(28)} ${e.size.padEnd(10)} ${e.renders}`);
  }
  process.exit(0);
}

for (const key of ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_IMAGE_DEPLOYMENT"]) {
  if (!process.env[key]) {
    console.error(`✗ Missing ${key}. Populate it in .env.local — the model won't auto-provision.`);
    process.exit(1);
  }
}

const queue = MANIFEST.filter((e) => (only ? e.id.startsWith(only) : true));
let made = 0;
let skipped = 0;
let failed = 0;

console.log(`Walkthrough Studio · creatives → ${OUT_DIR}`);
console.log(`deployment=${DEPLOYMENT}  api-version=${API_VERSION}  queued=${queue.length}\n`);

for (const entry of queue) {
  const target = resolve(entry.dir ? resolve(ROOT, entry.dir) : OUT_DIR, entry.file);
  if (existsSync(target) && !force) {
    console.log(`· skip   ${entry.id} (exists)`);
    skipped += 1;
    continue;
  }
  const started = Date.now();
  process.stdout.write(`… render ${entry.id} (${entry.size}) `);
  try {
    await generate(entry);
    const secs = ((Date.now() - started) / 1000).toFixed(0);
    console.log(`✓ ${secs}s`);
    made += 1;
  } catch (err) {
    console.log(`✗\n         ${err.message}`);
    failed += 1;
  }
}

console.log(`\ndone · ${made} rendered, ${skipped} skipped, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
