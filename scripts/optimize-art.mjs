#!/usr/bin/env node
/**
 * optimize-art.mjs — shrink the generated creatives for the web.
 *
 * gpt-image-2 returns 24-bit RGB PNGs at full size: ~24 MB for the nine
 * plates. But every plate in this brand is monochrome stipple, so the colour
 * channels are three identical copies of the same data. Converting to 8-bit
 * grayscale and capping each plate at the width it actually renders at cuts
 * the set by roughly 90% with no visible change.
 *
 * Run after `generate-creatives.mjs`. Idempotent in the sense that re-running
 * on already-optimized files is a no-op in quality terms, but it will re-encode
 * — so it writes to a temp file and only swaps in a smaller result.
 *
 *   node scripts/optimize-art.mjs
 *   node scripts/optimize-art.mjs --dry-run
 */

import { execFileSync } from "node:child_process";
import { readdirSync, statSync, renameSync, rmSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ART = resolve(ROOT, "apps/hub/public/art");
const WALKTHROUGHS = resolve(ROOT, "apps/hub/public/walkthroughs");
const dryRun = process.argv.includes("--dry-run");

/**
 * Every directory holding generated plates.
 *
 * Not just `public/art`: since the generator grew a `dir` field, persona
 * portraits and scenes are written straight into the project that renders
 * them. Those are the largest plates in the set (a 1536×1024 scene is ~3.5 MB
 * raw), so missing them here left 22 MB unoptimized — which is exactly what
 * happened the first time this script ran after that change.
 *
 * Capture PNGs are deliberately NOT touched: they're evidence, and re-encoding
 * evidence would change the bytes the duplicate-detection hashes — a grayscale
 * pass over a screenshot destroys it outright.
 *
 * That matters more than it used to. Journey captures live at
 * `{slug}/personas/{journeyId}/*.png` — *inside* a directory this function
 * returns. The listing below is deliberately flat (`readdirSync`, no
 * recursion), so a subdirectory of captures is skipped. If you ever make the
 * walk recursive, you will start grayscaling real screenshots, and the only
 * symptom will be that the evidence looks wrong.
 */
function plateDirs() {
  const dirs = [ART];
  if (existsSync(WALKTHROUGHS)) {
    for (const slug of readdirSync(WALKTHROUGHS)) {
      const personas = join(WALKTHROUGHS, slug, "personas");
      if (existsSync(personas) && statSync(personas).isDirectory()) dirs.push(personas);
    }
  }
  return dirs.filter(existsSync);
}

/**
 * Max width per plate, chosen from where it renders:
 *   platform emblems — never wider than ~200px in the UI
 *   persona portrait — an 80px avatar, and a larger panel on the persona page
 *   everything else  — hero and OG art, up to ~700px at 2x
 */
/** Pixel dimensions, or null. */
function dimensions(file) {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const [w, h] = out.split("x").map(Number);
    return Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null;
  } catch {
    return null;
  }
}

function maxWidthFor(file, isPersonaDirFile = false, abs = null) {
  // BRANCH ON LOCATION FIRST, then on filename.
  //
  // Persona plate names come from persona ids, which are author-chosen, so they
  // share a namespace with the plate-family prefixes. A persona called
  // `platform-engineer` matched the `platform-` emblem rule and both its plates
  // were downscaled to 512px — a 1400px scene reduced to a thumbnail. The
  // directory is authoritative about what a file *is*; the filename is only a
  // hint, and it's a hint an author can accidentally break.
  if (isPersonaDirFile) {
    // BRANCH ON ORIENTATION, not on the filename.
    //
    // A persona directory holds three kinds of plate: a 2:3 portrait, a 3:2
    // scene-setter, and 3:2 moment shots. The first version of this tested
    // `file.endsWith("-scene.png")`, which silently sent every moment shot
    // down the portrait path and downscaled a full-bleed 1536px plate to
    // 800px — then the reader upscaled it back to 1180 and the stipple turned
    // to grey mush.
    //
    // No name-based rule can fix that, because persona ids are author-chosen
    // and contain hyphens (`fact-checker.png` is a portrait,
    // `fact-checker-moment-payoff.png` is not). Orientation is intrinsic to
    // the pixels and cannot be spoofed by a name: portrait plates are taller
    // than they are wide, every wide plate runs full-bleed.
    const dim = abs ? dimensions(abs) : null;
    const isPortrait = dim ? dim.h > dim.w : /^[^.]+\.png$/.test(file) && !file.includes("-moment-");
    return isPortrait ? 800 : 1400;
  }

  // Shared /art pool — these names are ours, so prefixes are safe here.
  if (file.startsWith("cat-")) return 320;       // 40px beside a heading
  if (file.startsWith("platform-")) return 512;  // 110–180px on a masthead
  if (file.startsWith("state-")) return 900;     // up to ~420px in a StatePlate

  // Everything left is a wide plate — hero, OG card, empty state. Do not let a
  // fallback shrink these: an earlier revision put a broad catch-all above the
  // prefix rules and quietly downscaled the app's headline image 1400 → 800.
  return 1400;
}


/**
 * Should this plate's paper ground be blown out to pure white?
 *
 * `mix-blend-multiply` only makes a ground *disappear* when that ground is
 * pure white — multiply preserves anything darker. The generated plates are
 * deliberately ink on WARM paper (measured: the ground sits at 230–245 of
 * 255), so dropped onto the page unprocessed every one of them showed as a
 * visible grey rectangle. That's what "illustrated" versus "has images in it"
 * actually comes down to.
 *
 * Only plates rendered *without* a mat need it. Plates that sit inside a
 * `.mat` well — the hero, the OG card, persona portraits and scenes — are
 * supposed to read as a framed print, and blowing out their highlights would
 * crush the tonal range that makes them look like photographs of prints.
 */
function needsAlphaMatte(file, inPersonaDir) {
  // Object studies get a real alpha channel. Photographic plates don't: a
  // bright window or a white shirt is *part of the picture*, and keying it out
  // would punch holes in the image.
  if (inPersonaDir) return false;                // portraits and scenes
  if (file === "hero-studio.png") return false;  // full interior scene
  if (file === "og-card.png") return false;      // never composited on-page
  return true;  // cat-*, platform-*, state-*, empty-*
}

function needsGroundNormalized(file, inPersonaDir) {
  if (inPersonaDir) return false;            // matted on the persona page
  if (file === "hero-studio.png") return false;  // matted in the library hero
  if (file === "og-card.png") return false;      // never on-page
  return true;                               // cat-*, platform-*, state-*, empty-*
}

/**
 * Find the plate's own ground value: the most common luminance in the image.
 *
 * Per-plate rather than a fixed threshold, because the ground varies by ~15
 * levels between plates and a single cut-off either leaves a grey box on some
 * or crushes the light stipple on others.
 */
function groundLevel(file) {
  try {
    const raw = execFileSync(
      "ffmpeg",
      ["-loglevel", "error", "-i", file, "-vf", "format=gray,scale=200:-1", "-f", "rawvideo", "-"],
      { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    );
    const counts = new Uint32Array(256);
    for (const byte of raw) counts[byte] += 1;
    // Search only the light end — the mode of the whole image could be the ink
    // on a plate that's mostly dark (the terminal emblem, for instance).
    let best = 255;
    let bestCount = 0;
    for (let v = 200; v < 256; v += 1) {
      if (counts[v] > bestCount) {
        bestCount = counts[v];
        best = v;
      }
    }
    // Back off a couple of levels so the ground and everything lighter clips.
    return Math.max(200, best - 3);
  } catch {
    return 0; // can't measure → don't touch it
  }
}

/**
 * Does this file already have an alpha channel?
 *
 * Load-bearing for idempotency. Running the matte twice is DESTRUCTIVE:
 * `format=gray` on an RGBA plate discards the alpha and reads the flat ink
 * RGB as luminance, so `255 - luma` comes out near-constant and the plate
 * becomes a solid ink rectangle. Skipping already-matted files is what makes
 * `pnpm creatives` safe to re-run.
 */
function hasAlpha(file) {
  try {
    const fmt = execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v", "-show_entries", "stream=pix_fmt", "-of", "csv=p=0", file],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return /a|ya/.test(fmt) && fmt !== "gray";
  } catch {
    return false;
  }
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}kB`;

/** `cat-auth.png`, or `sample-cli/personas/bookkeeper.png` for project plates. */
const label = (dir, file) =>
  dir === ART ? file : `${relative(WALKTHROUGHS, dir)}/${file}`;

let before = 0;
let after = 0;

const targets = [];
for (const dir of plateDirs()) {
  // FLAT ON PURPOSE — see plateDirs(). Subdirectories hold captures, not
  // plates, and captures must never be re-encoded.
  for (const file of readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".png"))
    .map((e) => e.name)
    .sort()) {
    targets.push({ dir, file });
  }
}

for (const { dir, file } of targets) {
  const src = join(dir, file);
  const srcSize = statSync(src).size;
  before += srcSize;

  if (needsAlphaMatte(file, dir !== ART) && hasAlpha(src)) {
    console.log(`· ${label(dir, file).padEnd(44)} ${kb(srcSize).padStart(8)}  (already matted)`);
    after += srcSize;
    continue;
  }

  const tmp = join(tmpdir(), `wsopt-${process.pid}-${relative(ROOT, dir).replace(/\W+/g, "_")}-${file}`);
  const width = maxWidthFor(file, dir !== ART, src);

  // `min(w,iw)` never upscales, so a plate already narrower keeps its size.
  // NOTE the double backslash: this is a JS source literal, so `\\,` becomes
  // the two characters `\,` in the string, which is how ffmpeg escapes a comma
  // *inside* a filter argument. A single backslash gets swallowed by JS and
  // ffmpeg then reads the comma as a filter separator — every invocation fails.
  const stages = [`scale=min(${width}\\,iw):-1:flags=lanczos`];
  let ground = 0;
  let matted = false;

  if (needsGroundNormalized(file, dir !== ART)) {
    ground = groundLevel(src);
    if (ground > 0) {
      // Clip the paper ground to pure white first, so the matte below has a
      // clean, uniform value to key out.
      const wp = (ground / 255).toFixed(4);
      stages.push(`colorlevels=rimax=${wp}:gimax=${wp}:bimax=${wp}`);
    }
  }

  stages.push("format=gray");

  if (needsAlphaMatte(file, dir !== ART)) {
    // Bake a real alpha channel: RGB becomes flat ink, alpha becomes the
    // inverted luminance.
    //
    // This replaces `mix-blend-multiply` in the UI, and the reason is a bug
    // that took two passes to find. `mix-blend-mode` blends against the
    // backdrop *within the nearest stacking context* — and the hub's content
    // wrapper sets `z-index: 1`, which creates one. Inside it there is no page
    // background to blend against, so every unmatted plate rendered as an
    // opaque white box. Plates that happened to sit inside a `.mat` (which has
    // its own background) worked, which is what made the bug look random.
    //
    // A transparent PNG has no such dependency: it composites correctly on
    // paper, on the ochre warning wash, anywhere, in any stacking context.
    //
    // Alpha is `255 - luma` with RGB pinned to ink rather than keeping the
    // grey. Keeping the grey and adding partial alpha double-lightens the
    // mid-tones and the art comes out washed out; flat ink at partial alpha
    // closely matches what multiply would have produced.
    stages.push("format=rgba", "geq=r=26:g=24:b=21:a='255-r(X,Y)'");
    matted = true;
  }

  try {
    execFileSync(
      "ffmpeg",
      [
        "-loglevel", "error",
        "-y",
        "-i", src,
        "-vf", stages.join(","),
        "-compression_level", "100",
        tmp,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (err) {
    console.log(`✗ ${file} — ffmpeg failed: ${String(err.message).slice(0, 120)}`);
    after += srcSize;
    continue;
  }

  const tmpSize = statSync(tmp).size;

  // An RGBA plate is legitimately bigger than the grayscale one it came from —
  // we're buying a correct alpha channel, not bytes. Only apply the
  // size-must-improve rule when the output format is unchanged.
  if (tmpSize >= srcSize && !matted) {
    // Already optimized, or the re-encode didn't help. Leave the original.
    console.log(`· ${label(dir, file).padEnd(44)} ${kb(srcSize).padStart(8)}  (kept)`);
    rmSync(tmp, { force: true });
    after += srcSize;
    continue;
  }

  const saved = (100 * (1 - tmpSize / srcSize)).toFixed(0);
  console.log(
    `✓ ${label(dir, file).padEnd(44)} ${kb(srcSize).padStart(8)} → ${kb(tmpSize).padStart(8)}` +
      `  −${saved}%${ground > 0 ? `  ground ${ground}→255` : ""}${matted ? " +alpha" : ""}`,
  );

  if (dryRun) {
    rmSync(tmp, { force: true });
    after += tmpSize;
  } else {
    renameSync(tmp, src);
    after += tmpSize;
  }
}

console.log(
  `\n${dryRun ? "would save" : "saved"}: ${kb(before)} → ${kb(after)} (−${(
    100 * (1 - after / before)
  ).toFixed(0)}%)`,
);
