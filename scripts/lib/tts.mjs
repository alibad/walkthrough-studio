/**
 * Narration audio. One interface, three engines.
 *
 * ── Why this isn't just an API call ────────────────────────────────────────
 *
 * OpenAI's `gpt-4o-mini-tts` is the right tool and it was not reachable from
 * the machine this was built on: no `OPENAI_API_KEY` in the environment, and
 * a resource with no speech model available — sixteen plausible model
 * names probed, every one `DeploymentNotFound`, and provisioning one needs
 * portal access nobody had.
 *
 * So the default engine is **local**: Kokoro (82M params, Apache-2.0), run
 * through ONNX. Weights download on first use and cache outside the repo. It
 * is a large step up from the macOS `say` voice this replaced, which is a
 * formant synthesiser and sounds like one.
 *
 * `openai` is implemented anyway and selected automatically when a key
 * appears, because the moment one exists it is the better option and nobody
 * should have to come back here to switch.
 *
 * ── Engines ────────────────────────────────────────────────────────────────
 *
 *   kokoro  (default)  local neural TTS, 54 voices, ~0.4s per second of audio
 *   openai             gpt-4o-mini-tts, used when OPENAI_API_KEY is set
 *   say                macOS built-in. Kept only as a no-download fallback.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Weights live outside the repo — 350 MB of model has no business in git. */
const CACHE = join(homedir(), ".cache", "walkthrough-studio", "kokoro");
const RELEASE =
  "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0";
const WEIGHTS = [
  { file: "kokoro-v1.0.onnx", minBytes: 300_000_000 },
  { file: "voices-v1.0.bin", minBytes: 20_000_000 },
];

/** Grade-A Kokoro voices, the ones worth offering as a default. */
export const KOKORO_VOICES = [
  "af_heart",
  "af_bella",
  "af_nicole",
  "am_michael",
  "am_fenrir",
  "bf_emma",
  "bm_george",
  "bm_fable",
];

const sh = (bin, args, opts = {}) =>
  execFileSync(bin, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts });

/**
 * Fetch the Kokoro weights if they aren't cached.
 *
 * Size-checked rather than existence-checked: a truncated download leaves a
 * file that exists and fails at load with an opaque ONNX protobuf error, which
 * is a much worse afternoon than re-downloading.
 */
export function ensureKokoroWeights({ quiet = false } = {}) {
  mkdirSync(CACHE, { recursive: true });
  for (const { file, minBytes } of WEIGHTS) {
    const path = join(CACHE, file);
    if (existsSync(path) && statSync(path).size >= minBytes) continue;
    if (!quiet) process.stdout.write(`  downloading ${file} … `);
    sh("curl", ["-sSL", "--fail", "--max-time", "1800", "-o", path, `${RELEASE}/${file}`]);
    const size = statSync(path).size;
    if (size < minBytes) {
      throw new Error(`${file} downloaded only ${size} bytes — expected ≥ ${minBytes}`);
    }
    if (!quiet) console.log(`${(size / 1024 / 1024).toFixed(0)} MB`);
  }
  return {
    model: join(CACHE, "kokoro-v1.0.onnx"),
    voices: join(CACHE, "voices-v1.0.bin"),
  };
}

/** Which engine to use, unless one was named explicitly. */
export function defaultEngine() {
  if (process.env.OPENAI_API_KEY) return "openai";
  return "kokoro";
}

export function defaultVoice(engine) {
  if (engine === "openai") return "nova";
  if (engine === "say") return "Samantha";
  return "af_heart";
}

/**
 * Synthesize every line in one pass. Returns `[{ id, out, seconds }]`.
 *
 * All engines return WAV at a known rate so the caller never has to branch on
 * container format, and the duration comes back measured rather than
 * estimated — the story renderer schedules each beat from it, so a guess here
 * would put narration over the wrong picture.
 */
export async function synthesizeAll(items, { engine, voice, speed = 1.0, dir }) {
  const chosen = engine || defaultEngine();
  const chosenVoice = voice || defaultVoice(chosen);
  mkdirSync(dir, { recursive: true });

  if (chosen === "kokoro") return kokoroAll(items, { voice: chosenVoice, speed, dir });
  if (chosen === "openai") return openaiAll(items, { voice: chosenVoice, speed, dir });
  if (chosen === "say") return sayAll(items, { voice: chosenVoice, dir });
  throw new Error(`unknown tts engine "${chosen}" (kokoro | openai | say)`);
}

// ── kokoro ─────────────────────────────────────────────────────────────────

function kokoroAll(items, { voice, speed, dir }) {
  const { model, voices } = ensureKokoroWeights();
  const helper = join(dirname(new URL(import.meta.url).pathname), "kokoro_synth.py");

  const job = {
    model,
    voices,
    voice,
    speed,
    lang: "en-us",
    items: items.map((it) => ({ id: String(it.id), text: it.text, out: join(dir, `${it.id}.wav`) })),
  };

  // `uv run --with` builds a throwaway environment and caches it, so the repo
  // needs no Python dependency and the first run is the only slow one.
  let out;
  try {
    out = sh(
      "uv",
      [
        "run", "--quiet", "--python", "3.12",
        "--with", "kokoro-onnx", "--with", "soundfile",
        "python3", helper,
      ],
      { input: JSON.stringify(job), maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (err) {
    const detail = (err.stderr || err.stdout || "").toString().trim().split("\n").slice(-6).join("\n");
    throw new Error(`kokoro synthesis failed:\n${detail}`);
  }

  const parsed = JSON.parse(out.trim().split("\n").pop());
  if (parsed.error) {
    throw new Error(
      `${parsed.error}. Available: ${(parsed.available || []).join(", ")}`,
    );
  }
  return parsed.results;
}

// ── openai ─────────────────────────────────────────────────────────────────

async function openaiAll(items, { voice, speed, dir }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("engine 'openai' needs OPENAI_API_KEY in .env.local");

  const results = [];
  for (const item of items) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        input: item.text,
        voice,
        speed,
        response_format: "wav",
      }),
    });
    if (!res.ok) {
      throw new Error(`openai tts HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
    }
    const out = join(dir, `${item.id}.wav`);
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    results.push({ id: String(item.id), out, seconds: wavSeconds(out) });
  }
  return results;
}

// ── say ────────────────────────────────────────────────────────────────────

function sayAll(items, { voice, dir }) {
  const results = [];
  for (const item of items) {
    const aiff = join(dir, `${item.id}.aiff`);
    const out = join(dir, `${item.id}.wav`);
    // No `--data-format`: AIFF is big-endian, so a little-endian format string
    // is rejected with the uninformative `Opening output file failed: fmt?`.
    sh("say", ["-v", voice, "-o", aiff, item.text]);
    sh("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", "24000", "-ac", "1", out]);
    results.push({ id: String(item.id), out, seconds: wavSeconds(out) });
  }
  return results;
}

// ── helpers ────────────────────────────────────────────────────────────────

function wavSeconds(file) {
  return parseFloat(
    sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim(),
  );
}

/** Read a WAV's duration without loading it. Exported for callers that need it. */
export { wavSeconds };
