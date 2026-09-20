---
name: walkthrough
description: "Walk an app end to end and publish what you actually saw — web, iOS, Android, desktop or CLI. Drives the real app (clicking, typing, tapping, running commands), captures each state, and writes a catalog, per-feature walkthroughs, persona journeys, verified fixes and an append-only run log into a Walkthrough Studio hub. Default is the full story; subset modes (catalog, one feature, one persona, verify, fix, pr) exist when a smaller slice is wanted. Use when the user says /walkthrough, or asks to document, record, screenshot, demo or QA their app, generate onboarding guides, walk a user journey, verify that a bug fix holds, find UI bugs, or open a PR whose body shows what a change does for the user. Do NOT use for code review, explaining code logic, architecture discussions, or anything with no observable interface."
metadata:
  version: 1.0.0
  category: documentation
  hub: walkthrough-studio
---

# Walkthrough

Runtime-agnostic: works in Claude Code, Codex, and any agent with shell access
plus a driver for the target platform. Web needs Playwright/CDP, iOS needs Xcode
and a simulator, Android needs platform-tools, desktop needs Electron or the OS
accessibility layer, and CLI needs a pseudo-terminal. See `drivers/` and
`references/runtime-portability.md`.

You drive a real application and write down what you saw. The output is read by
people deciding whether to trust the documentation, so the bar is not "did I
produce files" — it is **"is every claim in these files true?"**

The one rule everything else serves: **a walkthrough may only assert what was
observed.** Never describe a screen you didn't reach, never present a described
state as a captured one, and never write a JSON file you know to be misleading.
A missing walkthrough is recoverable in ten minutes. A plausible-looking false
one poisons every decision made from it, and nobody will know to check.

## Definition of done — the full story gate

Full mode is not done when a convenient screen has screenshots. It is done only
when the artifact explains the product from a user's point of view:

- **Inventory reconciled:** source routes/navigation and live reconnaissance
  agree on the top-level capabilities. Auth-gated or currently blocked areas
  stay in the denominator as `pending` or `blocked`; do not omit them to make a
  percentage look complete.
- **Meaningful feature walks:** each walked feature crosses at least one real
  interaction and reaches an outcome or other peak moment. A landing page tour
  is not a feature walkthrough.
- **A person, not just screens:** at least one evidence-backed persona has a
  5–9 scene journey across the product. If the product truly has no distinct
  user role, explain why in the catalog instead of silently leaving personas
  empty.
- **Motion is shown when motion matters:** record at least one clip for flows
  whose value depends on sequence, animation, streaming, audio, or timing when
  the capture backend supports video. If it cannot, record the missing
  invariant in the run and do not call the result showcase-ready.
- **Evidence inspected:** every capture is opened and checked, the catalog's
  scope is explicit, and an append-only run manifest names the driver,
  surfaces, target, and any unverified claims.
- **Media played, not merely found:** open each referenced clip through the hub
  on the target host. A file that exists but the browser cannot decode is
  failed evidence. Prefer H.264 MP4 for portable playback; the capture layer
  normalizes Playwright WebM when `ffmpeg` is available and records a warning
  when it is not.

`scope.status: "bounded"` or `"partial"` is an honesty label, never completion.
The hub must not present a bounded one-of-one slice as 100% product coverage.

---

## Step 0 — Establish the target

Before anything else, answer three questions. Guessing any of them wastes the
whole run.

**1. Which app, and on which platform?**

Read the hub's `apps/hub/projects.json` and find the entry. `target.platform` is
one of `web` · `ios` · `android` · `desktop` · `cli`. If the user named an app
that isn't registered, add the entry first — ask for anything you can't infer
from the codebase, and never invent a bundle id or a base URL.

**2. Which driver?**

`target.driver`, or the platform default. Then read the matching guide and
follow it — the mechanics differ enough per platform that generic advice is
useless:

| Platform | Default driver | Guide |
|---|---|---|
| `web` | `playwright` (fallback `chrome-cli`) | [`drivers/web-playwright.md`](drivers/web-playwright.md) |
| `ios` | `ios-simulator` | [`drivers/ios-simulator.md`](drivers/ios-simulator.md) |
| `android` | `android-emulator` | [`drivers/android-emulator.md`](drivers/android-emulator.md) |
| `desktop` | `electron` · `macos-native` · `windows-native` | [`drivers/desktop.md`](drivers/desktop.md) |
| `cli` | `terminal` | [`drivers/cli-terminal.md`](drivers/cli-terminal.md) |

Choose by capability, not agent brand. Use computer control to explore the
running product and find robust paths; use the capture layer for deterministic,
byte-addressable evidence. Codex and Claude expose different control tools, and
macOS and Windows expose different native drivers, but the quality gate is the
same. Read [`references/runtime-portability.md`](references/runtime-portability.md)
before selecting a backend.

Use the first driver that satisfies the required evidence. A missing tool is a
reason to switch drivers, not a reason to stop — but it is **never** a reason to
fall back to reading source code and writing it up as if you'd seen it. If no
driver works, say so and stop.

**3. Which surfaces?**

Surface ids come from `apps/hub/src/lib/surfaces.ts` and they are load-bearing:
they appear in capture paths and in `runs.json`. Defaults are `desktop` +
`mobile` for web, `iphone` for iOS, `android-phone` for Android, `window` for
desktop, `terminal` for CLI. Don't invent an id without adding a definition to
`catalog.json › surfaces`, or the hub renders it unframed with a raw slug.

---

## Quality standards

These are invariants, not preferences. The hub checks most of them and shows
findings on the project page, so a lazy run doesn't slip through quietly — it
shows up as a red banner with your name on the run.

- **Every step after the first records an `action`.** The interaction that
  produced the state — "Tapped Continue", "Typed 4800 into the Monthly income
  field", "Ran `acme deploy --dry-run`". This is the evidence the walk
  advanced. Steps without it get flagged.

- **No two captures in a walk may be byte-identical.** Identical bytes mean
  nothing happened between them: two claimed states, one real one. Hash each
  capture at capture time against **every** capture already taken in that walk
  — not just the previous one. A guard that looks back only one step misses the
  common case where a tab or filter returns you to an earlier view, and it is
  then weaker than the hub's own check, which compares all pairs. The usual
  causes are a scroll helper that no-ops when the element is already visible,
  and a tab click where that tab was already active. See
  `references/quality-invariants.md`.

- **Look at every capture before you use it.** Half-loaded, mid-animation,
  wrong-screen and blank-state captures all *look* fine in a file listing.
  A blurry screenshot in living documentation is worse than no screenshot,
  because it gets trusted.

- **Locales and surfaces are variants, not features.** `/en/checkout` and
  `/ar/checkout` are one feature in two locales. Phone and desktop are one
  feature on two surfaces. Cataloguing them separately inflates the feature
  count, which is the first number every reader sees. Put locale in `locale`
  and form factor in `surface`.

- **Mark anything you didn't drive.** `verificationStatus: "synthetic"` for a
  state described from source; `"gated-write"` for a surface you reached but
  deliberately didn't act on because it would mutate real data. Unmarked means
  "I really did this", so leaving it off when you didn't is a lie the hub can't
  catch for you.

- **Never edit application source to make a feature walkable.** A walkthrough
  observes the product as the team committed it. If a screen crashes on render
  or 500s, the correct output is `surfaceStatus: { <surface>: "blocked" }`, a
  `notes` entry, and an issue in `issues.json` — not a patch. You may fix the
  *environment* (start a service, set a port, install a missing dependency);
  announce it first and name the files it touches. Fix mode (`--fix`) is the
  only mode authorized to change application code, and only when the user
  invokes it.

- **Write the run manifest.** Every run appends to `runs.json` with the target
  git sha. Skip it and drift detection silently stops working for that project
  — the staleness pill will keep reporting the previous run forever.

- **Use the capture layer; do not re-implement it.** For web, `openCapture()`
  enforces every invariant above and *verifies* each one by measurement rather
  than trusting the option it passed — because a backend can report a
  successful resize and deliver nothing, which is a measured finding and not a
  hypothetical. A walk script that hand-rolls its own screenshot helper has
  opted out of checks it probably does not know exist.

- **Put the lesson in the script, not in chat.** When you discover a non-obvious
  capture trick — a wait that prevents a flake, an init script that skips
  onboarding, a selector that survives copy edits — write a comment in the walk
  script explaining *why*. The next agent gets it for free instead of
  rediscovering it. [`scripts/walk-wikipedia.mjs`](../../../../scripts/walk-wikipedia.mjs)
  in this repo is the reference for this.

- **Cost is not a reason to skip the valuable step.** If a feature's whole point
  is a model response, a generated document, or an uploaded file being
  processed, drive the real interaction and capture the *result*. Capturing only
  the armed input ("user has typed and pressed nothing") reduces the artifact to
  chrome and defeats the purpose. The `note` field is for genuine gaps —
  surfaces that don't exist yet, state you can't reconstruct, flows carrying
  real personal data — not for "it would have taken a minute".

---

## Modes

| Mode | Trigger | What it does |
|---|---|---|
| **Full** *(default)* | `/walkthrough`, `/walkthrough all` | Catalog → every feature on every surface → every persona's journey → verify recent fixes → run manifest |
| **Catalog** | `/walkthrough catalog` | Discover features, personas and surfaces; write `catalog.json`. No captures. |
| **Feature** | `/walkthrough <location-or-id>`, `/walkthrough next` | One feature, all its surfaces |
| **Persona** | `/walkthrough --persona <id>` | One user's journey across several features |
| **Verify** | `/walkthrough verify` | Walk recent bug fixes, capture before/after proof |
| **Fix** | `/walkthrough --fix [location]` | Load `issues.json` and fix them in the codebase |
| **PR** | `/walkthrough pr` | Branch, commit, capture before/after for the affected features, push, open a PR with the captures in the body |

### Flags

```
--project <slug>        which registry entry (required when >1 app)
--surface <id,id>       restrict to these surfaces (default: the platform's)
--locale <tag,tag>      capture these locales too
--url <base-url>        web: target an external URL instead of local
--device <name>         mobile/desktop: override the device or simulator
--no-video              skip clips even for time-dependent steps
--redact                blur personal data in every capture before saving
--refresh               catalog: re-scan and update
--ask-login             pause for a human to sign in, then continue
--fix                   fix mode
--vs <ref>              PR mode: diff against an arbitrary git ref
--base <branch>         PR mode: override the detected base branch
--draft                 PR mode: open as a draft
--no-pr                 PR mode: capture and commit only
```

### Mode detection

1. `--fix` present → **Fix**
2. target is `catalog` / `personas` → **Catalog**
3. target is `verify`, or the user says "verify the fixes", "check the bug fixes
   still work" → **Verify**
4. target is `pr`, `--pr`, or the user says "open a PR showing what changed",
   "PR with before/after" → **PR**
5. `--persona` present → **Persona**
6. a location or feature id given, or `next` → **Feature**
7. `all` or nothing → **Full**

---

## Step 1 — Pre-flight: is the app under test really *this* app, and is it alive?

Three failure modes produce captures that look completely fine and are entirely
fictional. All three are cheap to rule out and expensive to discover later.

1. **You're driving the wrong app.** Another project's dev server holds port
   3000; a stale build of a different app is installed under the same bundle id;
   `acme` on `$PATH` is last month's global install rather than the local build.
2. **The front end is up and its dependencies are down.** The shell renders,
   every request 500s, and you capture a gallery of empty states and skeletons.
   Perfectly plausible screenshots, entirely false documentation.
3. **It's pointed at someone else's backend.** A stale `.env.local` or an SSH
   tunnel on the API port. Real data appears — the wrong real data — and you'll
   only notice if a capture happens to contain a stranger's content.

Driver guides cover the platform mechanics. The reasoning is the same everywhere:

**a. Inventory what the app needs.** `docker-compose.yml` is the best source of
truth when present — each `services:` entry with its ports and `depends_on`
order. Otherwise: workspace `package.json` dev scripts, `backend/` or `api/`
directories with `pyproject.toml` + uvicorn / `manage.py` / `Gemfile` /
`go.mod`, plus databases, caches and queue workers. Then read the app's own env
config to see which of those it actually calls — anything it never references
is not required, so don't bring up the world.

**b. Verify each listener or installed artifact is yours.** For web, for each
PID on a candidate port check the working directory (`lsof -a -p <PID> -d cwd`)
and the binary (`ps -p <PID> -o command=`), then probe for a project-specific
marker: the HTML `<title>`, `/openapi.json`'s `info.title`, a route only this
app defines. Watch for `ssh` (a port-forward — it's the user's, ask before
touching it) and `docker-proxy` from a stale container. For mobile, check the
installed build's version or timestamp against what you just built. For CLI,
`which -a` and confirm you're invoking the local build.

**c. Bring up what's missing, the project's own way.** Prefer `docker compose up
-d` when compose exists; otherwise the script the project documents. Start in
dependency order, tail each process until it prints its bound address, then poll
a readiness endpoint. Read the port the process *printed*, never the one you
passed. Cold starts: Next.js first compile 30–60s, uvicorn 5–10s, Django/Rails
10–20s, Postgres in Docker 5–15s, an iOS simulator boot 20–40s. Poll up to 90s
before declaring it stuck.

**d. Smoke-test end to end.** Open a data-bearing screen and watch the network
and console. Every call to the configured API should be 2xx, or an expected
401/403 — which still proves the backend is alive and authoritative. No CORS
errors, no `ECONNREFUSED`, no `Failed to fetch`.

If a required piece can't be brought up, **stop and report specifically**: which
services you found, which are up, which failed and why, and what the options
are. Don't guess a URL, don't walk a stack with known-broken pieces, and don't
paper over it by marking everything `pending`.

*"Fix the stack" means environment remediation only.* A single route that
crashes is a **feature-level** bug: capture what you can, mark that surface
`blocked` with a note, file it in `issues.json`, and carry on.

---

## Step 2 — Catalog

Full mode runs this first; `catalog` mode stops after it.

Discovering "what are this app's features" is the most platform-specific task in
the skill — a Next.js route tree, a SwiftUI navigation graph and a Cobra command
tree have nothing in common. Follow
[`references/catalog-discovery.md`](references/catalog-discovery.md), which has a
section per platform.

Catalog discovery is a reconciliation, not a route dump:

1. Build a source inventory from routes, navigation, command trees, screen
   registries, and documented entry points.
2. Explore the live app with the best available computer-control tool and note
   every top-level capability a user can reach, including gated destinations.
3. Compare the two lists. Add missing capabilities, collapse variants, and mark
   inaccessible capabilities `blocked` or `pending` with a reason.
4. Set `scope.status` to `comprehensive` only when the lists reconcile. Use
   `partial` when discovery is unfinished and `bounded` only for an explicitly
   requested slice. Neither may be reported as product completion.

Whatever the platform, produce for each feature:

- `featureId` — stable kebab-case slug. It becomes a URL and a directory name,
  so renaming it orphans existing captures.
- `featureName` — what a user would call it, not what the file is called.
- `location` — **semantics depend on the platform**: a route (`/settings/billing`),
  a screen id (`SettingsScreen`), an activity (`com.acme/.SettingsActivity`), a
  window path (`Preferences › Network`), or a command (`acme deploy --dry-run`).
- `category` — a grouping the app's own users would recognise; the hub groups the
  feature index by it.
- `requiresAuth` / `authRole`.
- `surfaceStatus` — `{}` until you walk it.

Then detect personas ([`references/personas.md`](references/personas.md)) and
the app's brand colours and type, so generated guides can look like the product.

For a full run, an empty `personas` list and a catalog with fewer than three
top-level capabilities are review triggers, not convenient defaults. Investigate
and document why before continuing.

Write `apps/hub/public/walkthroughs/{slug}/catalog.json` per
[`references/output-format.md`](references/output-format.md).

**Before walking everything, show the plan and get consent.** Full runs cost
real time and disk:

```
{N} features across {C} categories · {P} personas · surfaces: {surfaces}

  walk every feature on every surface   ~{T1} min
  walk every persona journey            ~{T2} min
  verify recent fixes from git          ~{T3} min
                                        ─────────
                                        ~{T} min, ~{D} of captures

Proceed?  [yes / pick a subset / catalog only / cancel]
```

---

## Step 3 — Walk a feature

Per feature, per surface. Sequentially — the quality invariants and console
tracking all assume one walk at a time.

### 3a. Read the source first

Sixty seconds here prevents the most common weak walk: arriving with no plan and
capturing whatever happens to be in the initial viewport.

Find the feature's implementation and understand what it renders, whether
content is static or fetched, which interactive elements exist (forms, modals,
filters, expandable rows), and roughly how many items a list could hold. A team
page with six members needs six-ish captures, not two.

Identify the persona. It determines which account to use, what data will be
visible, and what counts as realistic input. An `admin` view and a `member` view
of the same screen are different documentation.

### 3b. Write the step plan, and define "done"

List the steps you intend to capture before you open anything:

```
1  arrive — the entry state
2  <section or state>
…
N  the primary interaction, with persona-realistic input
N+1 the outcome — success, result, or error
```

"Done" is specific: for a form, submitted *and* the confirmation captured. For a
long page, every section. For a list, at least one row expanded. **If you
haven't captured the outcome, you aren't done** — the outcome is the only part
that proves the feature works.

Find the **peak moment**: the single most compelling state this feature can
reach. Usually a filled form with a real result, or an expanded row with real
data. Plan to capture it.

### 3c. Set the surface, then authenticate, then navigate

Order matters and the reason is the same on every platform: **configure the
surface before loading the app.** Resizing or rotating after load produces a
layout that only exists mid-resize, and on web it reloads the page, discarding
in-memory auth.

1. Configure the surface — viewport and device scale, or simulator device.
2. Authenticate. Credentials come from the registry's `auth.roles`, where a
   `$ENV_VAR` placeholder resolves from `.env.local`. A missing variable is a
   loud failure: ask for it, don't proceed unauthenticated and capture a login
   wall. For `interactiveOnly` gates (SSO, MFA, biometric), have the human sign
   in once and persist the session — see [`references/auth.md`](references/auth.md).
3. Navigate *within* the app rather than reloading. On web, click the real nav
   link: a full page load drops SPA auth state. On mobile, tap through the real
   flow unless a deep link exists. This is also more honest — it's the path a
   user takes.

### 3d. Reconnoitre before capturing

Navigate, then survey without capturing anything yet. Check the console or
device log for errors *now*, before any interaction — an error here usually
explains broken UI you'd otherwise spend twenty minutes blaming on the wrong
thing. Scroll the whole screen. Compare what's actually there against your plan:
real item counts, sections the source didn't imply, visible bugs, and whether
the data matches the persona you signed in as. Seeing admin data while signed in
as a member means the auth step failed — stop and fix it.

Revise the plan. Then start capturing.

### 3e. Capture

For each step: perform the action, wait for the app to settle, capture, and
**verify the capture differs from the previous one**.

Settle deliberately rather than sleeping a fixed amount. Wait for the network to
go quiet, wait for fonts to load (a capture taken pre-font-swap shows fallback
metrics and makes every later visual diff noisy), disable animation so the frame
is deterministic. A `waitForTimeout` alone is a guess that fails on a slow
machine and wastes time on a fast one.

Write captures to `{featureId}/{surfaceId}/step-NN-<slug>.png`. Steps spanning
several states of one moment — a streaming response, a carousel, a multi-turn
exchange — go in `screenshotFrames` on a single step rather than becoming
separate steps.

Record an issue in `issues.json` for anything broken you pass on the way. You're
the only one looking.

### 3f. Write it

Write `{featureId}.{surfaceId}.json` per
[`references/output-format.md`](references/output-format.md), and update the
feature's `surfaceStatus` in the catalog.

Descriptions are markdown and are rendered through the hub's `<Prose>` — use
`**bold**`, `` `code` ``, links and lists freely; don't flatten or escape them.
Write about what the *user* gets, not what the DOM contains. "The form rejects a
national id that fails its checksum, before any request is sent" is
documentation. "A red div appears below the input" is not.

---

## Step 4 — Persona journeys

A feature walk answers "what does this screen do". A persona journey answers
"what happened to this person" — and it's the artifact non-engineers actually
read. Every project should ship at least one.

Full runbook: [`references/personas.md`](references/personas.md). In short: 5–9
scenes forming an arc that ends at a real payoff, narrated in the persona's
terms, reusing feature captures where they fit and capturing the connective
tissue where they don't. Write
`apps/hub/public/walkthroughs/{slug}/persona-{personaId}.{journeyId}.json`.

Two things a journey can do that a feature walk cannot, and both are worth
reaching for:

- **A scene can override the journey's surface.** One mobile beat inside an
  otherwise-desktop journey is a shape the old per-walkthrough `viewport`
  field could not express at all. Set `surface` on the scene.
- **A scene can cite the feature walk it draws on** via `sourceFeature`, so
  the journey is a re-sequencing of known-good captures rather than a second,
  divergent account of the same UI.

Archetype to clone:
[`scripts/walk-wikipedia-personas.mjs`](../../../../scripts/walk-wikipedia-personas.mjs)
— two personas with genuinely different paths through one public site,
including the cross-surface scene.

### Then the media

Portrait, scene-setter, and generated moment shots remain optional illustration.
The **walk recording is evidence** and is expected whenever motion or sequence
is part of the payoff. Narration remains optional. Recipe, costs and the
failures that shaped generated media:
[`references/persona-media.md`](references/persona-media.md).

**Check whether you need a key before you reach for one.** You are a model
already: you write every persona bio, step description and finding here with no
API key at all. The only artifacts you may not be able to produce are a PNG of a
face and an MP3 of a voice — so those, and nothing else, are what a provider is
for.

```bash
pnpm run doctor      # what this machine has, and what each gap actually costs
```

Read the illustration line before running the scripts below:

- **You can generate images.** Write the plates directly to
  `public/walkthroughs/<slug>/personas/<id>.png` (2:3) and `<id>-scene.png`
  (3:2) and skip `persona:art` entirely. No provider is configured, nothing is
  charged twice.
- **You cannot** (Claude Code returns text and tool calls, not image files) and
  a provider **is** configured — run the scripts.
- **You cannot and no provider is configured** — stop. The persona card falls
  back to a typographic panel showing where that persona enters the product and
  how many journeys have been walked, which is more useful than a cropped face
  anyway. That is a complete, honest project page. Do **not** treat missing art
  as a blocker, and do **not** go looking for a key in another repository to
  borrow.

```bash
pnpm persona:art     --project=<slug>                    # portrait + scene
pnpm persona:moments --project=<slug> --persona=<id>     # 3 moment plates
pnpm persona:story   --project=<slug> --persona=<id>     # narrated mp4
```

Narration needs no key either: with no `OPENAI_API_KEY`, `persona:story` speaks
through a local Kokoro model whose weights download on first use. `pnpm run doctor`
says which engine is live.

A declared persona with no walked journey is flagged by the hub as
`persona-without-journey`. Declaring one is free; only walking one is evidence.

---

## Step 5 — Verify fixes

Walk the team's recent bug fixes and capture proof that they hold. Candidates:
`git log --grep='^fix' --since='30 days ago'`, closed issues labelled `bug`, and
unverified entries already in `fixes.json`. Recover the pre-fix state with `git
stash` or a worktree at the parent commit, capture before, return to HEAD,
capture after.

**Only the team's committed fixes belong in `fixes.json`.** If *you* installed a
package or restarted a service during the run, that's a run side-effect for the
summary, not a verified fix. Every entry must trace to a commit, a closed issue,
or a prior run. See [`references/verify-mode.md`](references/verify-mode.md).

---

## Step 6 — Record the run

Append a `RunManifest` to `runs.json`. Append-only — never rewrite a historical
entry, because each one is the baseline a later staleness check measures against.

Set `target.sha` by asking the target repo directly:

```bash
git -C <codebase.local> log -1 --pretty=%H -- .
```

so drift detection works even for runs made out of band. Full contract:
[`references/run-history.md`](references/run-history.md).

**Before a re-run, check the existing history.** If the latest run is `fresh` and
the target sha hasn't moved, there is nothing new to capture — say so and
confirm the user still wants to spend the time.

---

## Step 7 — Report

One consolidated summary. This is how the user knows what to look at:

```
Walkthrough complete · {app name} ({platform})

  features   {done}/{total} walked        ({blocked} blocked, {skipped} skipped)
  personas   {done}/{total}
  captures   {n} across {surfaces}
  fixes      {verified} verified
  issues     {n} open  ({blockers} blocking)

  run recorded against {sha-short}

Open http://localhost:3000/{slug}

Next:
  · {specific thing that needs attention}
  · /walkthrough --fix        fix what was found
  · /walkthrough --persona X  walk the personas with no journey yet
```

If the hub's quality banner would flag something you produced, fix it before
reporting rather than shipping a run that fails its own checks.

---

## References

**Contracts**
- [`references/output-format.md`](references/output-format.md) — every JSON shape. The single source of truth; don't write files from memory.
- [`references/run-history.md`](references/run-history.md) — run manifests and staleness.
- [`references/quality-invariants.md`](references/quality-invariants.md) — what the hub checks, and how to not trip it.

**Doing the work**
- [`references/catalog-discovery.md`](references/catalog-discovery.md) — finding features, per platform.
- [`references/personas.md`](references/personas.md) — detecting personas; the journey runbook.
- [`references/persona-media.md`](references/persona-media.md) — portraits, scene-setters, moment shots, the story video, and the honesty rule that makes generated art defensible.
- [`references/auth.md`](references/auth.md) — credential resolution, session reuse, interactive gates.
- [`references/verify-mode.md`](references/verify-mode.md) — before/after proof for fixes.
- [`references/pr-mode.md`](references/pr-mode.md) — PRs whose body shows what changed for the user.
- [`references/troubleshooting.md`](references/troubleshooting.md) — symptoms and causes.

**Drivers**
- [`drivers/web-playwright.md`](drivers/web-playwright.md)
- [`drivers/ios-simulator.md`](drivers/ios-simulator.md)
- [`drivers/android-emulator.md`](drivers/android-emulator.md)
- [`drivers/desktop.md`](drivers/desktop.md)
- [`drivers/cli-terminal.md`](drivers/cli-terminal.md)

**The capture layer** *(web; use it rather than re-implementing the invariants)*
- [`scripts/lib/capture/index.mjs`](../../../../scripts/lib/capture/index.mjs) — `openCapture()` and the standard surfaces. Picks a backend, or takes one you name.
- [`scripts/lib/capture/invariants.mjs`](../../../../scripts/lib/capture/invariants.mjs) — the invariants and their assertions. Each carries the failure that motivated it.
- [`scripts/lib/capture/driver-contract.mjs`](../../../../scripts/lib/capture/driver-contract.mjs) — implement this to add a backend.
- [`docs/findings/capture-backends-2026-09-18.md`](../../../../docs/findings/capture-backends-2026-09-18.md) — which backends can meet which invariant, measured. **Read this before proposing that an agent browser drive captures.**

**Reference implementations**
- [`scripts/walk-wikipedia.mjs`](../../../../scripts/walk-wikipedia.mjs) — **the archetype to clone.** It is self-contained, runs against a public site without credentials, and explains why each capture invariant exists. Read it to understand the mechanics, then adapt it for your target app.
- [`scripts/walk-wikipedia-personas.mjs`](../../../../scripts/walk-wikipedia-personas.mjs) — two persona journeys over the same site, including a scene that switches surface mid-journey and a hard failure when an asserted interaction doesn't happen.
