# Driver — web, via Playwright

The best-supported driver. Real browser, real device emulation, multi-step
interaction, video, and a network/console log you can read.

## Pick a mechanism

In order. Use the first one available; a missing tool is a reason to drop a tier,
never a reason to read source code and write it up as observed.

**1. Playwright MCP** — when the agent has `browser_navigate` and friends.
Interactive and inspectable: you can look at a snapshot before deciding what to
click. Best for exploratory walks.

**2. Playwright as a script** — `node` plus the `playwright` package. Better for
anything repeatable, because the script *is* the record of how the walk was
done, and the next run reproduces it exactly. This is what
[`scripts/walk-wikipedia.mjs`](../../../../../scripts/walk-wikipedia.mjs) does; clone it.

**3. Headless Chrome CLI** — last resort, when you need PNG files and have no
Playwright. Hard-won constraints:

- **Always pass `--timeout=<ms>`** (e.g. `20000`). Without it a stalled load
  hangs the process forever.
- **One capture per process invocation.** Concurrent Chrome instances collide
  even with separate `--user-data-dir`, and the second silently never writes its
  file. Run sequentially; kill stray `Chrome.*headless` processes between shots.
- Flags that earn their place: `--headless=new --no-sandbox --disable-gpu
  --hide-scrollbars --run-all-compositor-stages-before-draw
  --virtual-time-budget=9000 --window-size=W,H --screenshot=out.png URL`
- Keep output ≤ ~1600px wide or you can't open it to check it.

The CLI can't interact, so it can only capture entry states. A walk made
entirely of entry states is a list of front doors — say so in the output rather
than implying you drove anything.

## Context setup

Set all of this when creating the context, before the first navigation.

```js
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,          // retina; 1 produces soft text at display size
  reducedMotion: "reduce",       // kills transitions → deterministic frames
  colorScheme: "light",          // or read the app's default; don't leave it to chance
  locale: "en-GB",
  timezoneId: "Europe/London",   // pin it, or date-bearing UI diffs run to run
});
```

**A fresh context per feature.** State from the previous feature — an open
modal, a dismissed toast, a filter, a scroll position — leaks into the next
one's first capture and you'll spend real time wondering why the entry state
looks wrong.

### Mobile is a device, not a narrow window

```js
const iPhone = devices["iPhone 15 Pro"];
const context = await browser.newContext({ ...iPhone, reducedMotion: "reduce" });
```

A 393px-wide desktop context is not a phone. The user agent, touch support and
device pixel ratio all differ, and responsive code keys off all three — you'll
capture the desktop layout squeezed narrow, which is a different bug report from
what users actually see.

## Auth

Sign in once, save the state, reuse it:

```js
await context.storageState({ path: ".tmp/storage-state.json" });
// later
await browser.newContext({ storageState: ".tmp/storage-state.json" });
```

Never commit that file — it holds live session tokens. `.gitignore` already
covers `*storageState.json`.

For SSO/MFA gates (`auth.interactiveOnly` in the registry), launch headed, let
the human sign in, then save the state. See [`../references/auth.md`](../references/auth.md).

## Navigate within the app, not by reloading

```js
await page.getByRole("link", { name: "Billing" }).click();
```

A `page.goto()` to a deep link is a full document load, which discards
in-memory SPA auth and often lands you on a login screen. Clicking the real nav
link both preserves the session and follows the path a user takes. Use `goto`
for the entry point and for genuinely deep-linkable pages only.

## Settle before capturing

```js
await page.waitForLoadState("networkidle").catch(() => {});
await page.evaluate(() => document.fonts?.ready).catch(() => {});
await page.waitForTimeout(250);
```

Font readiness matters more than it sounds: a capture taken before the webfont
swaps in shows fallback metrics, so text wraps differently and every later
visual comparison is noise. `networkidle` can hang on apps with long-polling or
analytics beacons — hence the `.catch()`; fall back to waiting for a specific
element instead of a global quiet.

Prefer waiting for a *condition* over a duration. `waitForTimeout` alone is a
guess that flakes on a slow machine and wastes time on a fast one.

## Scrolling: the trap

`scrollIntoViewIfNeeded()` **does nothing when the element is already visible.**
Used to reach a state, it silently produces a capture identical to the previous
one — two claimed states, one real. This is the single most common cause of
duplicate captures.

```js
// Wrong: no-ops when the element is already on screen.
await locator.scrollIntoViewIfNeeded();

// Right: always scrolls, and accounts for a sticky header.
await locator.evaluate((el, offset) => {
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
}, 72);
```

## Read the console and network

```js
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("response", (r) => { if (r.status() >= 400) failures.push([r.status(), r.url()]); });
```

Check these **after the first load, before interacting.** An error here usually
explains broken UI you'd otherwise spend twenty minutes blaming on the wrong
component. Persist them into `issues.json › evidence` so they survive the run.

## Locales

A locale is a **variant of a feature**, not a feature. Capture against the same
`featureId`, set `locale` on the walkthrough, and store under
`{featureId}/{surfaceId}/` with a locale-suffixed filename — or a
`{featureId}.{surfaceId}.json` per locale if the content differs enough to need
its own prose.

For RTL locales, verify the switch actually took: check
`document.documentElement.dir === "rtl"`, not just that the URL changed. A
silently failed locale switch produces a set of captures that are all the
default language and claim otherwise.

## Video

```js
const context = await browser.newContext({
  recordVideo: { dir: ".tmp/video", size: { width: 1280, height: 720 } },
});
// … walk …
await context.close();               // the file is only finalized on close
const path = await page.video().path();
```

Playwright **cannot capture audio**. A recording of an audio feature is silent
no matter what the page plays. If the temporal arc is the value, record the
silent video, write a sidecar of beat timestamps, and mux synthesized narration
on afterwards — and say in the step description that the voice is a synthesized
voiceover over the real on-screen response, so nobody reads it as a product
claim.

## Uploads

Commit a fixture and drive the real input rather than skipping the step:

```js
await page.setInputFiles("input[type=file]", "fixtures/sample-invoice.pdf");
```

Put fixtures in `apps/hub/public/walkthroughs/{slug}/fixtures/`. "Upload gate"
is not an acceptable reason to leave an upload feature captured at its empty
state — the processed result is the whole feature.

## Redaction

With `--redact`, blur personal data before the capture is written:

```js
await page.addStyleTag({
  content: `[data-pii], .user-email, .user-phone { filter: blur(6px) !important; }`,
});
```

Selector-based blurring only covers what you can name. On a page with free-text
user content, review each capture by eye as well.
