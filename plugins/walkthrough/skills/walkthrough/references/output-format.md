# Output format — the contract

Every shape the skill writes and the hub reads. **Write files from this
document, not from memory.** Field names here are exact; the hub type-checks
them at build time and silently ignores anything it doesn't recognise, which
means a typo'd key produces a page that renders but omits your content.

The authoritative TypeScript lives in
[`apps/hub/src/lib/types.ts`](../../../../../apps/hub/src/lib/types.ts). If the two
ever disagree, the TypeScript wins and this file is a bug.

## Storage layout

One directory per app, under the hub's `public/` so captures are served as
static files with no image pipeline:

```
apps/hub/
  projects.json                        the registry (human-maintained)
  public/walkthroughs/{slug}/
    catalog.json                       features, personas, surfaces, brand
    {featureId}.{surfaceId}.json       one walkthrough per feature × surface
    persona-{personaId}.{journeyId}.json  a persona journey
    fixes.json                         verified bug fixes
    issues.json                        problems found while capturing
    runs.json                          append-only run history
    {featureId}/{surfaceId}/*.png      captures
    personas/*.png                     persona art (portraits, scenes, moments)
    personas/{journeyId}/*.png         captures taken for a journey
    personas/{journeyId}-story.mp4     narrated story video
```

Paths inside JSON are **relative to `public/walkthroughs/{slug}/`**. The hub
turns them into `/walkthroughs/{slug}/<path>`. Never write an absolute path and
never write a `public/`-prefixed one.

---

## The three generalizations

If you've used a web-only version of this tool, these are the differences that
matter:

**1. `location` replaces `route`.** One string whose meaning depends on the
platform:

| Platform | `location` is | Example |
|---|---|---|
| `web` | a URL path | `/settings/billing` |
| `ios` | a screen identifier or deep link | `SettingsScreen`, `fieldnote://settings` |
| `android` | an activity or screen | `com.acme/.SettingsActivity` |
| `desktop` | a window and pane path | `Preferences › Network` |
| `cli` | the invocation | `acme deploy --dry-run` |

**2. `surface` replaces `viewport`.** Not `"desktop" | "mobile"` but a named id
from the surface registry, carrying real dimensions and a frame kind. This is
what lets a phone capture, a terminal capture and a desktop window capture sit
in one grid without confusing anyone.

**3. `surfaceStatus` replaces `desktopStatus`/`mobileStatus`.** A map, so a
project can track a tablet or three phone sizes without a schema change.

---

## `catalog.json`

```jsonc
{
  "projectName": "Fieldnote for iOS",
  "platform": "ios",                   // web | ios | android | desktop | cli
  "driver": "ios-simulator",
  "capturedAgainst": "iPhone 17 Pro",  // base URL, device name, or host
  "discoveredAt": "2026-09-17T09:00:00Z",
  "updatedAt": "2026-09-17T11:30:00Z",

  // Optional. Only needed for hardware the built-in registry doesn't cover —
  // omit to accept the platform defaults.
  "surfaces": [
    {
      "id": "iphone-se",
      "label": "iPhone SE",
      "platform": "ios",
      "width": 375, "height": 667,     // LOGICAL units: css px / points / dp
      "scale": 2,
      "frame": "phone",                // browser|phone|tablet|desktop-window|terminal|none
      "orientation": "portrait",
      "deviceName": "iPhone SE (3rd generation)"
    }
  ],

  // Optional. Lifted from the app so generated guides look like the product.
  "brand": {
    "primaryColor": "#1f6feb",
    "backgroundColor": "#ffffff",
    "textColor": "#1a1a1a",
    "fontFamily": "Inter",
    "logoPath": "brand/logo.png"
  },

  "features": [
    {
      "featureId": "capture-note",           // stable slug: a URL and a dirname
      "featureName": "Capturing a note",     // what a user calls it
      "location": "CaptureScreen",
      "category": "capture",
      "requiresAuth": true,
      "authRole": "member",                  // key into projects.json auth.roles

      // done | pending | blocked | skipped, keyed by surface id.
      // "done" with no walkthrough file on disk is flagged by the hub.
      "surfaceStatus": { "iphone": "done", "ipad": "pending" },

      "videoStatus": "pending",
      "issueCount": 1,
      "lastWalkthroughAt": "2026-09-17T11:02:00Z",

      // Set ONLY when the feature was mapped from source and never driven.
      "synthetic": false,
      "testIds": ["capture-submit", "capture-body"],
      "notes": "Camera permission has to be granted once per simulator boot."
    }
  ],

  "personas": [
    {
      "id": "field-surveyor",
      "name": "Dana Whitfield",
      "description": "Markdown. Who they are and what they're trying to get done.",
      "authRole": "member",
      "entryPoint": "CaptureScreen",
      "keyJourneys": ["morning-survey"],     // journeyIds actually walked
      "navItems": [{ "label": "Notes", "location": "NotesListScreen" }],
      "portrait": "personas/field-surveyor.png",
      "scene": "personas/field-surveyor-scene.png"
    }
  ],

  // Set when the WHOLE catalog was authored without capture. The hub shows a
  // banner. Being honest here costs nothing; being caught costs the project.
  "synthetic": false,
  "syntheticNote": "Mapped from the SwiftUI navigation graph; no simulator available."
}
```

---

## `{featureId}.{surfaceId}.json`

```jsonc
{
  "featureId": "capture-note",
  "featureName": "Capturing a note",
  "type": "feature",                   // "feature" | "persona"
  "location": "CaptureScreen",
  "locations": ["CaptureScreen", "CaptureReviewScreen"],  // if it spans several
  "category": "capture",
  "surface": "iphone",                 // MUST match the filename's surface id
  "platform": "ios",
  "locale": "en",                      // BCP-47, when the app is localized

  "headline": "From a photo to a filed note in three taps",
  "overview": "Markdown. One paragraph framing what this feature is for.",
  "targetAudience": "Field surveyors filing notes offline",

  "steps": [
    {
      "stepNumber": 1,
      "title": "The capture screen, ready",
      // The interaction that produced THIS state. Required on every step
      // after the first — it's the evidence the walk advanced.
      "action": "Launched the app and tapped the camera tab.",
      "description": "Markdown. What the user is looking at and why it matters.",
      "screenshotFilename": "capture-note/iphone/step-01-ready.png",
      "screenshotAlt": "The capture screen with an empty note body",
      "location": "CaptureScreen",

      // Extra frames for ONE moment with several states — a streaming
      // response, a carousel, a multi-turn exchange. Not a way to avoid
      // writing separate steps for separate moments.
      "screenshotFrames": ["capture-note/iphone/step-01b-focused.png"],
      "frameCaptions": ["Ready", "Body field focused"],

      // For steps where timing or audio carries the meaning.
      "videoFilename": "capture-note/iphone/step-01.mp4",

      "annotations": [
        { "type": "tip", "text": "…" },        // tip | warning | important
      ],

      // live-walked (default, means "I really did this")
      // synthetic    (described from source — never captured)
      // gated-write  (surface reached; action deliberately not taken)
      "verificationStatus": "live-walked",

      "sourceFeature": "capture-note"           // persona walks only
    }
  ],

  "video": { "file": "capture-note/iphone/demo.mp4", "durationMs": 24000 },

  "keyFeatures": ["Works fully offline", "…"],
  "tips": ["…"],
  "personaInsights": ["…"],

  "generatedAt": "2026-09-17T11:02:00Z",
  "capturedAt": "2026-09-17T11:02:00Z",

  // GENUINE gaps only. Not "it was slow", not "tokens cost money".
  "note": "The sync-conflict screen needs two devices; not reproducible solo.",

  "synthetic": false,
  "syntheticReason": "…",

  // The anchor for drift detection.
  "targetSha": "0fee47c5b2…",
  "targetCommitDate": "2026-09-16T12:28:35+03:00"
}
```

### Step count

Fewer than 3 steps usually means the scenario stopped at the front door. One
step is flagged as `thin-walkthrough`. There's no upper bound — a long form
legitimately needs a dozen — but every step must be a *distinct* state reached
by a *recorded* action.

---

## `persona-{personaId}.{journeyId}.json`

```jsonc
{
  "personaId": "field-surveyor",
  "journeyId": "morning-survey",
  "headline": "A morning of surveys, filed before lunch",
  "overview": "Markdown. The arc in two or three sentences.",
  "payoff": "Eleven sites logged offline and synced in one pass.",
  "platform": "ios",
  "surface": "iphone",                 // default for scenes that don't say

  "scenes": [
    {
      "id": "arrive-on-site",
      "title": "Arriving with no signal",
      "narrative": "Markdown, in the persona's terms — what happened to *them*.",
      "frames": ["capture-note/iphone/step-01-ready.png"],
      "frameCaptions": ["The capture screen, offline"],
      "video": "personas/field-surveyor/scene-01.mp4",
      "location": "CaptureScreen",
      "surface": "iphone",             // override — journeys may change surface
      "sourceFeature": "capture-note", // links back to the feature walk
      "verificationStatus": "live-walked",
      "note": "Genuine gap, if any.",

      // Optional editorial framing. Omit and the reader applies a
      // deterministic cycle by index, so a journey that never sets this still
      // reads as though somebody laid it out.
      "layout": "full-bleed"           // full-bleed | split-left | split-right | inset
    }
  ],

  // Optional. Generated illustration of the persona AWAY from the screen,
  // woven between scenes. `afterScene` is a zero-based scene index; -1 opens
  // the journey. Written by `pnpm persona:moments`, not by hand.
  //
  // These are the one thing in this schema that is not evidence — nobody
  // observed them. The hub labels every one "Illustration" unconditionally.
  // See references/persona-media.md.
  "moments": [
    {
      "id": "setting-out",
      "image": "personas/field-surveyor-moment-setting-out.png",
      "caption": "First-person, present tense, at most ~14 words.",
      "afterScene": -1
    }
  ],

  "capturedAt": "2026-09-17T11:40:00Z",
  "targetSha": "0fee47c5b2…",
  "storyVideo": "personas/morning-survey-story.mp4"
}
```

**File naming.** `persona-{personaId}.json` is accepted for a persona with one
journey; `persona-{personaId}.{journeyId}.json` when there are several. Prefer
the second form even for one — a persona acquiring a second journey should not
require renaming the first.

**Scenes carry `frames[]`**, not one screenshot, because a moment in someone's
day is rarely one screen.

**A scene may override `surface`.** This is the point of the generalization: a
journey that starts at a desk and finishes on a phone is one journey, and the
old per-walkthrough `viewport` field could not describe it. The reader resolves
scene → journey → platform default and draws the matching frame, so getting it
wrong renders a phone capture in browser chrome and silently misstates what was
driven.

**`storyVideo` is resolved by convention too.** The hub looks for
`personas/{journeyId}-story.mp4`, then `personas/{personaId}-story.mp4`, so a
rendered video is picked up whether or not this field is written. A declared
path that doesn't exist on disk resolves to nothing rather than to a broken
player.

---

## `runs.json`

Append-only. See [`run-history.md`](run-history.md).

```jsonc
{
  "runs": [
    {
      "id": "2026-09-17T11:45:00Z",        // also the run id
      "startedAt": "2026-09-17T11:00:00Z",
      "completedAt": "2026-09-17T11:45:00Z",
      "skill": "walkthrough",
      "agent": "claude-opus-5",            // or "codex", "walk-wikipedia.mjs", …

      "target": {
        "sha": "0fee47c5b2…",              // full 40 chars
        "shaShort": "0fee47c5",
        "branch": "main",
        "dirty": false,
        "commitDate": "2026-09-16T12:28:35+03:00",
        "commitSubject": "fix: offline queue flush order",
        "watchPath": "apps/ios"            // repo-relative; scopes the diff
      },

      "config": {
        "platform": "ios",
        "driver": "ios-simulator",
        "capturedAgainst": "iPhone 17 Pro · iOS 26.0",
        "env": { "FIELDNOTE_ENV": "staging" },
        "surfaces": ["iphone"],
        "locales": ["en"],
        "notes": "Camera permission pre-granted via simctl."
      },

      "coverage": {
        "features": ["capture-note", "notes-list"],
        "personas": ["field-surveyor"],
        "screenshots": 24,
        "videos": 1,
        "issues": 2
      }
    }
  ]
}
```

---

## `fixes.json`

```jsonc
{
  "fixes": [
    {
      "id": "offline-queue-order",
      "title": "Notes filed offline synced out of order",
      "description": "Markdown.",
      "location": "NotesListScreen",
      "featureId": "notes-list",
      "commit": "a1b2c3d4…",
      "prUrl": "https://github.com/acme/fieldnote/pull/412",
      "issueUrl": "https://github.com/acme/fieldnote/issues/408",
      "fixedAt": "2026-09-16T12:28:35+03:00",
      "verifiedAt": "2026-09-17T11:20:00Z",
      "beforeScreenshot": "fixes/offline-queue-order/before.png",
      "afterScreenshot":  "fixes/offline-queue-order/after.png",
      "status": "verified",              // verified | unverified | regressed
      "surface": "iphone"
    }
  ]
}
```

A fix with no after-capture is `unverified`, not omitted. "We believe this is
fixed" and "we watched it work" are different claims.

---

## `issues.json`

```jsonc
{
  "issues": [
    {
      "id": "ipad-capture-clipped",
      "featureId": "capture-note",
      "location": "CaptureScreen",
      "surface": "ipad",
      "severity": "major",               // blocker | major | minor | polish
      "title": "Capture body is clipped in landscape on iPad",
      "detail": "Markdown.",
      "evidence": "Constraint conflict logged: NSLayoutConstraint …",
      "screenshot": "issues/ipad-capture-clipped.png",
      "foundAt": "2026-09-17T11:10:00Z",
      "status": "open"                   // open | fixed | wontfix
    }
  ]
}
```

Record issues as you hit them. You're the only one looking, and an issue with
its console evidence attached is worth far more than a bug report written from
memory a day later.

---

## Markdown

`description`, `overview`, `narrative`, `detail`, `tips[]` and `keyFeatures[]`
render through the hub's `<Prose>` component. Use `**bold**`, `*italic*`,
`` `code` ``, `[links](href)` and bullet lists freely. Do **not** escape or
flatten them — you'll get literal asterisks on the page.

Raw HTML is escaped, so don't reach for it.
