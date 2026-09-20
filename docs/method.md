# The method — what actually happens during a walkthrough

Written because "how does this work" deserves a straight answer before any
argument about which browser tool is best.

---

## The shape of it

```
  YOU            "walk this app"
    │
    ▼
  THE SKILL      plugins/walkthrough/skills/walkthrough/SKILL.md
    │            Markdown instructions. Tells the agent what to establish
    │            before touching anything, what counts as done, and what it
    │            is forbidden to do (edit the app, claim an unseen screen).
    │            The skill has no code and drives nothing itself.
    ▼
  THE AGENT      reads the app's source, decides what the features ARE,
    │            writes/adjusts a walk script, runs it, looks at the output,
    │            writes the prose. This is the part that is judgement.
    ▼
  THE WALK       scripts/walk-<app>.mjs
  SCRIPT         "go here, click that, capture, now scroll, capture".
    │            Deliberately dumb. Contains no quality logic at all.
    ▼
  THE CAPTURE    scripts/lib/capture/
  LAYER          Enforces the invariants. Refuses to return a filename for a
    │            capture that violates one. This is the part that is rules.
    ▼
  A DRIVER       Playwright, or raw CDP, or (future) a simulator driver.
    │            Knows how to move a pointer and take a picture. Knows
    │            nothing about what a good capture is.
    ▼
  ARTIFACTS      apps/hub/public/walkthroughs/<slug>/
    │              catalog.json          what features exist
    │              <feature>.<surface>.json   steps, prose, capture paths
    │              persona-<id>.<journey>.json
    │              issues.json           what was found broken
    │              runs.json             append-only log, incl. which
    │                                    invariants this run actually proved
    │              <feature>/<surface>/step-NN.png
    ▼
  THE HUB        A Next.js app that reads those files off disk. No database,
                 no build step, no generation at request time. It also
                 re-checks the artifacts and shows a findings banner, so a
                 lazy run is visible to the reader, not just to the author.
```

The separation that matters: **the agent decides, the layer enforces, the
driver executes.** Swapping the driver cannot change what "walked" means,
because the rules do not live in the driver.

---

## What the layer actually enforces, and why each one exists

Before every capture it settles the page, removes CSS animation, finishes Web
Animations, pins the clock, and hides dev-server overlays. After every capture
it measures the PNG and hashes it.

| Rule | Enforced how | Because |
|---|---|---|
| Retina | measures the written PNG's pixel width | a 1x capture of dense UI is unreadable zoomed in and looks identical in a file listing |
| Real device, not a narrow window | asks the page for its UA, touch points and `pointer: coarse` | sites pick their layout from the UA; a narrow window documents a screen nobody sees |
| Nothing in motion | `getAnimations()` must report zero running | a mid-animation frame is a state the product never rests in |
| Time pinned | reads `Date.now()` twice, must agree | a live clock makes two captures of an unchanged screen differ, which silently disarms the duplicate check |
| Fresh context per feature | a storage marker must differ between contexts | leaked state documents a session no user had |
| No duplicate captures | MD5 against *every* earlier capture in the walk | identical bytes mean two claimed states with one reality |
| Console + network kept | collected per context, errors become issues | an empty list because the API is down looks exactly like an empty list that is a feature |

**It verifies rather than trusts.** Every one of those is a measurement of the
result, not a reading of the option that was passed. That is not fastidiousness:
one capture backend answered `resize_window(393, 852)` with *"Successfully
resized"* and left the page 1512px wide with zero touch points. A flag is a
request. Only a measurement is evidence.

---

## Where the agent is genuinely needed, and where it is not

This distinction is the whole architecture, so it is worth being blunt about.

**Needed — deciding what to walk.** A static scan of a target app's route tree
finds 17 routes. It cannot tell you that `/ai-patterns` renders perfectly and is
absent from the gallery because it is a draft; that the gallery's real substance
is four interactive controls, none of which is a route; or that `/share/[id]`
needs an id nobody has created. Those are judgements about what the product
*is*, and they need something that can look at the app and think.

**Needed — writing the prose, and checking it.** During a target-app walk a
step description claimed the headline count follows the filter. The capture
showed it does not. The copy was wrong and the screenshot was right.

**Not needed — the capture itself.** Once you know "click the Slides pill, then
capture", nothing about executing that benefits from a model. It benefits from
determinism, which is the opposite thing.

So: **agent decides, script executes, layer enforces.** Not agent-first, and not
Playwright-first — those are answers to the wrong question.

---

## Choosing a driver: what actually decides it

Not "which is most powerful" in the abstract. Three questions, in order:

**1. Can you reach the app at all?**
A native iOS app, a macOS menu-bar utility, a CLI — Playwright cannot touch any
of these. Reach beats fidelity, because a perfect capture of nothing is worth
nothing. This is where simulator and desktop control are not a fallback, they
are the only option.

**2. Can you get past the front door?**
An SSO gate with a hardware key, an MFA push, a corporate IdP — there is no
scripted path through these. The only route is a human signing in once and the
capture attaching to *that* browser session. This is why the CDP driver, which
attaches to a Chrome you already have, exists.

**3. Only then: how good is the artifact?**
Pixel density, format, determinism, isolation, video. This is the question I
originally answered first, which put it in the wrong place.

The honest summary is that the three questions have different winners, and a
system that picks one tool for all three is wrong twice.

---

## Reading the evidence yourself

- [`docs/findings/capture-backends-2026-09-18.md`](./findings/capture-backends-2026-09-18.md)
  — the per-invariant measurements and how they were taken.
- `node scripts/verify-capture-layer.mjs` — runs the same walk through every
  registered backend and prints what each one actually delivered. If a
  measurement in the findings doc is wrong, this is what proves it.
