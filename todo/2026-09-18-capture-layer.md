# 2026-09-18 — The capture layer, the schema reconciliation, and openstage walked

## The question that started it

Claude and Codex both have Chrome extensions now, and computer use exists.
Should the walkthrough system be rebuilt agent-first, with Playwright kept only
as a fallback?

**It should not — and the reason is more useful than the answer.** The boundary
that matters is not agent versus Playwright. It is backends that speak the
Chrome DevTools Protocol versus backends that can only look at a screen, and an
agent can drive either kind.

Established by measurement, not opinion:
[`docs/findings/capture-backends-2026-09-18.md`](../docs/findings/capture-backends-2026-09-18.md).

## What we found

Every quality invariant was tested against five backends with a self-reporting
probe page. The results that decided the architecture:

- **The Chrome extension cannot produce a trustworthy capture** *(refined
  later the same day — see the corrections below)*. JPEG at whatever pixel ratio
  the current display happens to have, with no way to pin it, and its
  screenshots come back as an opaque id rather than a file path — so they cannot
  be hashed or placed. Its captures also carry the operator's real browser
  profile, which is both a fidelity problem and a privacy one.
- **Computer use is disqualified by the platform itself**, which grants
  browsers read-only access and says so: it can see a browser, it cannot drive
  one. It remains the right driver for native desktop apps.
- **chrome-devtools MCP meets every pixel invariant** — Retina, real mobile
  emulation, isolated contexts, PNG at a chosen path. It is an *agent-facing*
  tool that is perfectly good at capture, which is what refutes the simple
  agent-versus-Playwright framing.
- **A backend reported success and delivered nothing.** `resize_window(393, 852)`
  returned "Successfully resized" and the page was still 1512px wide, dpr 1,
  zero touch points, two seconds later.

That last one changed the design more than any other finding.

## What we built

**The invariants now live in one place and are verified, not trusted.** Every
capture measures the PNG it just wrote and asks the page what it actually
received. A configuration flag is a request; only a measurement is evidence.

**The capture backend is swappable behind a contract.** Two implementations
ship: Playwright (default — the only one with video and a clock API) and a raw
CDP driver written against Node's built-in WebSocket, with zero dependencies
and no 94 MiB browser download. The second one exists for two real cases: a
machine where Playwright's browsers cannot be installed, and an auth gate only
a human can pass, where the capture must attach to a Chrome someone has already
signed into.

The architecture proves itself in one line of output: the CDP driver *declares*
it cannot freeze animations, and the session layer **verifies that it did** —
because the guarantee belongs to the layer, not the backend.

**Two invariants that did not exist before**, both discovered by the
measurements:

- *Time frozen.* A page with a live clock makes two captures of an unchanged
  screen differ, which silently disarms the duplicate guard — the check still
  runs, it just can never fire. The clock is now pinned.
- *Animations finished, not just CSS-frozen.* Framer-motion and friends animate
  through the Web Animations API, which `animation: none` does not touch. The
  first real walk reported four animations still running after settle: the
  freeze was working and was freezing the wrong half.

**Dev-server overlays are hidden from captures, and the run says so.** Hiding
toolchain chrome is legitimate; hiding it silently is not. The console errors
behind the overlay are still collected and still become issues.

## The schema reconciliation

Two catalog generations existed and the dashboard could read only one.

The fix is deliberately asymmetric. **Reading is permissive forever**: the hub
upgrades v1 catalogs in memory on every read, so a project walked by an older
toolchain renders correctly instead of rendering empty. That matters because
other repositories own their own copy of the skill and upgrade on their own
schedule — a one-off migration would have been undone the following week.
**Writing is strict**: new runs emit `schemaVersion: 2`, and
`scripts/migrate-catalog.mjs` upgrades files on disk when you want the
committed bytes to be canonical. It is a dry run by default and prints every
change.

The existing Wikipedia run is migrated. **Openstage's own in-repo catalog was
deliberately left alone** — that repository ships its own dashboard reading its
own catalog, so migrating the file would break their reader to fix nothing the
hub has not already fixed.

## Openstage, walked

26 captures across five features on two surfaces, plus a persona journey, all
seven invariants verified. The walk found six things, none of which were
repaired — a walkthrough observes the product as the team committed it:

- **The `/admin` gate fails open.** The middleware wraps its cookie check in
  `if (adminPassword)`, so with the variable unset the dashboard, the studio and
  the new-presentation form all render to an anonymous visitor. Captured
  unauthenticated, from a browser context with no cookies. The risk is not the
  local machine — it is that a deploy which loses the variable exposes the admin
  area silently, with no error and nothing visibly different. Filed as a blocker.
- **A hydration mismatch on the gallery**, verified to be the app's own and not
  an artefact of the walk: it reproduces in a plain browser session with no
  clock pinning, no injected CSS and no emulation.
- **Decks overflow horizontally on a phone** — 560px of content on a 393px
  surface, so the browser zooms out to fit. This one is invisible in the
  screenshot: the capture looks like a perfectly normal narrow render, and only
  the measured layout width shows that a real phone never sees it at 1:1. Found
  by the capture layer, not by eye.
- An `<svg> attribute height: Expected length, "auto"` error in a deck, and a
  native `<select>` as the gallery's grouping control.

**Discovery, measured against the route tree.** A static scan finds 17 routes.
Driving the app found that `/ai-patterns` renders perfectly and is absent from
the gallery because it is a draft — a route scan sees a route and cannot tell
*exists* from *is offered* — and that the gallery's real substance is four
interactive controls, none of which is a route.

**One correction made to our own copy mid-walk.** A step description claimed the
headline count follows the filter. The capture showed it does not: the header
stays at the library total while the table narrows. The copy was wrong and the
screenshot was right, which is the whole point of capturing before writing.

## Using it on your own app

The hub now carries a repository card and a `/use` page: three install paths
(Claude Code, Codex, any agent with a shell), what the invariants promise and
what breaks without each, and the specific files to read before trusting any of
it. Header and footer link to both from every page.

## Left undone, on purpose

- `/share/[id]` and the password-gated deck are marked `pending` with reasons.
  The first needs a share id this run would have had to create, which means
  writing to the app's store uninvited. The second has nothing to guard — the
  admin dashboard confirms zero protected decks.
- Codex's Chrome extension is absent from the findings table rather than
  guessed at. It could not be driven from this session, and an expectation is
  not a measurement.

---

## Later that day — the conclusion was challenged, and partly corrected

Pushback: *"computer use and the Chrome browser extensions are the most
powerful."* Researched properly (Chromium source, vendor docs) and tested
hands-on against the iOS Simulator. Three corrections, recorded in
[the findings addenda](../docs/findings/capture-backends-2026-09-18.md):

1. **The extension is not "1x", it is display-bound.** `captureVisibleTab`
   returns CSS px × devicePixelRatio; the 1x measured earlier was this
   machine's external non-Retina monitor. The real defect is that there is no
   way to *choose* the ratio, so the same walk gives different resolutions
   docked and undocked. Also: its default format is JPEG at quality 90 — nothing
   selected that, it is simply the default.
2. **An extension can reach CDP-grade** via the `debugger` permission, which
   grants arbitrary `deviceScaleFactor` independent of the display. The price is
   a cross-tab banner that Chromium's own source says does not disappear even
   after detach, plus the two harshest install warnings Chrome issues. So the
   earlier claim should have been about the API a tool chose, not the category.
3. **Real mobile had never been tested at all.** It has now: the iOS Simulator
   produces a 1206×2622 native-Retina PNG in 0.46s, and with
   `simctl status_bar override --time "09:41"` two captures four seconds apart
   are **byte-identical with no injection whatsoever** — a platform feature
   doing for free what the web path needs freeze-CSS, animation-finishing and
   clock-pinning to approximate. Android has the same capability via SystemUI
   Demo Mode.

**Where the challenge was right:** the question order was wrong. Fidelity was
answered first when *reach* comes first — a perfect capture of an app you cannot
reach is worth nothing, and for native apps and human-only auth gates, simulator
and desktop control are the only path, not a fallback. Every commercial product
in this space (Scribe, Arcade, Supademo, Guidde, Tango, Loom, Screen Studio)
declines the debugger route and puts its high-quality path in a **native desktop
app**, not a headless browser.

**Where it does not change the design:** those products answer a different
question — record what this person did, in their real session, with their real
data — for which a shared profile and display-native resolution are correct.
These artifacts must be comparable across runs and carry no operator identity,
which needs a pinned scale factor, a fresh context and a frozen clock.

## Two errors this caught in yesterday's work

- **An invented hostname.** The registry gave openstage's production as
  `present.openstage.humanquest.net`. The simulator answered *"Safari can't open
  the page because the server can't be found"* — it is NXDOMAIN. The real host
  is `present.humanquest.net`. It had been inferred from a changelog line rather
  than resolved. Corrected.
- **A false finding, narrowly avoided.** Openstage's dev server never finished
  loading in real mobile Safari — a spinner still turning after 30 seconds,
  which looked like a serious WebKit bug. Production loaded perfectly. The
  difference was the dev server, not the app.

Also measured and worth knowing: simulator video is `yuv420p` (4:2:0 chroma
subsampling, lossy on coloured UI text) and **variable frame rate** — roughly
1.1 fps on a near-static screen. It illustrates a flow; it is not evidence the
way a PNG is.
