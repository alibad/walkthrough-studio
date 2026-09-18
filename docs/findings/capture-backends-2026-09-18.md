# Should the walkthrough system be rebuilt agent-first?

**Measured 2026-09-18. Short answer: no — but not because agents are worse.
The axis that matters is not agent versus Playwright, it is CDP-grade control
versus screenshot-grade observation, and agents can sit on either side of it.**

The question posed was whether the Chrome extension and computer use, now that
both exist, should become the primary capture path with Playwright kept as a
fallback. The hypothesis worth testing explicitly was the inverse: that agents
are better at **discovery** while Playwright stays better at **capture**.

The measurements support the inverse hypothesis, with one correction. The
capture boundary does not fall between "agent" and "Playwright" at all. It
falls between backends that speak the Chrome DevTools Protocol — which
includes an agent-driven one — and backends that can only look at a screen.

> **⚠️ Read the addendum at the bottom before acting on this document.** Three
> claims below were corrected the same day: the extension is *display-bound*
> rather than capped at 1x, an extension **can** reach CDP-grade via the
> `chrome.debugger` permission, and this document never tested real mobile at
> all — the iOS Simulator turns out to meet the determinism invariant with no
> injection whatsoever. The ordering of the conclusion changed as a result.

---

## How this was measured

A self-reporting probe page served over localhost reports `devicePixelRatio`,
`innerWidth`, the user agent, `maxTouchPoints`, `pointer: coarse`, a
`localStorage` marker written once per browser context, the document cookie,
and emits a console log, a warning, an error, a 200 and a deliberate 500. A
second page carries nothing but two CSS animations, so animation determinism
can be tested without a clock confusing the result.

Each backend was then asked to do the same things, and **the artifact was
measured rather than the configuration trusted**. That distinction turned out
to matter, and it is the finding that shaped the architecture more than any
other — see "the resize that wasn't" below.

Raw measurements: [`measurements.json`](./measurements-2026-09-18.json).

---

## Per-invariant results

| Invariant | Playwright | chrome-devtools MCP (CDP) | Claude-in-Chrome extension | Built-in browser pane | computer use |
|---|---|---|---|---|---|
| **Retina deviceScaleFactor** | ✅ 2880×1800 | ✅ 2880×1800 | ⚠️ display-bound (see addendum) | ❌ dpr 1 | ❌ display-bound |
| **Lossless format** | ✅ PNG | ✅ PNG | ❌ JPEG | ❌ no file | ❌ no file |
| **Animations disabled** | ✅ native flag | ⚠️ not native, injectable | ❌ no control | ❌ no control | ❌ |
| **Time frozen** | ✅ `clock` API | ❌ no equivalent | ❌ | ❌ | ❌ |
| **Fresh context per feature** | ✅ distinct markers | ✅ `isolatedContext` | ❌ shared real profile | ❌ one session | ❌ |
| **Real mobile emulation** | ✅ dpr 3 / touch / UA | ✅ dpr 3 / touch / UA | ❌ no-op | ⚠️ partial | ❌ |
| **Video recording** | ✅ 140 KB webm | ❌ none | ❌ annotated GIF only | ❌ | ❌ |
| **Console + network** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Byte-addressable artifact** | ✅ | ✅ (workspace roots) | ❌ opaque id | ❌ | ❌ |

### Retina

Playwright at `1440×900` with `deviceScaleFactor: 2` produced a **2880×1800**
PNG. chrome-devtools MCP with `emulate viewport: "1440x900x2"` produced the
same 2880×1800 PNG on disk.

The Chrome extension produced **1512×775 JPEG** — exactly CSS pixels, at this
display's `devicePixelRatio` of 1.

⚠️ **The original conclusion drawn from this was wrong; see Correction 1 in the
addendum.** `captureVisibleTab` returns `innerWidth × devicePixelRatio`, so this
was 1x because the window sat on a non-Retina external monitor, not because the
API caps there. The real defect is that there is no parameter to *choose* the
ratio: the artifact's resolution follows whichever display the window is on, so
the same walk yields different resolutions docked and undocked.

The format finding stands independently: JPEG re-encoding softens UI text, and a
lossy artifact is a poor thing to hand a reader who is deciding whether to trust
it.

### Animations disabled

Two captures of the CSS-only page, 900 ms apart:

- Playwright with `animations: "disabled"` → **byte-identical**. Without the
  flag → different. The flag is load-bearing, not decorative.
- chrome-devtools MCP, no such flag → different. After injecting
  `animation: none; transition: none` → **byte-identical**.

So the invariant is not a property of the backend. It is a property of the
capture layer, and the layer can enforce it on a backend that lacks the flag.
This is the single most useful result in the whole exercise, because it
generalises: **most invariants can be moved out of the backend and into one
enforcing layer, and then verified.**

One correction to my own first attempt, recorded because it nearly produced a
wrong answer: the initial probe page had a `setInterval` clock on it, so
"animations disabled" appeared to fail on Playwright. It had not failed —
`animations: "disabled"` freezes CSS animation and does not touch JS-driven DOM
changes. Separating the two pages was what made the result readable.

### Time frozen — an invariant that did not previously exist

That mistake exposed a real hole. A page with a live clock, a "3 minutes ago"
label, or a `requestAnimationFrame` counter produces byte-**different**
captures of an unchanged screen. The MD5 duplicate guard therefore cannot fire
on such a page: the check still runs, it just can never catch anything.

Playwright's `clock.setFixedTime` closes it — a page with a 37 ms interval
clock captured byte-identical 1.2 s apart. `pauseAt` also works but is unsafe
as a default: it stops timers firing at all, which hangs any app whose loading
path goes through a debounce or a retry.

No other backend has an equivalent. This is now a declared capability, and the
run manifest records which runs actually had it.

### Fresh context per feature

Playwright: two contexts, two different storage markers. chrome-devtools MCP
with `isolatedContext`: two different markers, and `document.cookie` carrying
only the page's own 21-byte cookie.

The Chrome extension: the probe page rendered **the operator's real browser
profile** — analytics, product-analytics and session cookie classes from
everyday browsing. Two consequences, and the second is the serious one:

1. State cannot be isolated between features, so captures document a session
   no user ever had.
2. A capture of a real application, published, would carry the operator's own
   identity into the artifact.

### Real mobile emulation

Playwright and CDP both delivered dpr 3, a 393 px layout viewport, an iPhone
user agent, `maxTouchPoints: 1` and `pointer: coarse`.

The extension's `resize_window(393, 852)` returned:

> Successfully resized window containing tab 1345119719 to 393x852 pixels

Two seconds later the page still reported `innerWidth` 1512, `outerWidth` 1512,
dpr 1, `maxTouchPoints` 0, and `max-width: 768px` → false. The window had not
resized. And even had it resized, the API has `width` and `height` only — no
device scale, no user agent, no touch — so it would have produced a narrow
desktop window, which is the exact anti-pattern the existing walk script warns
about in a comment.

**This one result changed the architecture.** A backend can report success and
deliver nothing. Therefore the capture layer verifies by measurement: it asks
the page what it got and the file how many pixels it has. "I set dpr 2" and
"this file has twice the pixels" are different claims, and only the second one
is the artifact.

The built-in browser pane is the interesting partial: its mobile preset gives
dpr 2, five touch points, an Android UA, and `screen`/`visualViewport` of
375×812 — and CSS media queries resolve correctly, so a responsive site really
does serve its mobile layout. But `window.innerWidth` reports 893. I nearly
wrote that it serves the desktop layout; checking the media queries before
claiming it is the only reason that error is not in this document. The true
statement is narrower: **CSS-driven responsive layout is correct there,
JS-driven responsive logic sees the wrong width.**

### Video

Playwright produced a 140 KB webm of a two-page flow. chrome-devtools MCP has
no video tool at all. The extension has `gif_creator`, whose documented
defaults burn a Claude watermark, orange click indicators, action labels and a
progress bar into the output — useful for showing a person what an agent did,
not usable as clean evidence of what an app looks like.

### Console and network

Every browser backend passed this, including both agent surfaces. Each captured
the deliberate console error and the `500` on `/api/boom` with its path. This
is the one invariant where the agent tools are fully competitive.

### Computer use

Disqualified structurally, and by the platform itself rather than by my
measurement. Requesting access to Chrome returned:

> browser applications can only ever be granted in 'read' mode, so you cannot
> use them to interact with websites […] For all other browser interaction
> (navigating, clicking, typing, filling forms), you must use the Claude in
> Chrome extension MCP instead.

It can see a browser; it cannot drive one. `app_screenshot` also has no
`filePath`, so there is no byte-addressable artifact. None of this makes it a
bad tool — it remains the right driver for **native desktop apps**, which is a
different platform in this schema, not a web backend.

*Not tested here: Codex's Chrome extension.* I have no way to drive it from
this session, so it is absent from the table rather than guessed at. The
constraint that produced the Claude extension's results is architectural — a
Chrome extension capturing through the tab-capture API inherits the display's
pixel ratio and cannot override device metrics without the debugger
(CDP) permission — so I would *expect* similar numbers. That expectation is an
inference, and it is not evidence.

---

## The discovery half of the hypothesis

Tested against openstage, the app that matters for the talk.

A static scan of `src/app` finds 17 page routes. Driving the app found things
the route tree cannot express:

- **`/ai-patterns` renders perfectly and is absent from the gallery.** It
  carries `status: "draft"` in the registry. A route scan sees a route; only
  the running app distinguishes *exists* from *is offered*.
- **The gallery's substance is interaction, not navigation** — search, a type
  filter, a grouping control, a list/grid toggle. None is a route. A catalog
  built from routes alone documents a page that appears to do nothing.
- **Three defects that only exist at runtime**: a React hydration mismatch on
  the gallery, an `<svg> attribute height: Expected length, "auto"` error in a
  deck, and a horizontal overflow that widens the layout viewport to 560 px on
  a 393 px phone.
- **An admin gate that fails open.** `/admin` served its full dashboard to a
  browser context with no cookies, because `src/middleware.ts` wraps the cookie
  check in `if (adminPassword)` and the variable is unset locally.

Every one of those required driving the app. None required an *agent* in the
capture loop — a script found them too, once it was pointed at the right
places. What the agent contributed was **knowing where to point it**: which of
17 routes are real surfaces, that the gallery's filter pills are the feature,
that `/share/[id]` needs an id that does not exist yet.

That is the honest shape of the discovery claim. Agents are better at deciding
*what* to walk. They are not better at walking it.

---

## The correction to the original hypothesis

The proposed framing was **agent-plans / Playwright-executes**. That is nearly
right, and one measurement refines it: chrome-devtools MCP is an *agent-facing*
tool that meets every pixel invariant. Retina, real mobile emulation, isolated
contexts, PNG output at a chosen path. It fails only on video, and on time
freezing.

So the boundary is not agent-versus-Playwright. It is:

> **CDP-grade control** (Playwright, chrome-devtools MCP, raw CDP) — can be
> trusted with capture, once the layer verifies what it delivered.
>
> **Screenshot-grade observation** (Chrome extension, browser pane, computer
> use) — can be trusted with looking, navigating and reporting, and must never
> be trusted with the artifact.

An agent can drive either. What it must not do is publish from the second kind.

---

## What was built from this

1. **The invariants moved out of the walk script** into
   `scripts/lib/capture/invariants.mjs`, where each assertion carries the
   failure that motivated it.

2. **A driver contract** (`driver-contract.mjs`) with two implementations:
   Playwright (default; the only one with video and a clock) and a raw CDP
   driver over Node 22's built-in `WebSocket` — zero dependencies, no 94 MiB
   browser download, and able to attach to a Chrome a human has already signed
   into, which is the only way past an SSO or MFA gate.

3. **A session layer** that applies every invariant identically and, crucially,
   *verifies* rather than trusts. Running the same walk through both backends:

   ```
   playwright  verified: retina, animationsFrozen, timeFrozen,
                         consoleNetwork, video, realMobile, freshContext
   cdp         verified: retina, animationsFrozen, consoleNetwork,
                         realMobile, freshContext
               declared false: video, animationsFrozen, timeFrozen
   ```

   Note the CDP row: it **declares** `animationsFrozen: false` and the session
   still **verified it true**, because the layer injected the freeze CSS and
   then measured the result. That is the architecture working — the guarantee
   belongs to the layer, not the backend, and the declaration is a starting
   assumption the measurement overrules.

4. **Honest degradation.** A backend that cannot record video does not silently
   skip it; the run manifest records `invariantsUnverified` and a note saying
   which artifacts this run does not have.

`node scripts/verify-capture-layer.mjs` runs the same walk through every
backend and prints the table. It is the regression test for all of the above.

---

## What would change this conclusion

- **A Chrome extension exposing the debugger permission.** Device metrics,
  PNG output and a real file path would move it straight into the first
  category. The only thing standing between it and CDP-grade is an API surface.
- **A screencast-to-file path over raw CDP.** `Page.startScreencast` emits
  frames; muxing them would close the one gap that keeps Playwright the
  default.
- **Any measurement here being reproduced and contradicted.** The numbers are
  from one machine on one day. Re-run `scripts/verify-capture-layer.mjs`
  before trusting this document — which is the same standard this project
  applies to everything else it publishes.

---

# Addendum, same day — three corrections and the mobile question

Written after a challenge to the conclusion above: *"computer use and the Chrome
browser extensions are the most powerful."* That challenge was substantially
right about something the original document got wrong, and it exposed two
factual errors. Both are corrected here rather than quietly edited above,
because a silently-fixed document teaches nothing.

## Correction 1 — the extension is not "1x". It is *display-bound*, which is worse.

The original said the extension captures at 1x. The measurement was real
(1512×775, dpr 1) but the **conclusion drawn from it was wrong**.
`chrome.tabs.captureVisibleTab` returns an image of `innerWidth × innerHeight ×
devicePixelRatio`. It produced 1x here because this machine's browser window sat
on a non-Retina external display (3840×1080, dpr 1). On a Retina laptop screen
the same call returns 2x.

The real limitation is not the ceiling, it is the **lack of a floor**: there is
no parameter to *choose* the pixel ratio, so the resolution of an artifact
depends on which monitor the window happened to be on. Two runs of the same walk
on the same machine produce different resolutions if the laptop was docked for
one of them. For a system whose premise is comparable artifacts, an
uncontrollable capture density is a worse property than a low one.

## Correction 2 — an extension *can* reach CDP-grade. This one does not.

The original treated "Chrome extension" as a capability tier. It is not. An
extension that requests the `chrome.debugger` permission gets the DevTools
Protocol, including `Page.captureScreenshot` and
`Emulation.setDeviceMetricsOverride` — the exact two calls that carry every
pixel invariant. So a purpose-built capture extension could sit in the top tier.

The cost is that Chrome shows an unsuppressible infobar — *"This tab is being
controlled by automated test software"* — for as long as the debugger is
attached. For a general-purpose assistant extension that is a bad trade, which
is presumably why the one measured here uses `captureVisibleTab` instead.

**So the correct statement is about the API a tool chose, not about the
category it belongs to.** "Extensions are screenshot-grade" was wrong;
"this extension is screenshot-grade, and the category's ceiling is CDP" is right.

## Correction 3 — the original never tested real mobile at all

The most substantive gap. The document compared *mobile emulation inside a
desktop browser* and never touched a simulator or a device, then concluded about
"real mobile emulation" as if that settled mobile. It did not.

Measured on the iOS Simulator (iPhone 17, iOS 26.5), against production:

| | Result |
|---|---|
| `xcrun simctl io <udid> screenshot` | **1206×2622 PNG**, native 3x Retina, **0.46 s** |
| `xcrun simctl io <udid> recordVideo --codec h264` | h264 `.mp4`, works |
| Two captures 4 s apart, page loaded | **byte-identical** |
| Injection required to achieve that | **none** |
| Engine | real WebKit, real iOS Safari, real Safari chrome |
| Driving | tap by device points works; navigated into a deck and captured the result |

The determinism result deserves emphasis. On the web side, byte-identical
captures required injecting freeze CSS, finishing Web Animations *and* pinning
the clock. On iOS, `simctl status_bar override --time "09:41"` freezes the
status bar — Apple built it for App Store screenshots — and the rest followed
with no injection at all. **A platform-native feature did for free what the web
path needed three mechanisms to approximate.**

## But the fidelity argument for real devices is weaker than expected

Having built the case for simulators, the fair test undercuts part of it. The
same production page, rendered by Chromium mobile emulation and by Playwright's
**real WebKit** build:

```
chromium-emulated   innerWidth 393, dpr 3, scrollWidth 393, no overflow, 9 links
webkit              innerWidth 393, dpr 3, scrollWidth 393, no overflow, 9 links
```

Identical on every measured axis, and the WebKit screenshot matches the
simulator's page area. Playwright ships a real WebKit build, so **mobile-web
engine fidelity does not require a simulator.** Published guidance puts
Playwright WebKit at roughly 80–90% of WebKit-specific bugs, with real devices
needed for iOS-specific scrolling, fixed positioning, viewport resize behaviour
around the address bar, GPU and memory pressure.

So the simulator's unique contributions to *mobile web* are narrower than they
first appear: the real Safari chrome, the real status bar, iOS viewport
behaviour, and the last 10–20% of engine quirks. Its unique contribution to
**native mobile apps** is total — nothing else can capture them at all.

## What this changes in the conclusion

The original ordered its questions badly. It asked "which backend produces the
best artifact?" first, when the first question is **"can you reach the app at
all?"** and the second is **"can you get past the front door?"**. Fidelity is
third. A perfect capture of an app you cannot reach is worth nothing, and on
reach the challenge was correct: simulator and desktop control are not
fallbacks, they are the only option for native apps and for gates only a human
can pass.

The revised rule is a ladder, not a verdict:

1. **Native app, desktop app, or CLI** → simulator / emulator / desktop control.
   Nothing else can reach it. Not a fallback — the only path.
2. **Web behind a gate no script can pass** (SSO with a hardware key, MFA push)
   → attach to a browser session a human has already authenticated. The CDP
   driver exists for this.
3. **Web, otherwise** → CDP-grade automation. Playwright by default for video
   and the clock API; Playwright's WebKit build for mobile-web fidelity.
4. **Anything screenshot-grade** (`captureVisibleTab`-class extensions, desktop
   screen capture of a browser) → good for looking, navigating, exploring and
   reporting. Never the source of a published artifact, because the surface
   cannot be pinned and the state cannot be isolated.

The one unchanged conclusion: whichever rung you are on, the invariants are
enforced and verified by the layer, not trusted from the tool.

## Method note — an error this exercise caught

The registry entry written earlier that day gave openstage's production host as
`present.openstage.humanquest.net`. Loading it on the simulator returned
*"Safari can't open the page because the server can't be found."* It is
NXDOMAIN; the real host is `present.humanquest.net`. The hostname had been
inferred from a changelog line rather than resolved, which is precisely the
class of invented fact this project exists to prevent. Corrected in
`apps/hub/projects.json`.

A second near-miss: the openstage **dev server** never finished loading in real
mobile Safari — a spinner still turning after 30 seconds — which looked like a
serious WebKit bug. Production loaded perfectly. The difference was the dev
server, not the app. Testing production before writing it up is the only reason
that is a note here instead of a false finding in `issues.json`.

---

# Addendum 2 — what the APIs actually guarantee, and what the industry chose

Researched against Chromium source and vendor documentation rather than
measured locally. This section supersedes the loose language about
"extensions" in the original.

## `chrome.tabs.captureVisibleTab` — the hard ceiling, from the source

- Captures at **physical device pixels** = CSS px × `devicePixelRatio`. The
  implementation passes an empty output size to `CopyFromSurface`, meaning "no
  rescale", so you get the compositor surface at its native device scale.
- The undocumented `scale` parameter is **not an upscaler** — it only converts
  a supplied `rect` from CSS px to device px for cropping. There is no way to
  ask for more pixels than the window physically occupies on screen.
- **Default format is JPEG at quality 90**, not PNG. This explains the JPEG
  measured earlier: nothing had chosen it, it is simply the default.
- **Viewport only.** No full-page capture; scroll-and-stitch is the only
  non-debugger route.
- Throttled to 2 calls/second, *except* that a user-gesture-initiated call
  bypasses the quota entirely.

So the ceiling is "whatever this monitor is", and the floor is "no control at
all". Both matter for a system that wants comparable artifacts.

## `chrome.debugger` — the ceiling is CDP, and the price is a banner

An extension declaring `"debugger"` gets the real DevTools Protocol:
`Page.captureScreenshot` (png/jpeg/**webp**, `clip.scale`,
`captureBeyondViewport` for single-shot full page) and
`Emulation.setDeviceMetricsOverride` with an **arbitrary `deviceScaleFactor`,
independent of the physical display** — a 1× monitor can produce a 2560×1600
capture of a 1280×800 viewport. It is the same mechanism Puppeteer uses.

The price is not subtle:

- A `GlobalConfirmInfoBar` across **every** tab: *"⟨Extension⟩ started debugging
  this browser"*. Chromium's own string description notes it does not disappear
  until dismissed, **even after the debugger detaches**. Suppressible only with
  a launch flag unavailable to a normally-installed extension.
- The two harshest install warnings Chrome issues: *"Access the page debugger
  backend"* and *"Read and change all your data on all websites."*
- Opening DevTools on the attached tab force-detaches the extension.
- **Chrome 155 (stable 2026-10-06, roughly three weeks from this writing)**
  begins enforcing `runtime_blocked_hosts`, `DisableScreenshots` and DLP
  against `chrome.debugger`. Unmanaged consumer Chrome is unaffected; managed
  fleets are.

There is **no** way to set `deviceScaleFactor` or emulate a mobile device
without it. `chrome.system.display` only reads; `chrome.tabs.setZoom` raises
`devicePixelRatio` while enlarging CSS pixels by the same factor, netting zero
extra physical pixels; UA spoofing via `declarativeNetRequest` changes the
header and `navigator.userAgent` and triggers none of viewport-meta handling,
touch emulation, overlay scrollbars or text autosizing.

## What the companies who do this for a living actually chose

Seven products examined — Scribe, Arcade, Supademo, Guidde, Tango, Loom,
Screen Studio. **Not one of them declares the `debugger` permission.** Every
browser-side capture among them is therefore viewport-only, at the display's
own pixel ratio.

The sharpest single piece of evidence is Loom's own encoding documentation:

| | Codec / container | Ceiling |
|---|---|---|
| Loom **extension** | VP8/VP9, DASH/WebM | 1080p |
| Loom **desktop app** | H.264, HLS/TS | 4K |

VP8-in-WebM is exactly what `MediaRecorder` over a `tabCapture` stream
produces. The extension is on the browser-API path; the desktop app is not.
Screen Studio goes further and ships **no extension at all** — macOS only,
on ScreenCaptureKit.

**This is the strongest argument for the challenge, and it deserves stating
plainly:** the industry's high-quality path is a *native app capturing the
screen*, not a headless browser. Nobody building product-walkthrough tooling
reaches for Playwright.

## Why this project still should

Because the products above answer a different question. Scribe, Arcade and
Tango exist to record **what this person did, in their real session, with their
real data** — and for that, capturing the operator's actual browser is not a
compromise, it is the requirement. Shared profile, display-native resolution
and browser chrome in the frame are all *correct* for that job.

This project's artifacts have to be **comparable across runs and isolated from
whoever ran them**: same surface every time, no operator identity in the
pixels, a duplicate check that means something. Those need a pinned
`deviceScaleFactor`, a fresh context per feature and a frozen clock — three
things the screenshot-grade path cannot provide and the native-app path does
not try to.

Different goal, different tool. Neither choice is wrong in general.

## Mobile, completed

The Android side has the equivalent of the iOS status-bar trick, which the
original document assumed did not exist:

```bash
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 1231
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false
```

`adb shell screenrecord`: **no audio**, H.264/MP4, 20 Mbps default,
display-resolution by default. ⚠️ **Two things developer.android.com still says
are false** — see Addendum 5. `adb exec-out screencap -p` gives PNG.

**A caveat on simulator video, measured here with `ffprobe`:**

```
codec h264 · 1206x2622 · pix_fmt yuv420p
r_frame_rate 25/2 · avg_frame_rate 420/373 (~1.13 fps) · 7 frames over ~6s
```

`yuv420p` means 4:2:0 chroma subsampling — lossy on exactly the coloured UI
text these artifacts are made of — and the frame rate is **variable**, with a
near-static screen emitting almost no frames. Simulator video is fine as
illustration of a flow and is **not** evidence at the level a PNG is. Worth
checking the same two properties on `screenrecord` before relying on it.

## Unverified, and left that way

- Whether SystemUI Demo Mode still works unmodified on Android 14/15/16, and
  whether it now needs DUMP permission or root.
- Real-device cloud vendors (BrowserStack, Sauce, Firebase Test Lab, AWS Device
  Farm): whether raw high-fidelity files can be extracted, or only viewed.
- Retina behaviour of Scribe, Guidde, Tango and Supademo's screenshot mode —
  none publish it, and the `captureVisibleTab` inference is from permission
  sets rather than documentation.

---

# Addendum 3 — real-device clouds, and an inconvenient endorsement

If real devices beat emulation, the device clouds are where you would go. They
were checked. The result is more equivocal than expected.

**No vendor — BrowserStack, Sauce Labs, Firebase Test Lab, AWS Device Farm —
documents the resolution, codec or compression of its platform-generated
screenshots or video.** Not one page states a native resolution, a scale factor
or a re-encode policy. For a system that measures the artifact rather than
trusting the tool, four vendors offering unspecified fidelity is a poor
foundation.

The defensible pattern is therefore the same one this project already uses:
**take the capture yourself, with a call whose output you can measure, and
retrieve the file byte-for-byte.** Two clouds support that end to end —
AWS Device Farm (your test writes to `$DEVICEFARM_SCREENSHOT_PATH`, retrieved
via presigned S3, 400-day retention) and Firebase Test Lab (AndroidX
`Screenshot.capture()` into a GCS bucket you own). BrowserStack's Espresso
screenshots are genuine on-device PNGs with **no documented download API** —
visible in the dashboard, unreachable programmatically. Sauce caps
platform screenshots at 150 and offers none at all for XCUITest.

Other constraints worth knowing before choosing this path: Firebase Test Lab
**cannot record video on iOS 18 or later**; AWS Device Farm truncates video
beyond 1 GB and may drop artifacts beyond 4 GB per run; Sauce documents
"approximately 99% reliability" for real-device video, and its live-view stream
is lossy JPEG.

## The endorsement that cuts against the real-device argument

Firebase Test Lab's own documentation, on screenshot-comparison testing:

> Such tests may be more brittle on some device types than others. We recommend
> targeting Arm (`*.arm`) **emulator** devices for these kinds of tests.

Google, who sell access to physical devices, advise using **emulators** when the
thing you care about is comparing screenshots. That is the determinism-versus-
reach trade-off stated by a source with every commercial incentive to say the
opposite, and it is the clearest external support for the position this document
arrived at independently: real hardware wins on reach and on last-mile engine
behaviour, and *loses* on reproducibility — which is the property an artifact
archive is built on.

Retention, for planning: Sauce 30 days, BrowserStack 30 (video) / 60 (text
logs), Firebase 90 in the default bucket and unlimited in your own, AWS 400.

---

# Addendum 4 — retracting "Playwright's WebKit is close enough to iOS Safari"

Addendum 1 concluded, from one page that rendered identically in both, that
"mobile-web engine fidelity does not require a simulator." **That conclusion is
withdrawn.** The page tested happened not to exercise any of the axes where the
two diverge, and generalising from it was exactly the mistake this project
exists to prevent: a single agreeing measurement is not evidence of general
agreement.

## The measurement that retracts it

A page that reads the dynamic viewport units directly, run in both:

| | Playwright WebKit (`iPhone 14 Pro` descriptor) | Real iOS Safari (iPhone 17 Simulator) |
|---|---|---|
| `100svh` | 660 | **714** |
| `100lvh` | 660 | **754** |
| `lvh − svh` | **0** | **40px** |
| `navigator.platform` | `MacIntel` | `iPhone` |
| `navigator.maxTouchPoints` | **0** (despite `hasTouch: true`) | **5** |
| `env(safe-area-inset-bottom)` | `0px` | `0px` *(matched here)* |

`lvh − svh` is the height of the Safari URL bar. Playwright has one fixed
viewport and no browser chrome, so the small and large viewport units **collapse
to a single number**. Every layout bug that appears when the URL bar retracts —
a sticky footer that jumps, a full-height hero that clips, a modal whose action
row slides under the chrome — is **structurally invisible** to it. Not
"sometimes missed": it cannot be expressed.

`maxTouchPoints: 0` while `hasTouch: true` is its own trap, since feature
detection written as `navigator.maxTouchPoints > 0` takes the desktop branch.

## Why the gap exists

Playwright's own documentation is explicit:

> Playwright's WebKit is derived from the latest WebKit main branch sources,
> often before these updates are incorporated into Apple Safari. […] **Playwright
> doesn't work with the branded version of Safari since it relies on patches.**

The patch set over upstream WebKit `main` is roughly 20,000 lines across 361
files, and on Linux it runs the **GTK and WPE** ports rather than anything Apple
ships. Text is shaped by Uniscribe or FreeType rather than CoreText, which alone
makes pixel-diffing its output against iOS unreliable by construction.

By contrast the iOS Simulator runtime ships a real `MobileSafari.app` and a
`WebKit.framework` built for `PLATFORM_IOSSIMULATOR` — **the same Safari source,
recompiled**, running arm64 natively. That is a categorically different artifact
from a patched desktop port, and the `svh`/`lvh` result is the behavioural proof.

## The corrected position

- **Playwright WebKit**: good for logic, standards behaviour and WebKit-specific
  JavaScript regressions. **Not evidence about how a page looks on an iPhone.**
- **iOS Simulator**: real Safari, real WebKit, real device pixels, real dynamic
  viewport behaviour. The right tool for a mobile-web *screenshot*. Still a poor
  proxy for performance, GPU, colour gamut and DRM.
- **`safaridriver` against a tethered iPhone** is the Apple-supported,
  standards-based path to the real thing: `platformName: "iOS"` with
  `safari:deviceUDID`, and W3C `Take Screenshot` returning CSS px × DPR.

So the mobile recommendation in Addendum 1 inverts. **For mobile-web captures
that are meant to be looked at, prefer the Simulator over Playwright's WebKit.**
Keep Playwright for the desktop surface and for logic.

## Also worth knowing, found in the same pass

Apple shipped a first-party browser-automation MCP server — `safaridriver --mcp`
— stable in Safari 27.0. Its `screenshot` tool writes a PNG to a path you choose
and supports `full_page`. It appears to be **macOS-only**: none of its tool
schemas exposes a device or UDID parameter, unlike classic safaridriver's
capabilities. Treat iOS support as absent until demonstrated.

WebDriver BiDi is not an option here: Safari 27.0 currently passes **0 of 4631**
BiDi web-platform subtests.

---

# Addendum 5 — Android, from AOSP source rather than the docs page

The Android notes in Addendum 2 were taken from `developer.android.com`. Checked
against AOSP by diffing release tags, **two load-bearing statements on that page
are stale**, and both were repeated here before being caught.

## `screenrecord`'s 180-second cap was removed in Android 14

The docs still say *"The default and maximum value is 180 (3 minutes)."*
Diffing `frameworks/av/cmds/screenrecord/screenrecord.cpp`:

| Release | Behaviour |
|---|---|
| Android 13 | `if (gTimeLimitSec == 0 \|\| gTimeLimitSec > kMaxTimeLimitSec) { … "outside acceptable range [1,180]"; return 2; }` — a real hard cap |
| Android 14 → main | Cap **removed**. `--time-limit 0` means unlimited; 180 survives only as the *default* |

## Rotation during recording was fixed in Android 14

The docs say rotation *"is not supported… some of the screen is cut off."*
`updateDisplayProjection()` is now called every encoder-loop iteration and
re-applies the projection when orientation changes — 0 occurrences in Android
13, 3 in Android 14 and later.

**The pattern is the finding.** Twice now, a current vendor documentation page
has asserted a limitation that the source contradicts. For anything that
determines whether an artifact is capturable, check the source for the version
you actually target.

## Things worth knowing that the docs do not say

- **`screencap` returns the *logical* display size, not the panel's.** They
  diverge whenever `wm size` has been overridden, and `screencap` returns the
  override. Run `adb shell wm size` before trusting a golden image.
- **Colour profile travels with the PNG.** `screencap -p` compresses at quality
  100 and passes the display's dataspace through, so a Display-P3 panel yields a
  P3-tagged PNG. Cross-device byte comparison fails on this alone — which
  matters directly for a duplicate-capture guard.
- Android 16 adds `-j` (JPEG) which attaches an **HDR gainmap**. Prefer `-p`.
- **`FLAG_SECURE` content captures as black** and no adb-reachable permission
  changes that. Android 15+ debuggable builds only have an escape hatch in
  `Settings.Secure.disable_secure_windows`; it silently no-ops on user builds.
- **`am instrument --no-window-animation` beats `settings put global`** for
  animation freezing: it zeroes all three scales and restores them in a
  `finally`, so a crashed run does not leave the device permanently altered.
  The `settings put` form leaks broken state.
- **Demo Mode needs `DUMP`, not root.** `com.android.shell` holds it and shares
  UID 2000, so plain `adb shell am broadcast` qualifies; the `adb root` in
  AOSP's own example is habit, not requirement. `sysui_demo_allowed` is a hard
  gate — without it every broadcast is silently swallowed. Demo mode does **not**
  survive a SystemUI restart.
- **On emulators, prefer host-side capture.** `screencap` runs in the guest
  against SurfaceFlinger, so host window size, zoom and skin are irrelevant and
  resolution parity holds. But guest `screenrecord` goes through the emulated
  H.264 encoder, which is where emulator recording failures originate —
  `adb emu screenrecord screenshot` and the emulator's gRPC
  `EmulatorController/getScreenshot` bypass it.
- ⚠️ **Security note if the gRPC route is used:** starting the emulator with
  `-grpc <port>` binds **all interfaces with authentication off**. The
  auto-assigned default binds loopback with token auth. Add `-grpc-use-token`.
