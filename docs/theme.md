# Theme — paper and ink

The design brief in one line: **this should read like a well-made field guide,
not a dashboard.**

Three decisions follow from that. Everything else is downstream.

## 1. One light register. No dark mode.

Unusual for a developer tool, and the reason is the content.

This hub's entire job is to present captured screenshots of *other people's*
apps — and those screenshots bring their own backgrounds. A neutral warm paper
mat frames a capture of a dark app and a light app equally well. A dark chrome
makes every light capture glare and every dark capture dissolve into the page.

The mat serves the content. A theme switcher would double the QA surface for
every component in order to make half of the captures look worse.

The one exception is a **terminal** surface, which is rendered on a dark ground
— a terminal capture *is* dark, and matting it on paper would put a light
border around a black rectangle and read as a mistake.

## 2. One accent.

Vermilion `#b4462f`, spent on exactly three things: the active state, a genuine
warning, and the brand mark.

When one colour carries meaning, a single vermilion dot on a page of ink is
unmissable. Status colours exist — moss, ochre, slate — but they're deliberately
desaturated into the same printed register, so they read as annotations in the
margin rather than as a traffic light bolted onto a book.

Adding a token to `globals.css` is cheap. Adding a second accent is not: it
costs the legibility of the first one.

## 3. Type does the hierarchy, not boxes.

A serif display face (Newsreader) over a humanist sans (Inter), separated by
size and leading rather than by nested cards. Rules are hairlines. Radii are
small — 4px, because a field-guide plate has corners, not pillows. Shadows are
the short crisp kind a print casts lying on a table, never a soft glow.

Monospace (JetBrains Mono) carries **literals**: routes, screen names, commands,
git shas. Anything a reader might need to copy character-for-character is
monospaced, so a stray space or an l-versus-1 is visible.

## Tokens

All in [`apps/hub/src/app/globals.css`](../apps/hub/src/app/globals.css), with
the reasoning inline.

```
paper        #faf8f5   the page
paper-raised #fffefc   cards
paper-sunken #f2eee6   wells, mats, code
paper-deep   #e8e3d9

ink          #1a1815   never pure black — pure black on warm paper reads as a hole
ink-muted    #6b6459
ink-faint    #9c948a

rule         #e2ddd3
rule-strong  #cbc3b5

brand        #b4462f   vermilion — the only accent
brand-deep   #8d3422
brand-wash   #f8ece8

ok    #3f6b4a   warn  #8c6415   alert #a4382a   note  #3c5a78
```

**Note the direction of the paper ladder:** raised surfaces are *lighter* than
the page. The opposite of the dark-UI convention where cards sit lighter to
appear closer. On paper, a card is a whiter sheet laid on a warmer one.

`--primary` is **ink, not the accent**. A page of vermilion buttons would spend
the accent's entire budget on chrome.

## Component classes

Defined in `@layer components` because they appear constantly and six repeated
utilities is worse than one name:

- `.eyebrow` — the small letterspaced label above a heading
- `.display` — display type, tight leading, balanced wrapping
- `.locator` — a route / screen / command chip, monospaced
- `.mat` — the recessed well a capture sits in. The one inset shadow in the
  system: it reads as a window cut into the page, which is exactly what a
  screenshot of another app is.
- `.rule-h` — a hairline that fades out to the right, like a printed rule
- `.nums` — tabular figures, for anything that must line up column to column

## Grain

A fixed SVG noise overlay at 2.2% opacity, above the background and below
content. Just enough to kill the flatness of a solid fill. Any more and it
fights the stipple artwork, which is itself made of dots.

## Illustration

Monochrome stipple engraving, ink on warm paper, in the manner of a 19th-century
printed field-guide plate. Generated with `gpt-image-2` from one shared STYLE
preamble in
[`scripts/generate-creatives.mjs`](../scripts/generate-creatives.mjs), which is
what makes the set cohere as one house style.

Three hard constraints in that preamble, and they're the whole trick:

1. **Strict monochrome**, warm paper ground, dark ink — never a negative.
2. **No text of any kind.** Image models sprinkle garbled lettering into
   anything that looks like a screen, which instantly cheapens the plate. Screens
   are specified as abstract geometry — bars, blocks, rules — instead.
3. **Bare paper, no frame.** No card, no border, no drop shadow, no vignette.

Rendered PNGs go through the [`<Plate>`](../apps/hub/src/components/plate.tsx)
component, which does two non-obvious things:

**`mix-blend-multiply`.** The plates are ink on a warm off-white ground. Dropped
in as opaque rasters, each shows as a visible rectangle a shade off from the
paper around it. Multiplying blends the ground away so only the ink lands. This
one property is the difference between "illustrated" and "has images in it".

**`aria-hidden` by default.** They're decorative, and a screen reader announcing
"image: a pair of brass vernier calipers" before every category heading is
noise. Pass an `alt` only when a plate carries information the surrounding text
doesn't.

`PlateIcon` contains small plates in a fixed square with `object-contain`,
because the generated subjects don't share a scale — a printing press fills more
of its frame than a key does, and containing them keeps a column of headings
optically even without hand-cropping fourteen images.

### Persona art must be identity-consistent

A persona ships a portrait (the avatar) and a scene (the page masthead). Two
independent text-to-image calls from the same description produce **two
different people** — and a reader looking at a persona page sees one face in
the avatar and another in the masthead. It's the kind of defect that's
invisible while you're generating and obvious the moment the page renders.

The fix is reference conditioning: the scene goes through the
`images/edits` endpoint with the portrait attached as a visual reference, and
the prompt states the constraint explicitly ("THE EXACT SAME PERSON as the
reference image — same face, same age, same hair, same skin tone"). In the
manifest that's a `reference` field on the scene entry pointing at the
portrait's filename.

**Manifest order matters for referenced plates.** The portrait must exist
before the scene is generated; the generator throws a clear error rather than
silently falling back to unconditioned generation, because a silent fallback
would reintroduce exactly the bug this fixes.

### Every plate must have a render site

`pnpm creatives` chains generate → optimize → **audit**, and
[`scripts/audit-art.mjs`](../scripts/audit-art.mjs) exits non-zero if a plate is
on disk but rendered nowhere, referenced but missing, or in the manifest with no
`renders:` field.

This is not hygiene theatre. The first pass of this brand generated nine plates
and wired up two — four platform emblems sat in a data field nothing read. The
audit is the same kind of check the hub runs on walkthroughs, applied one level
up to the brand: *don't claim something you didn't do.*

The audit understands the two legitimate indirections, so it doesn't produce
false orphans: category plates resolved through `categoryArt()`'s template, and
persona plates resolved by `getPersonaArt()`'s filename convention.

The **logo and favicon are hand-authored SVG**, not generated: a raster model
can't give you a crisp 16px mark, and the mark has to recolour from CSS tokens.
It's three offset plates — a captured screen and the two behind it — with a
vermilion dot on the current one. Drawn so the two rear plates contribute only
their top and right edges, which is what lets it resolve at favicon size
instead of turning to mush.

## Accessibility

- Ink on paper is 14.8:1. Muted ink is 5.9:1. Faint ink is 3.1:1 and is
  therefore **only** used for non-essential meta text, never for content.
- Vermilion on paper is 5.2:1 — fine for text, and it's never the sole carrier
  of meaning: status pills pair colour with a label and a shape.
- `prefers-reduced-motion` zeroes every transition. Every motion in this app is
  decorative, so there's nothing to preserve.
- Focus is a 2px vermilion ring at 2px offset, never removed.
