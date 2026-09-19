# Persona media — portraits, scenes, moments, and the story video

A journey made only of captures reads as a UI inventory no matter how good the
narrative is, because every frame is a rectangle of somebody else's chrome.
Four generated artifacts fix that, in increasing order of cost:

| Artifact | Path (under `{slug}/`) | Size | Cost |
|---|---|---|---|
| Portrait | `personas/{personaId}.png` | 1024×1536 (2:3) | ~1 image |
| Scene-setter | `personas/{personaId}-scene.png` | 1536×1024 (3:2) | ~1 image |
| Moment shots | `personas/{personaId}-moment-{slot}.png` | 1536×1024 (3:2) | 3 images + 6 completions |
| Story video | `personas/{journeyId}-story.mp4` | 1920×1080 | ~1 completion per beat + local TTS |

None of them is required. A journey with no art still reads; it just reads as
a report rather than as a story.

---

## The rule that makes this defensible

**Every one of these is invented, and the hub says so on every single one.**

That is a categorical difference from everything else this skill produces.
A capture is evidence: the software really did that, on that surface, at that
location. A portrait is a composite of a role. A moment shot is a picture of an
afternoon nobody observed. The narration is a synthetic voice reading text a
model wrote.

So:

- `JourneyMoment` in the contract documents that `synthetic` is the only honest
  verification status for a moment.
- `components/journey/moment.tsx` prints **Illustration** above every caption,
  unconditionally — not on hover, not behind a flag.
- The masthead prints **illustration** in the corner of the scene-setter.
- `StoryPlayer` prints, under the video: *"Real captures. The voice-over is
  synthesized from the scene narrative on this page — it is not the product's
  own audio."*

If any of those labels is ever made conditional, the artifact stops being
defensible. Delete the generator before you delete the label.

---

## Setup

```
OPENAI_API_KEY=…
```

One key. Images, chat and speech all come from it, and `pnpm doctor` will tell
you whether it works before a walk depends on it.

**Model ids move, so they are checked rather than remembered.** `gpt-image-2`
shipped in April 2026 and was superseded by `gpt-image-2.5` in September — five
months, and notes written in between were wrong by the time anyone read them.
The defaults in `scripts/lib/models.mjs` were confirmed against `GET /v1/models`
with a real key, `pnpm doctor` re-checks that your key can reach whichever model
is configured, and `OPENAI_IMAGE_MODEL` / `OPENAI_TEXT_MODEL` override them
without touching code.

Before trusting any model name in this document, list `/v1/models` and sort by
`created`. Including the ones above.

If you route model calls through a gateway rather than straight to OpenAI, add
an engine to `scripts/lib/models.mjs` instead of teaching each script its own
way to call a model.

---

## 1. Portrait and scene-setter

```bash
pnpm persona:art --project=<slug>
pnpm persona:art --project=<slug> --persona=<id> --force
```

**The scene is generated from the portrait, through `images/edits`.** These
began as two independent text-to-image calls and produced two different
people — one face on the persona card and a different face in the masthead of
that same persona's page. Attaching the portrait as a visual reference is the
only thing that makes them the same individual. Order therefore matters: the
portrait must exist first.

The prompt is downstream of `catalog.json`. If a persona looks miscast — wrong
age band, wrong dress, generic stock-photo affect — **tighten
`personas[].description` and regenerate.** Do not tune the prompt; the
description is the input and the next person to regenerate will lose your edit.

---

## 2. Moment shots

```bash
pnpm persona:moments --project=<slug> --persona=<id>
```

Three slots, positioned from the scene count so a 5-scene and a 9-scene journey
both land their beats in the right place:

- `setting-out` — before scene 1 (`afterScene: -1`)
- `deciding` — around 60% through
- `payoff` — after the last scene, so the story ends on the person

Each is one `gpt-5`-family completion for the art direction, one for the
first-person caption, and one image conditioned on the portrait. The script
patches `moments[]` into the journey JSON itself, so the reader and the video
pick them up with no further wiring.

**The persona is away from the screen in all three.** That is the entire point.
If a moment shot contains a laptop being used, the prompt failed and you have
generated a fourth screenshot.

---

## 3. Story video

```bash
pnpm persona:story --project=<slug> --persona=<id>
pnpm persona:story --project=<slug> --persona=<id> --voice=Daniel --regen-narration
```

Output: `personas/{journeyId}-story.mp4` plus a `.events.json` sidecar holding
the narration and the timing, so a reviewer can check a line against its frame
without re-running anything.

### Why it composites with ffmpeg instead of recording a browser

The obvious build — and the one the predecessor to this repo shipped — is a
chromeless HTML route with a CSS-animated player, screen-recorded by Playwright
and muxed afterwards. It works, and it cost about 1,200 lines across a route, a
player component and a recorder. Nearly every bug in it was one bug: *the
player's idea of when a beat started and the recorder's idea of when a beat
started drifted apart.* Hence a page that had to export `window.__storyBeats`
so the recorder could read timing back, fallback constants kept in sync by
hand, and a documented failure where narration played over the next scene.

Compositing directly eliminates the class:

> **A beat's duration IS its narration's duration.** The audio is rendered
> first and measured; the still is then held for exactly that long plus a
> breath. Overrun is not unlikely, it is unrepresentable.

It is also a third of the code, needs no dev server, no auth cookie and no
headless browser, and is immune to the compositor throttling that made the old
recorder unable to trust `setTimeout`.

### Narration

One line per beat, at most 16 words, **enforced in code with a second
compression call** — a model asked for a word limit will exceed it often
enough that trusting the prompt is a decision to ship overlapping audio.

Moment captions and the journey's `payoff` are spoken **verbatim**. They are
already first-person lines written for this journey, and paraphrasing them into
narrator voice would flatten the only two places the persona speaks.

Cached at `.tmp-story/{slug}-{personaId}/narration.json`; `--regen-narration`
refreshes it.

### Voice

`scripts/lib/tts.mjs`, three engines behind one interface:

| Engine | What it is | When it's used |
|---|---|---|
| `kokoro` | Kokoro 82M, Apache-2.0, local ONNX, 54 voices | default |
| `openai` | `gpt-4o-mini-tts` | automatically, the moment `OPENAI_API_KEY` exists |
| `say` | the macOS built-in | only if you ask for it |

**OpenAI's TTS is the right tool and was unreachable for the first two weeks of
this project.** Worth recording so nobody re-litigates it: there was no key in
the environment at all, and the local Kokoro path exists because of it — which
turned out to be worth having, since it means narration works on a clone with
no account. The `openai` engine self-selects the moment a key
appears, because at that point it is the better option and nobody should have
to come back here to switch.

So the default is local. Kokoro's weights (~350 MB) download on first use into
`~/.cache/walkthrough-studio/kokoro/` — **outside the repo**, because 350 MB of
model has no business in git. The download is size-checked, not
existence-checked: a truncated file exists and then fails at load with an
opaque ONNX protobuf error, which is a much worse afternoon than re-fetching.

Python is not a repo dependency. The synthesis helper runs through
`uv run --with kokoro-onnx --with soundfile`, which builds a throwaway
environment and caches it.

**Synthesis is batched.** The model takes ~0.6s to load and ~0.4s per second of
audio, so a load per line would spend more time starting up than speaking. One
process, one load, every line.

### Picking a voice

This is the one decision in the pipeline that cannot be made from a benchmark
table — you have to listen to it.

```bash
node scripts/tts-sample.mjs              # the 8 grade-A Kokoro voices
node scripts/tts-sample.mjs --engine=say # the old baseline, for comparison
```

Writes a single MP3 in which each candidate announces its own name in its own
voice and then reads the same narration line, so it is one file to play rather
than nine to open, and no counting along with a list. Then:

```bash
pnpm persona:story --project=<slug> --persona=<id> --voice=bm_george
```

---

## Gotchas, each of which shipped once

**A tight `max_completion_tokens` on a reasoning model returns an empty
string.** The GPT-5 family spends the budget on reasoning first and output
second, so 120 tokens for a fourteen-word caption yields
`finish_reason: "length"` with `content: ""` — and the response carries an
empty `content_filter_result`, so it reads like moderation rather than like a
budget you set too low. Pass `effort: "none"` for short, well-specified
writing, and keep the budget generous.

**`say --data-format=LEI16@…` fails on AIFF.** AIFF is big-endian. The error is
`Opening output file failed: fmt?`. Omit the flag. (Only reachable now via
`--engine=say`, but the error message is opaque enough to be worth keeping.)

**Classify plate widths by orientation, never by filename.** The optimizer
tests `dim.h > dim.w` to tell a portrait from a wide plate. An earlier version
tested `file.endsWith("-scene.png")`, which sent every moment shot down the
portrait path and downscaled a 1536px plate to 800px — after which the reader
upscaled it back to 1180 and the stipple turned to grey mush. No name-based
rule can work: persona ids are author-chosen and contain hyphens, so
`fact-checker.png` is a portrait and `fact-checker-moment-payoff.png` is not.

**The optimizer must not recurse into `personas/`.** Journey captures live at
`personas/{journeyId}/*.png`, inside a directory the optimizer scans. The
listing is deliberately flat. Make it recursive and you will grayscale real
screenshots, and the only symptom will be that the evidence looks wrong.

**Crop generated plates near their native aspect.** A 3:2 plate shown in a
`3/1` band discards two thirds of a composition that was framed as a whole and
upscales the surviving strip past its native width. The masthead uses `5/2`,
which is the widest crop a 1400px source fills at 1:1 pixels.

**ffmpeg `drawtext` renders a newline as a `.notdef` box.** A caption wrapped
with `\n` in a single `textfile` shows a visible □ at the break. Emit one
`drawtext` per line and set the leading yourself. And use `textfile=` rather
than `text=` throughout — captions contain apostrophes, colons and em-dashes,
and escaping those through a filtergraph is a losing game.

**Reserve the caption band; don't paint over the frame.** Fit the plate into
`1920×(1080−band)` and extend the canvas downward. Scaling to full height and
then drawing a band over the bottom occludes 200px of every capture — which on
a page capture is real content. Make the band fully opaque, too: at 94% the
text underneath showed through and read as a rendering fault.
