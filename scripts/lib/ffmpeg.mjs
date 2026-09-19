/**
 * Find an ffmpeg that can do the job — not merely one that exists.
 *
 * ── Why this is a module and not a string ─────────────────────────────────
 *
 * "ffmpeg is on PATH" turns out to say almost nothing. Homebrew's `ffmpeg`
 * formula ships **without text rendering**: no libfreetype, no libharfbuzz, no
 * libass, and therefore no `drawtext` and no `subtitles`. Version 8 and
 * version 9 both. The story renderer burns its caption into the frame on
 * purpose — so the video stays legible with the sound off — so on that build
 * it dies with `No such filter: 'drawtext'`, several minutes in, after paying
 * for speech synthesis.
 *
 * The capable build is `ffmpeg-full`, which is **keg-only**: Homebrew installs
 * it but deliberately does not put it on PATH, so `which ffmpeg` keeps
 * answering with the one that cannot do this. Telling somebody to edit their
 * shell profile to fix a capture tool is the wrong trade — the tool should
 * find the right binary itself.
 *
 * So: ask each candidate what filters it has, and use the first one that can
 * actually render. The answer is cached for the process because shelling out
 * to list filters costs ~40ms and the renderer calls this per clip.
 *
 * Override with `FFMPEG=/path/to/ffmpeg` when you know better.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

/** Searched in order. The keg-only paths are where Homebrew hides the good one. */
const CANDIDATES = [
  "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
  "/usr/local/opt/ffmpeg-full/bin/ffmpeg",
  "ffmpeg",
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "/usr/bin/ffmpeg",
];

function filtersOf(bin) {
  try {
    return execFileSync(bin, ["-hide_banner", "-filters"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    });
  } catch {
    return null;
  }
}

function hasAll(listing, filters) {
  return filters.every((f) => new RegExp(`\\b${f}\\b`).test(listing));
}

const cache = new Map();

/**
 * @param {string[]} required filter names the caller cannot work without
 * @returns {{ bin: string, path: string, filters: string[] } | null}
 */
export function findFfmpeg(required = []) {
  const key = required.join(",");
  if (cache.has(key)) return cache.get(key);

  const explicit = process.env.FFMPEG;
  const list = explicit ? [explicit, ...CANDIDATES] : CANDIDATES;

  let firstWorking = null;
  for (const bin of list) {
    if (bin.includes("/") && !existsSync(bin)) continue;
    const listing = filtersOf(bin);
    if (!listing) continue;
    if (!firstWorking) firstWorking = bin;
    if (hasAll(listing, required)) {
      const found = { bin, path: bin, filters: required };
      cache.set(key, found);
      return found;
    }
  }

  // Nothing had everything. Report the shortfall against a real binary rather
  // than pretending ffmpeg is absent — "install ffmpeg" is unhelpful advice to
  // somebody who already has three of them.
  const result = firstWorking ? { bin: firstWorking, path: firstWorking, filters: [], incomplete: true } : null;
  cache.set(key, result);
  return result;
}

/** The binary to shell out to, or a thrown error naming the exact remedy. */
export function ffmpegBin(required = []) {
  const found = findFfmpeg(required);
  if (found && !found.incomplete) return found.bin;
  if (!found) {
    throw new Error("no ffmpeg found — install one (brew install ffmpeg-full)");
  }
  throw new Error(
    `the ffmpeg at ${found.bin} was built without ${required.join(", ")}. ` +
      `Homebrew's default formula omits text rendering; install the full build ` +
      `with \`brew install ffmpeg-full\` (it is keg-only, and this tool finds it ` +
      `on its own), or set FFMPEG=/path/to/a/capable/ffmpeg.`,
  );
}

/** ffprobe beside whichever ffmpeg was chosen, falling back to PATH. */
export function ffprobeBin(required = []) {
  const found = findFfmpeg(required);
  if (found?.bin?.includes("/")) {
    const probe = found.bin.replace(/ffmpeg$/, "ffprobe");
    if (existsSync(probe)) return probe;
  }
  return "ffprobe";
}
