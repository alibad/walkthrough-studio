#!/usr/bin/env node
/**
 * tts-sample.mjs — hear every candidate narration voice in one file.
 *
 * Choosing a TTS voice is a listening decision, and it is the one decision in
 * this pipeline that cannot be made from a spec sheet or a benchmark table.
 * This renders the same line in each candidate, each announced by name in its
 * own voice, concatenated into a single MP3 — so it is one file to play rather
 * than nine to open.
 *
 * Usage:
 *   node scripts/tts-sample.mjs
 *   node scripts/tts-sample.mjs --engine=say
 *   node scripts/tts-sample.mjs --line="Your own sentence here."
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KOKORO_VOICES, defaultEngine, synthesizeAll } from "./lib/tts.mjs";
import { loadEnv } from "./lib/models.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
loadEnv(ROOT);

const argv = process.argv.slice(2);
const arg = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const ENGINE = arg("engine") || defaultEngine();
const LINE =
  arg("line") ||
  "Tom opens the revision history, tracing each change until the article's argument comes into view.";

const SAY_VOICES = ["Samantha", "Daniel", "Karen", "Moira", "Tessa"];
const voices = ENGINE === "kokoro" ? KOKORO_VOICES : ENGINE === "say" ? SAY_VOICES : ["nova", "alloy", "shimmer", "onyx", "fable", "echo"];

const TMP = join(ROOT, ".tmp-story", "voice-sample");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const sh = (bin, args) => execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

console.log(`voice sample · engine ${ENGINE} · ${voices.length} voices\n`);

const clips = [];
for (const voice of voices) {
  process.stdout.write(`  ${voice.padEnd(12)}`);
  // The announcement is spoken in the voice it announces, so there is no
  // counting along with a list to work out which one you just heard.
  const [name, line] = await synthesizeAll(
    [
      { id: `${voice}-name`, text: `${voice.replace(/_/g, " ")}.` },
      { id: `${voice}-line`, text: LINE },
    ],
    { engine: ENGINE, voice, dir: TMP },
  );
  clips.push(name.out, line.out);
  console.log(`${(name.seconds + line.seconds).toFixed(1)}s`);
}

// Half a second of silence between voices, so they don't run together.
const gap = join(TMP, "gap.wav");
sh("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.6", gap]);

const list = join(TMP, "list.txt");
const seq = [];
for (let i = 0; i < clips.length; i += 2) seq.push(clips[i], clips[i + 1], gap);
writeFileSync(list, seq.map((f) => `file '${f}'`).join("\n") + "\n");

const out = join(ROOT, `voice-sample-${ENGINE}.mp3`);
sh("ffmpeg", [
  "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
  "-ar", "44100", "-b:a", "128k", out,
]);

console.log(`\n✓ ${out.replace(ROOT + "/", "")}`);
console.log(`  Each voice says its own name, then the sample line.`);
