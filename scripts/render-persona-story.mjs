#!/usr/bin/env node
/**
 * render-persona-story.mjs — a narrated MP4 of one persona's journey.
 *
 * Input is the journey JSON and the plates already on disk. Output is
 * `personas/{journeyId}-story.mp4`, which the hub picks up by convention and
 * surfaces as "Watch the story".
 *
 * ── Why this composites with ffmpeg instead of recording a browser ─────────
 *
 * The obvious build — and the one the predecessor to this repo shipped — is a
 * chromeless HTML route with a CSS-animated player, screen-recorded by
 * Playwright, then muxed with narration. It works, and it cost roughly 1,200
 * lines across a route, a player component and a recorder. Nearly every bug
 * in it was the same bug: the player's idea of when a beat started and the
 * recorder's idea of when a beat started drifted apart. Hence a page that had
 * to export `window.__storyBeats` so the recorder could read timing back,
 * fallback constants that had to be kept in sync by hand, and a documented
 * failure where narration played over the following scene.
 *
 * Compositing directly removes the entire class:
 *
 *   **A beat's duration IS its narration's duration.** Measured from the
 *   rendered audio file, then the still is held for exactly that long plus a
 *   breath. Overrun is not "unlikely", it is unrepresentable.
 *
 * It is also ~3× less code, needs no dev server, no auth cookie, no headless
 * browser, and is not subject to compositor throttling — which was the reason
 * the old recorder could not trust `setTimeout`.
 *
 * ── Narration is synthesized, and the hub says so ──────────────────────────
 *
 * The voice comes from `lib/tts.mjs`, which defaults to a local neural model
 * (Kokoro) because no cloud TTS is reachable here — see that file for the full
 * account of which doors are shut. It switches to `gpt-4o-mini-tts` on its own
 * the moment an `OPENAI_API_KEY` exists.
 *
 * Whichever engine speaks it: the captures are real, the voice is not a
 * recording of anyone, and it is not the product's own audio. The player
 * prints that under the video, and the line is burned into the frame so the
 * video is legible with the sound off.
 *
 * Usage:
 *   node scripts/render-persona-story.mjs --project=wikipedia --persona=fact-checker
 *   node scripts/render-persona-story.mjs --project=wikipedia --persona=fact-checker --voice=Daniel
 *   node scripts/render-persona-story.mjs ... --regen-narration
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chat, loadEnv, stripMarkdown } from "./lib/models.mjs";
import { defaultEngine, defaultVoice, synthesizeAll } from "./lib/tts.mjs";
import { ffmpegBin, ffprobeBin } from "./lib/ffmpeg.mjs";

// Resolved once, up front: the caption is burned into the frame with
// `drawtext`, and discovering that the chosen binary lacks it AFTER paying for
// speech synthesis is how this failed the first time.
const FFMPEG = ffmpegBin(["drawtext"]);
const FFPROBE = ffprobeBin(["drawtext"]);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
loadEnv(ROOT);

const argv = process.argv.slice(2);
const arg = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const PROJECT = arg("project");
const PERSONA = arg("persona");
const ENGINE = arg("engine") || defaultEngine();
const VOICE = arg("voice") || defaultVoice(ENGINE);
const REGEN = argv.includes("--regen-narration");

if (!PROJECT || !PERSONA) {
  console.error(
    "usage: node scripts/render-persona-story.mjs --project=<slug> --persona=<id>\n" +
      "       [--engine=kokoro|openai|say] [--voice=<name>] [--regen-narration]\n" +
      "       node scripts/tts-sample.mjs   # hear the candidate voices first",
  );
  process.exit(1);
}

const PROJECT_DIR = resolve(ROOT, "apps/hub/public/walkthroughs", PROJECT);
const ART_DIR = join(PROJECT_DIR, "personas");
const TMP = resolve(ROOT, ".tmp-story", `${PROJECT}-${PERSONA}`);

const W = 1920;
const H = 1080;
// 15fps, deliberately. Every beat is a still under a 4%-over-the-beat drift,
// so the zoompan makes each frame differ *slightly* from the last — which
// defeats P-frame compression and made a one-minute story 21 MB of video at
// 30fps. Halving the frame rate is imperceptible on a pan this slow and is
// most of a 55% saving; the rest comes from the crf below. Both matter for a
// repo people are meant to clone.
const FPS = 15;
const PAPER = "0xfaf8f5";          // --paper, so letterboxing matches the hub
const INK = "0x1a1815";            // --ink
const FADE = 0.45;                 // seconds, in and out of every beat
const BAND = 200;                  // caption band height; the plate gets the rest
const BREATH = 1.1;                // seconds of held frame after the line ends
const MIN_BEAT = 3.6;              // a three-word line still needs time to read
const FONT = "/System/Library/Fonts/Supplemental/Georgia.ttf";

const sh = (bin, args) =>
  execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Seconds, as a float. */
function duration(file) {
  return parseFloat(
    sh(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim(),
  );
}

// ── gather ─────────────────────────────────────────────────────────────────

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
  console.error(`no journey file for ${PERSONA}`);
  process.exit(1);
}
const journey = JSON.parse(readFileSync(join(PROJECT_DIR, journeyFile), "utf8"));

/**
 * The beat list: the sequence the viewer actually sees.
 *
 * Moments are interleaved by `afterScene` exactly as the reader interleaves
 * them, so the video and the page tell the same story in the same order. If
 * they diverged, the video would become a second source of truth about a
 * journey, which is the thing this repo exists to avoid.
 */
function buildBeats() {
  const beats = [];
  const abs = (rel) => join(PROJECT_DIR, rel);

  const scenePath = join(ART_DIR, `${PERSONA}-scene.png`);
  if (existsSync(scenePath)) {
    beats.push({ kind: "intro", image: scenePath, title: journey.headline, source: journey.overview });
  }

  const byAfter = new Map();
  for (const m of journey.moments ?? []) {
    const k = m.afterScene;
    if (byAfter.has(k)) byAfter.get(k).push(m);
    else byAfter.set(k, [m]);
  }

  for (const m of byAfter.get(-1) ?? []) {
    beats.push({ kind: "moment", image: abs(m.image), title: "", source: m.caption, fixed: m.caption });
  }
  journey.scenes.forEach((scene, i) => {
    const frame = scene.frames?.[0];
    if (frame) {
      beats.push({ kind: "scene", image: abs(frame), title: scene.title, source: scene.narrative });
    }
    for (const m of byAfter.get(i) ?? []) {
      beats.push({ kind: "moment", image: abs(m.image), title: "", source: m.caption, fixed: m.caption });
    }
  });

  if (journey.payoff) {
    const portrait = join(ART_DIR, `${PERSONA}.png`);
    beats.push({
      kind: "outro",
      image: existsSync(portrait) ? portrait : beats[0]?.image,
      title: "",
      source: journey.payoff,
      fixed: journey.payoff,
    });
  }
  return beats.filter((b) => b.image && existsSync(b.image));
}

const beats = buildBeats();
if (beats.length === 0) {
  console.error("no beats — the journey has no captures and no plates");
  process.exit(1);
}

// ── narration ──────────────────────────────────────────────────────────────

/**
 * One spoken line per beat, in the persona's third-person narrator voice.
 *
 * Capped at 18 words and enforced in code, not in the prompt. A model asked
 * for "at most 14 words" will hand back 40 often enough that trusting it is a
 * decision to ship overlapping audio.
 *
 * Moment captions and the payoff are used verbatim (`fixed`) — they are
 * already first-person lines written for this journey, and paraphrasing them
 * into narrator voice would lose the only two places the persona speaks.
 */
async function narrate() {
  const cachePath = join(TMP, "narration.json");
  if (existsSync(cachePath) && !REGEN) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8"));
    if (cached.length === beats.length) {
      console.log(`  narration: ${cached.length} lines (cached)`);
      return cached;
    }
  }

  const SYSTEM =
    "You narrate a short documentary about one person using a piece of software. " +
    "Plain, concrete, present tense. No marketing words, no adjectives like " +
    "'seamless' or 'powerful', no second person, no exclamation.";

  const lines = [];
  for (const [i, beat] of beats.entries()) {
    if (beat.fixed) {
      lines.push(stripMarkdown(beat.fixed));
      continue;
    }
    const ask = `Documentary about ${persona.name}, ${persona.authRole ?? "a user"} of ${catalog.projectName}.
Journey: ${stripMarkdown(journey.headline)}
${i === 0 ? `Overview: ${stripMarkdown(journey.overview).slice(0, 400)}` : `This beat: ${stripMarkdown(beat.title)} — ${stripMarkdown(beat.source).slice(0, 400)}`}

Write ONE narration line for this beat. AT MOST 16 WORDS. One sentence. No quotes. No name of the product unless it is unavoidable.`;
    let line = stripMarkdown(await chat(ask, { system: SYSTEM, maxTokens: 700, effort: "none" }))
      .replace(/^["']|["']$/g, "");
    if (line.split(/\s+/).length > 18) {
      line = stripMarkdown(
        await chat(`Compress to at most 16 words, same meaning, no quotes:\n\n${line}`, {
          system: SYSTEM,
          maxTokens: 500,
          effort: "none",
        }),
      ).replace(/^["']|["']$/g, "");
    }
    const words = line.split(/\s+/);
    if (words.length > 20) line = words.slice(0, 20).join(" ") + "…";
    lines.push(line);
    process.stdout.write(".");
  }
  mkdirSync(TMP, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(lines, null, 2));
  console.log(` ${lines.length} lines`);
  return lines;
}

// ── render ─────────────────────────────────────────────────────────────────

/** Wrap a caption to a fixed column so it never runs off the frame. */
function wrap(text, perLine = 58) {
  const words = text.split(/\s+/);
  const out = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > perLine) {
      out.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) out.push(line.trim());
  // Returned as an ARRAY, and each line becomes its own drawtext.
  //
  // A single drawtext with newlines in its textfile renders the newline as a
  // .notdef box — a visible □ mid-caption — because the font has no glyph for
  // it and libfreetype draws the fallback rather than breaking the line. One
  // filter per line sidesteps the question entirely and makes the leading
  // explicit instead of depending on `line_spacing`.
  return out.slice(0, 3);
}

console.log(`story · ${PROJECT}/${PERSONA} · ${beats.length} beats · voice ${VOICE}\n`);

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const lines = await narrate();

// 1. Speak every line in one pass and MEASURE it. The measurement is the
//    schedule — this is the whole reason narration can't overrun a beat.
console.log(`  speaking… (${ENGINE} · ${VOICE})`);
const spoken = await synthesizeAll(
  lines.map((text, i) => ({ id: `v${i}`, text })),
  { engine: ENGINE, voice: VOICE, dir: join(TMP, "speech") },
);

const timeline = [];
for (const [i, line] of lines.entries()) {
  const clip = spoken.find((r) => r.id === `v${i}`);
  const beatDur = Math.max(MIN_BEAT, clip.seconds + BREATH);
  const wav = join(TMP, `a${i}.wav`);
  // Pad the speech out to the beat's exact length so concatenating the audio
  // reproduces the video timeline with no drift to correct for.
  sh(FFMPEG, [
    "-y", "-loglevel", "error", "-i", clip.out,
    "-af", `apad=whole_dur=${beatDur.toFixed(3)}`,
    "-t", beatDur.toFixed(3), "-ar", "44100", "-ac", "2", wav,
  ]);
  timeline.push({ ...beats[i], line, spoken: clip.seconds, dur: beatDur, wav });
}
const total = timeline.reduce((n, b) => n + b.dur, 0);
console.log(`  timeline: ${total.toFixed(1)}s`);

// 2. One clip per beat: fit the plate on paper, drift it slowly, burn the line.
console.log("  compositing…");
for (const [i, beat] of timeline.entries()) {
  const captionLines = wrap(beat.line);
  const frames = Math.ceil(beat.dur * FPS);
  const out = join(TMP, `c${i}.mp4`);
  const stage = H - BAND;

  // Each caption line goes to its own file. `textfile` rather than `text`
  // because captions contain apostrophes, colons and em-dashes, and escaping
  // those through a filtergraph is a losing game.
  const drawtexts = captionLines.map((line, n) => {
    const txt = join(TMP, `t${i}-${n}.txt`);
    writeFileSync(txt, line);
    const blockH = captionLines.length * 54;
    const top = stage + (BAND - blockH) / 2 + n * 54;
    return (
      `drawtext=fontfile=${FONT}:textfile=${txt}:fontcolor=${INK}:fontsize=40:` +
      `x=(w-text_w)/2:y=${Math.round(top)}:box=0`
    );
  });

  const vf = [
    // The plate is fitted ABOVE the band, not behind it. Scaling to the full
    // 1080 and then painting a band over the bottom occluded the last 200px
    // of every capture — and on a page capture that is real content.
    `scale=${W}:${stage}:force_original_aspect_ratio=decrease`,
    `pad=${W}:${stage}:(ow-iw)/2:(oh-ih)/2:color=${PAPER}`,
    // A slow push in. A still held for five seconds reads as a stalled video;
    // 4% over the beat is enough to feel alive without becoming a zoom.
    `zoompan=z='min(1+0.04*on/${frames},1.04)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${stage}:fps=${FPS}`,
    // Then extend the canvas downward and fill the band. Fully opaque: at 0.94
    // the page text underneath showed through and read as a rendering fault.
    `pad=${W}:${H}:0:0:color=${PAPER}`,
    ...drawtexts,
    `fade=t=in:st=0:d=${FADE}:color=${PAPER}`,
    `fade=t=out:st=${(beat.dur - FADE).toFixed(3)}:d=${FADE}:color=${PAPER}`,
  ].join(",");

  sh(FFMPEG, [
    "-y", "-loglevel", "error",
    "-loop", "1", "-framerate", String(FPS), "-i", beat.image,
    "-t", beat.dur.toFixed(3),
    "-vf", vf,
    // crf 28 verified against the acceptance criterion that matters here:
    // body text inside a page capture stays legible. Checked by cropping the
    // same region out of a crf-23 and a crf-28 render and comparing.
    "-c:v", "libx264", "-preset", "medium", "-crf", "28", "-tune", "stillimage",
    "-pix_fmt", "yuv420p", "-r", String(FPS),
    out,
  ]);
  process.stdout.write(".");
}
console.log("");

// 3. Concatenate video and audio, then mux. Both lists are the same length and
//    the same durations, so no offset correction is needed anywhere.
const vList = join(TMP, "video.txt");
const aList = join(TMP, "audio.txt");
writeFileSync(vList, timeline.map((_, i) => `file '${join(TMP, `c${i}.mp4`)}'`).join("\n") + "\n");
writeFileSync(aList, timeline.map((b) => `file '${b.wav}'`).join("\n") + "\n");

const videoCat = join(TMP, "video.mp4");
const audioCat = join(TMP, "audio.wav");
sh(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", vList, "-c", "copy", videoCat]);
sh(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", aList, "-c", "copy", audioCat]);

const outPath = join(ART_DIR, `${journey.journeyId}-story.mp4`);
mkdirSync(ART_DIR, { recursive: true });
sh(FFMPEG, [
  "-y", "-loglevel", "error",
  "-i", videoCat, "-i", audioCat,
  "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
  "-movflags", "+faststart", "-shortest",
  outPath,
]);

// 4. A sidecar of the schedule, so the narration is inspectable without
//    re-running the model and a reviewer can check a line against its frame.
writeFileSync(
  join(ART_DIR, `${journey.journeyId}-story.events.json`),
  JSON.stringify(
    {
      journeyId: journey.journeyId,
      personaId: PERSONA,
      voice: `${ENGINE} · ${VOICE}`,
      note: "Captures are real. The voice is synthesized locally and is not the product's own audio.",
      totalMs: Math.round(total * 1000),
      beats: timeline.reduce((acc, b) => {
        const startMs = acc.length ? acc[acc.length - 1].startMs + acc[acc.length - 1].durMs : 0;
        acc.push({
          kind: b.kind,
          startMs,
          durMs: Math.round(b.dur * 1000),
          narration: b.line,
          image: b.image.replace(PROJECT_DIR + "/", ""),
        });
        return acc;
      }, []),
    },
    null,
    2,
  ) + "\n",
);

const finalDur = duration(outPath);
const sizeMb = (readFileSync(outPath).length / 1024 / 1024).toFixed(1);
console.log(`\n✓ ${outPath.replace(ROOT + "/", "")}`);
console.log(`  ${finalDur.toFixed(1)}s · ${sizeMb} MB · ${timeline.length} beats`);
