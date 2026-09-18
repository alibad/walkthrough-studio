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
| **Retina deviceScaleFactor** | ✅ 2880×1800 | ✅ 2880×1800 | ❌ 1512×775, dpr 1 | ❌ dpr 1 | ❌ display-bound |
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

The Chrome extension produced **1512×775 JPEG** — exactly CSS pixels, at the
display's own `devicePixelRatio` of 1. There is no `deviceScaleFactor`
parameter anywhere in its surface, so this is not a setting that was missed; it
is a capability that does not exist. The format matters independently: JPEG
re-encoding softens UI text, and a lossy artifact is a poor thing to hand a
reader who is deciding whether to trust it.

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
