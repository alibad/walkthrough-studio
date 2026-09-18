/**
 * Looking at the picture.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * The first version of this capture layer verified device pixel ratio,
 * animation state, clock, context isolation and byte-distinctness — and shipped
 * a persona journey whose three "scenes" were a dark rectangle with the words
 * "Presenter Stu" clipped mid-word and 90% empty space. Every invariant passed.
 * Two of those captures were near-identical; they cleared the MD5 guard because
 * a one-pixel line differed between them.
 *
 * The lesson is blunt: **every check was about how the capture was taken, and
 * none was about what it contains.** A loading spinner is Retina, animation-free,
 * deterministic, isolated and byte-unique. It is also worthless.
 *
 * So this module decodes the PNG and asks the only questions that matter to a
 * reader:
 *
 *   Is there anything on this screen?        → `measureContent`
 *   Did anything actually change?            → `diffFraction`
 *
 * No image dependency: PNG is simple enough to decode in 60 lines, and adding
 * a native image library to a capture pipeline is a portability cost this
 * project should not pay.
 */

import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

/** Decode an 8-bit PNG (colour type 2 = RGB, 6 = RGBA) to raw pixels. */
export function decodePng(file) {
  const buf = readFileSync(file);
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`${file} is not a PNG`);
  }

  let i = 8;
  let width = 0, height = 0, bitDepth = 0, colourType = 0;
  const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString("ascii");
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colourType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    i += 12 + len;
  }

  if (bitDepth !== 8 || (colourType !== 2 && colourType !== 6)) {
    // Every backend in this project writes 8-bit RGB/RGBA. Rather than grow a
    // half-correct decoder, say so plainly and let the caller skip the check.
    throw new Error(`unsupported PNG (bitDepth ${bitDepth}, colourType ${colourType}) — content checks skipped`);
  }

  const channels = colourType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  // Undo the per-scanline filters. This is the whole of PNG's compression
  // cleverness and it is five cases long.
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;   // left
      const b = prev ? prev[x] : 0;                       // up
      const c = prev && x >= channels ? prev[x - channels] : 0; // up-left
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error(`bad PNG filter ${filter} on row ${y}`);
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}

/**
 * Is there anything on this screen, and is it spread across the screen?
 *
 * ── Why the obvious metric does not work ──────────────────────────────────
 *
 * The first attempt measured "what share of the frame is one flat colour".
 * It rejected the clipped hero (0.986) — and also rejected a perfectly good
 * gallery screenshot (0.971) and the admin dashboard (0.962), because a clean
 * light-theme UI *is* mostly one flat colour. Whitespace is not emptiness.
 *
 * What actually separates them is **where** the content is. A blank or
 * half-painted screen puts its few marks in one band and leaves the rest
 * untouched. A real interface puts marks all over: a header here, a table
 * there, a footer at the bottom.
 *
 * So the frame is divided into a grid and each cell is asked whether anything
 * is drawn in it, using local contrast (edges) rather than distance from a
 * background colour — edges are theme-agnostic, so a dark deck and a light
 * dashboard are judged the same way.
 *
 *   occupiedCells   share of grid cells containing drawn content. This is the
 *                   number that matters.
 *   edgeDensity     share of sampled pixels sitting on an edge.
 *   uniqueColours   distinct quantised colours, as a secondary signal.
 */
export function measureContent(file, { sampleStep = 4, grid = 8 } = {}) {
  const { width, height, channels, pixels } = decodePng(file);
  const cellW = Math.max(1, Math.floor(width / grid));
  const cellH = Math.max(1, Math.floor(height / grid));
  const cellEdges = new Array(grid * grid).fill(0);
  const cellSamples = new Array(grid * grid).fill(0);
  const colours = new Set();
  let edges = 0, sampled = 0;

  const lum = (o) => (pixels[o] * 299 + pixels[o + 1] * 587 + pixels[o + 2] * 114) / 1000;

  for (let y = sampleStep; y < height - sampleStep; y += sampleStep) {
    const cy = Math.min(grid - 1, Math.floor(y / cellH));
    for (let x = sampleStep; x < width - sampleStep; x += sampleStep) {
      const o = y * width * channels + x * channels;
      // Local contrast against the neighbour to the right and below. Text,
      // borders, icons and images all generate this; flat fill does not.
      const here = lum(o);
      const right = lum(o + channels * sampleStep);
      const below = lum(o + width * channels * sampleStep);
      const isEdge = Math.abs(here - right) > 12 || Math.abs(here - below) > 12;

      const cx = Math.min(grid - 1, Math.floor(x / cellW));
      const cell = cy * grid + cx;
      cellSamples[cell]++;
      if (isEdge) { cellEdges[cell]++; edges++; }
      colours.add(((pixels[o] >> 4) << 8) | ((pixels[o + 1] >> 4) << 4) | (pixels[o + 2] >> 4));
      sampled++;
    }
  }

  // A cell counts as occupied once a small share of it carries edges. The bar
  // is low on purpose: a single line of text in an otherwise empty cell is
  // still content a reader can use.
  let occupied = 0;
  for (let i = 0; i < cellEdges.length; i++) {
    if (cellSamples[i] > 0 && cellEdges[i] / cellSamples[i] > 0.004) occupied++;
  }

  return {
    width,
    height,
    occupiedCells: occupied / (grid * grid),
    edgeDensity: sampled ? edges / sampled : 0,
    uniqueColours: colours.size,
  };
}

/**
 * Did the part of the screen that carries content change?
 *
 * ── Why the frame-fraction number was not enough ──────────────────────────
 *
 * Measuring "what share of the whole frame differs" under-reports badly on a
 * large viewport with a small content region. Filtering the openstage gallery
 * from four rows to one is an obvious, load-bearing change — and it moves
 * 1.6% of a 1440x900 frame, because the rest of that frame is whitespace. The
 * first version of this check rejected three legitimate steps on that basis.
 *
 * So change is measured against the area that has content in it, not against
 * the glass. A grid cell counts as changed when a real share of it differs;
 * the result is expressed as a fraction of the cells that carry content in
 * either capture.
 *
 * Returns both numbers so a caller can accept either signal: a small change
 * everywhere (a theme switch) and a large change in one place (a filtered
 * table) are both real progress, and they look nothing like each other.
 */
export function diffCells(fileA, fileB, { sampleStep = 4, grid = 8 } = {}) {
  const a = decodePng(fileA);
  const b = decodePng(fileB);
  if (a.width !== b.width || a.height !== b.height) {
    return { frameFraction: 1, contentFraction: 1, changedCells: grid * grid, contentCells: grid * grid };
  }

  const cellW = Math.max(1, Math.floor(a.width / grid));
  const cellH = Math.max(1, Math.floor(a.height / grid));
  const diffPerCell = new Array(grid * grid).fill(0);
  const samplesPerCell = new Array(grid * grid).fill(0);
  const inkPerCell = new Array(grid * grid).fill(0);
  let differing = 0, sampled = 0;

  const lum = (p, o) => (p[o] * 299 + p[o + 1] * 587 + p[o + 2] * 114) / 1000;

  for (let y = sampleStep; y < a.height - sampleStep; y += sampleStep) {
    const cy = Math.min(grid - 1, Math.floor(y / cellH));
    for (let x = sampleStep; x < a.width - sampleStep; x += sampleStep) {
      const oa = y * a.width * a.channels + x * a.channels;
      const ob = y * b.width * b.channels + x * b.channels;
      const cell = cy * grid + Math.min(grid - 1, Math.floor(x / cellW));
      samplesPerCell[cell]++;
      sampled++;

      const d =
        Math.abs(a.pixels[oa] - b.pixels[ob]) +
        Math.abs(a.pixels[oa + 1] - b.pixels[ob + 1]) +
        Math.abs(a.pixels[oa + 2] - b.pixels[ob + 2]);
      if (d > 24) { diffPerCell[cell]++; differing++; }

      // A cell has content if either capture draws an edge in it.
      const ea = Math.abs(lum(a.pixels, oa) - lum(a.pixels, oa + a.channels * sampleStep)) > 12;
      const eb = Math.abs(lum(b.pixels, ob) - lum(b.pixels, ob + b.channels * sampleStep)) > 12;
      if (ea || eb) inkPerCell[cell]++;
    }
  }

  let changedCells = 0, contentCells = 0;
  for (let i = 0; i < diffPerCell.length; i++) {
    if (samplesPerCell[i] === 0) continue;
    const hasContent = inkPerCell[i] / samplesPerCell[i] > 0.004;
    if (hasContent) contentCells++;
    if (diffPerCell[i] / samplesPerCell[i] > 0.02) changedCells++;
  }

  return {
    frameFraction: sampled ? differing / sampled : 0,
    contentFraction: contentCells ? changedCells / contentCells : 0,
    changedCells,
    contentCells,
  };
}

/**
 * What fraction of the frame differs between two captures?
 *
 * Byte-inequality says "these files are not identical", which a single
 * anti-aliased pixel satisfies. This says "a reader would see a different
 * screen", which is the claim a walkthrough step actually makes.
 */
export function diffFraction(fileA, fileB, { sampleStep = 8 } = {}) {
  const a = decodePng(fileA);
  const b = decodePng(fileB);
  if (a.width !== b.width || a.height !== b.height) return 1;

  let differing = 0, sampled = 0;
  for (let y = 0; y < a.height; y += sampleStep) {
    for (let x = 0; x < a.width; x += sampleStep) {
      const oa = y * a.width * a.channels + x * a.channels;
      const ob = y * b.width * b.channels + x * b.channels;
      const d =
        Math.abs(a.pixels[oa] - b.pixels[ob]) +
        Math.abs(a.pixels[oa + 1] - b.pixels[ob + 1]) +
        Math.abs(a.pixels[oa + 2] - b.pixels[ob + 2]);
      if (d > 24) differing++;
      sampled++;
    }
  }
  return differing / sampled;
}

/**
 * Thresholds, with the reasoning attached so they can be argued with.
 *
 * These are deliberately permissive. A legitimately sparse screen exists — a
 * confirmation page, an empty state, a splash — and the check is meant to catch
 * "nothing rendered", not "this design is minimal". Every number here was set
 * against the captures that prompted this module: the clipped "Presenter Stu"
 * frame measures dominantFraction 0.97 / inkCoverage 0.02, and a healthy
 * gallery capture measures roughly 0.62 / 0.30.
 */
export const CONTENT_THRESHOLDS = {
  /**
   * Share of the frame's grid cells that must contain drawn content.
   *
   * Calibrated against real captures rather than guessed:
   *   clipped "Presenter Stu" hero      0.20  ← the failure this exists for
   *   near-duplicate scroll of the same 0.20
   *   gallery, mobile                   0.55
   *   admin dashboard, desktop          0.66
   *   gallery, desktop                  0.72
   *   flagship deck hero, desktop       1.00
   *
   * 0.35 sits in the gap with room on both sides. A genuinely sparse screen —
   * a confirmation page, an empty state — can fall below it, which is why the
   * walk can mark a step `sparse: true` to record that it looked and meant it.
   */
  minOccupiedCells: 0.35,
  /** Secondary signal; a spinner on a flat ground scores very low. */
  minEdgeDensity: 0.004,
  /**
   * A step is a new state if EITHER is true:
   *   - it changed this share of the whole frame (a broad change), or
   *   - it changed this share of the cells that carry content (a local one).
   * Both are needed. A theme switch moves the whole frame a little; a filtered
   * table moves one region a lot. Requiring only the first rejected three real
   * openstage steps at 1.6% of a mostly-empty desktop frame.
   */
  minProgressFraction: 0.02,
  minProgressContentFraction: 0.18,
};
