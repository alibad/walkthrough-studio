# Adding a platform or a surface

## A new surface on an existing platform

The common case: an iPad size, a second phone, an 80-column terminal.

**If it's broadly useful**, add it to `BUILTIN_SURFACES` in
[`apps/hub/src/lib/surfaces.ts`](../apps/hub/src/lib/surfaces.ts):

```ts
{
  id: "iphone-se",              // load-bearing: appears in paths and runs.json
  label: "iPhone SE",
  platform: "ios",
  width: 375, height: 667,      // LOGICAL units — points here, not pixels
  scale: 2,
  frame: "phone",
  orientation: "portrait",
  deviceName: "iPhone SE (3rd generation)",
}
```

**If it's specific to one app**, declare it in that project's
`catalog.json › surfaces` instead. Project surfaces take precedence over
built-ins with the same id, so a project can also override a preset's
dimensions.

Optionally add it to `DEFAULT_SURFACE_IDS[platform]` to have it captured by
default, and note that `orderSurfaces()` uses that list for display order — so
"Desktop, Mobile" doesn't render as "Mobile, Desktop" because of map iteration
order.

An unrecognised surface id still renders, unframed with a raw slug for a label,
and the hub flags it as `unknown-surface`. Nothing breaks; it just looks wrong
until someone adds the definition.

## A new frame kind

Only when an existing frame genuinely misrepresents the artifact — a watch face,
a car head unit, a TV.

1. Add it to `FrameKind` in [`types.ts`](../apps/hub/src/lib/types.ts).
2. Add a case and a component in
   [`surface-frame.tsx`](../apps/hub/src/components/surface-frame.tsx).

Follow the existing frames' register: **hairline ink on paper, small radii, and
print the location in the chrome.** These are printed diagrams of devices, not
renders of them — a glossy aluminium bezel would be the loudest thing on a page
whose job is to show someone else's screenshot.

## A whole new platform

Say, `watchos` or `tv`. Five places, in order:

**1. [`types.ts`](../apps/hub/src/lib/types.ts)** — add to `Platform` and
`PLATFORMS`; add an entry to `DRIVERS_BY_PLATFORM` and to `LOCATION_KIND`
(what a `location` means there, plus an example). Add any new driver to
`CaptureDriver`.

**2. [`platforms.ts`](../apps/hub/src/lib/platforms.ts)** — a `PlatformProfile`:
label, short label, a one-line blurb on what this platform means for a
walkthrough, a Lucide icon, the path to its stipple emblem, the default driver,
and the driver doc path. Add a `DRIVER_LABELS` entry.

**3. [`surfaces.ts`](../apps/hub/src/lib/surfaces.ts)** — at least one surface,
and a `DEFAULT_SURFACE_IDS` entry.

**4. A driver guide** at
`plugins/walkthrough/skills/walkthrough/drivers/<platform>.md`, and a row in
SKILL.md's Step 0 table. This is the most important part and the easiest to
under-do. Cover:

- **Bring-up**, including how to wait for *actually ready* rather than
  *process started* — this is where most platforms bite.
- **How to verify you're driving the build you just made.** Every platform has
  a way to silently run a stale artifact, and it's the most wasted-run failure
  there is.
- **How to make captures deterministic** — clock, animations, cursor, locale,
  timezone.
- **How to find elements** — the tree, not coordinates read off a screenshot.
- **What's impossible**, so `blocked` is used accurately rather than becoming a
  synonym for "hard".

**5. An emblem.** Add an entry to `MANIFEST` in
[`scripts/generate-creatives.mjs`](../scripts/generate-creatives.mjs) and run
it. Keep the shared STYLE preamble untouched — that's what makes the set cohere
— and describe only the object. Specify screen content as abstract geometry;
the model will otherwise fill it with garbled text.

Then update the `GLOBAL_PATTERNS` in
[`run-history.ts`](../apps/hub/src/lib/run-history.ts) with the files that mean
"this affects every feature" on the new platform — its theme file, its manifest,
its app entry point. Err permissive: over-reporting costs a reader a minute,
under-reporting costs them their trust in the tool.

## A new quality check

In [`catalog-health.ts`](../apps/hub/src/lib/catalog-health.ts): add to
`IssueKind`, implement the detection, push a `CatalogIssue`.

Two rules:

- **`warning` means "this is wrong and misleads a reader".** `info` means "this
  is worth a look". Don't inflate — a banner of warnings that are really
  suggestions trains people to ignore the banner, which costs you the real ones.
- **Every check needs a matching section in
  [`quality-invariants.md`](../plugins/walkthrough/skills/walkthrough/references/quality-invariants.md)**
  with the cause and the prevention. A check that tells an agent it failed
  without telling it why is a check it will fail again.
