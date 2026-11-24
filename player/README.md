# Playable walkthroughs

A walkthrough you watch like a video, played in the real app. A cursor moves, clicks and types while the narration
plays. Pause, and the page is yours to click around in. Press play, and it picks up where it stopped.

One script, three outputs:

| Output | Script | What it is |
|---|---|---|
| **Live** | `play.html` + `play.js` | the tour plays inside the app, in an iframe, under a player bar with chapters; `launch.js` opens it over a page from a button |
| **Film** | `record.mjs` | each chapter filmed as one take at 2x, with a camera that follows the action, then assembled into an MP4 by the narrate-video skill |
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

`camera` (films only) says what the camera frames for an action. Left out, it frames the action's own element so it
fills about 60% of the picture, up to `--max-zoom` (1.6). A scroll goes wide. The other values:
- `"wide"`: the whole page.
- `"hold"`: stay where it is.
- a number: that zoom on the element.
- `{ "frame": "<selector>", "zoom": 1.2 }`: frame something larger, such as the whole chart while the cursor points at one card.

Focus moves less than two seconds apart, such as "the cabinet, the council and the courts", share one framing of
everything they point at. The ring then moves within a still picture.

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

## The film

`record.mjs` films each chapter as one take, at 1280x720 CSS pixels and 2x device pixels (2560x1440). The steps play
one after another, each lasting as long as its narration. It writes narrate-video's edit plan with one scene per
chapter:
- **Camera:** each chapter opens wide on its page, then follows what each action is about. The camera moves are
  eased, start a beat before the cursor, and frame the target a little above the middle. render.py crops from the
  2x pixels, so text stays sharp at 1.6x zoom and readable on a phone.
- **Clear of the captions:** targets are scrolled out of the bottom 30% of the page, where the caption card sits.
- **Captions:** each line becomes short cues, a sentence or a phrase of up to 56 characters each, shown for its
  share of the narration. They sit on a lower-third card, in the system's UI typeface (Segoe UI Semibold on
  Windows) or the `--font` you give.
- **Narration:** one track per chapter, each line placed where its step started.
- **Images:** lazy images load at once while filming, since the recorder waits for every image. A photo that fails
  to load stops the film, with its address.

## Start a tour from the page

Copy the player into the site, so it is served from the site's own origin:

```sh
node player/bundle.mjs --out ../my-app/public/playable     # play.html, play.js, play.css, engine.js, launch.js
```

Serve the tour folder (`tour.json` and `voice/`) from the site too, then give the page one script tag and a button:

```html
<button type="button" data-playable-tour="/walkthroughs/intro/tour.json" data-playable-lang="ar">Take the 1-minute tour</button>
<script src="/playable/launch.js" defer></script>
```

- **Opening:** the button opens the player over the page, in place, and starts it with sound. If the browser blocks
  sound, the cover asks for a click.
- **Closing:** the close button or Escape closes the player and leaves the page as it was.
- **Language:** `data-playable-lang` picks the language. It defaults to the page's `?lang=`, then `<html lang>`.
- **Starting chapter:** `data-playable-chapter` opens at that chapter.
- **A link to share:** the page's address with `#tour` (or `#tour=3` for chapter 3) opens the player on its cover.
  While the player is open, the address carries `#tour`.
- **From a script:** `window.PlayableLaunch.open({ tour, lang, chapter })`.

To try it before the page has a button, run `serve.mjs --inject`. It adds the launcher to every app page it proxies,
with a floating button labelled in the page's language.

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
- **Arabic films** need Pillow with RAQM (HarfBuzz and FriBiDi) for the renderer's burned captions. Pillow's
  Windows wheels lack FriBiDi. The live player shows Arabic captions as page text, so it needs none.
