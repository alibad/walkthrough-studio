# Playable walkthroughs

A walkthrough you watch like a video, played in the real app. A cursor moves, clicks and types while the narration
plays. Pause, and the page is yours to click around in. Press play, and it picks up where it stopped.

One script, three outputs:

| Output | Script | What it is |
|---|---|---|
| **Live** | `play.html` + `play.js` | the tour plays inside the app, in an iframe, under a player bar with chapters |
| **Film** | `record.mjs` | each step filmed as a take, then assembled into an MP4 by the narrate-video skill |
| **Check** | `check.mjs` | every chapter replayed headless; a step whose target is gone fails, so a tour can't silently go stale |

The narration comes from the narrate-video skill's voice studio (`voice.mjs`), in the author's own saved voice.

## A tour

A tour is a folder that sits with the app it walks through (for example `my-app/walkthroughs/intro/`). It holds a
`tour.json` and the narration the tour plays:

```jsonc
{
  "version": 1,
  "id": "intro",
  "title": { "en": "How it works", "ar": "كيف يعمل" },     // any text field: one string, or one per language
  "lede": { "en": "Shown on the cover before the viewer presses play.", "ar": "…" },
  "lang": "en", "langs": ["en", "ar"],
  "viewport": { "width": 1280, "height": 720 },          // the size it's filmed and checked at
  "frame": "nav.tabs",                                   // unique and always on screen (sticky), for filming
  "steps": [
    {
      "id": "search",
      "chapter": { "en": "Search", "ar": "البحث" },      // starts a chapter: needs a url, can start a fresh page
      "url": "/docs/?lang={lang}",                       // {lang} becomes the language code
      "ready": "[data-tour=search]",                     // wait for this before the step starts
      "say": { "en": "Type a word, and the list narrows.", "ar": "…" },
      "do": [
        { "do": "type", "target": "[data-tour=search] input", "value": { "en": "budget", "ar": "ميزانية" }, "cue": { "en": "Type a word", "ar": "…" } }
      ],
      "audio": { "en": "voice/en/01-search.mp3" },        // written by voice.mjs
      "duration": { "en": 3.4 }                          // seconds, measured from the take; places the cues
    },
    {
      "id": "results",                                    // no chapter: continues on the same page
      "after": "[data-tour=count]",                       // visible when the step ends (filming checks it)
      "say": { "en": "Pause any time: the page is yours.", "ar": "…" },
      "film": false,                                     // a line only a live viewer needs; the MP4 skips it
      "do": [{ "do": "point", "target": "[data-tour=count]", "at": 0.2 }]
    }
  ]
}
```

Actions: `point` (move the cursor there and ring it), `click`, `type` (`value`), `scroll`, `wait` (`ms`) and
`clear` (drop the ring). `target` is a CSS selector. Stable hooks such as `data-tour` survive restyling. `text`
narrows a target to the element containing that text.

**When** an action happens is a `cue`, a phrase from the step's line. The engine places it by where the phrase falls
in the sentence, scaled to the narration's measured length, and starts moving just before the word. Re-record the
voice and the actions move with it. A cue missing from one language falls back to its place in the English line.
`at` (seconds into the line) overrides a cue.

**Chapters** are what the viewer seeks between. A chapter's first step has a `url`. The steps after it continue on
the same page, as the viewer sees them.

## Use it

```sh
# 1. Check the script against the running app, in every language it speaks
node player/check.mjs --app http://localhost:5270 --tour ../my-app/walkthroughs/intro

# 2. Narrate it in your saved voice (the voice studio must be running, with the profile ready for that language)
node player/voice.mjs --tour ../my-app/walkthroughs/intro --work F:/work/intro-20261124 --python <python 3.12> --lang en

# 3. Play it live
node player/serve.mjs --app http://localhost:5270 --tour ../my-app/walkthroughs/intro --port 5390
#    open http://localhost:5390/__play/   (?lang=ar, ?chapter=3)

# 4. Film it, then render with narrate-video
node player/record.mjs --app http://localhost:5270 --tour ../my-app/walkthroughs/intro --work F:/work/intro-20261124 --lang en --build "my-app abc1234"
python ~/.claude/skills/narrate-video/scripts/render.py F:/work/intro-20261124/plan.en.json F:/work/intro-20261124/cut-en
```

`check.mjs` and `record.mjs` run in `--browser <chromium exe>` (or `PLAYABLE_BROWSER`) when given, otherwise in
Playwright's own Chromium, and when that isn't downloaded, in the installed Edge or Chrome. They print which.

## How the player behaves

- **The voice is the clock.** Actions wait for their moment in the narration's audio, so pausing the voice pauses
  the cursor, and they can never run ahead of what is being said. (An earlier story player here, a CSS animation
  screen-recorded by Playwright, drifted because the player and the recorder disagreed about time.)
- **Pause hands over the page.** The cursor dims. Scroll and read freely, and play continues mid-sentence.
- **Changing the page starts the chapter over.** A real click, key press or followed link while paused marks the
  page as changed. Play then reloads the chapter's `url` and runs it from the top, so the narration never describes
  a screen the viewer isn't looking at.
- **No narration yet** plays as a silent preview with estimated timing, and the bar says so. Don't ship it.
- **Languages:** `?lang=ar` plays the Arabic lines and audio, with a right-to-left bar and Arabic controls.

## Limits

- **Same origin.** The player drives the app through its iframe, so `play.html` must be served from the app's own
  origin: by `serve.mjs` locally, or from the site's own folder when published.
- **Read-only actions on live sites.** A step that saves data would save it for every viewer, so tours click,
  filter, search and navigate, and nothing that writes.
- **Sound needs one click.** Browsers won't autoplay audio, so the tour starts from the cover's Play button.
- **Arabic films** need Pillow with RAQM for the renderer's burned captions. The live player shows Arabic captions
  as page text, so it needs none.
