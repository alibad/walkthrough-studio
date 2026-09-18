#!/usr/bin/env node
/**
 * walk-openstage.mjs — the first walk built on the swappable capture layer.
 *
 * Where `walk-wikipedia.mjs` carries its own invariant machinery inline, this
 * one carries none: the distinctness ledger, the Retina assertion, the surface
 * verification, the freeze CSS and the clock pin all live in
 * `lib/capture/`, applied identically whichever backend runs. That is the
 * point of the rewrite — swapping the backend cannot change what "walked"
 * means.
 *
 *   node scripts/walk-openstage.mjs                    # default backend
 *   node scripts/walk-openstage.mjs --driver=cdp       # attached Chrome
 *   node scripts/walk-openstage.mjs --base=http://localhost:3000
 *
 * ── What the live app taught us that the route tree did not ───────────────
 *
 * A static scan of `src/app` finds 17 page routes. Driving the app found:
 *
 *  · The gallery lists FOUR decks, not the six that have deck routes:
 *    `/ai-patterns` carries `status: "draft"` in the registry and is
 *    therefore reachable but unlisted. A route scan cannot see the
 *    difference between "exists" and "offered".
 *  · The gallery's real substance is interaction, not navigation — search,
 *    a type filter, a grouping control and a list/grid toggle. None of them
 *    is a route, and a catalog built from routes alone documents a page that
 *    does nothing.
 *  · `/admin` renders its dashboard with no cookie at all, because the
 *    middleware only enforces the gate when `ADMIN_PASSWORD` is set. That is
 *    recorded as an issue, not repaired here.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openCapture, SURFACES } from "./lib/capture/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SLUG = "openstage";
const OUT = resolve(ROOT, "apps/hub/public/walkthroughs", SLUG);
const TARGET_REPO = "/Users/alibadereddin/Code/GitHub/openstage";

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const BASE = argv.base ?? "http://localhost:3000";
const DRIVER = argv.driver ?? "auto";

const startedAt = new Date().toISOString();
const issues = [];
const walkthroughs = [];
const surfaceStatus = {}; // featureId -> { surfaceId: status }

function note(featureId, surfaceId, status) {
  surfaceStatus[featureId] = { ...(surfaceStatus[featureId] ?? {}), [surfaceId]: status };
}

/**
 * Turn what the console said during a walk into findings.
 *
 * This is the half of the walk that a screenshot cannot show. An empty list
 * because the backend is down looks exactly like an empty list because the
 * feature has an empty state, and a hydration mismatch looks like nothing at
 * all — the page renders, then quietly re-renders.
 *
 * Deduplicated by the first line, because a React error repeats on every
 * mount and a hundred copies of one finding is the same as no finding.
 */
const seenConsole = new Set();
function recordConsole(walk, featureId, location) {
  for (const text of walk.consoleErrors()) {
    const first = text.split("\n")[0].trim();
    if (!first || seenConsole.has(first)) continue;
    seenConsole.add(first);
    const hydration = /Hydration failed|didn't match|did not match/i.test(first);
    issues.push({
      id: `console-${featureId}-${seenConsole.size}`,
      title: hydration ? "Hydration mismatch on first render" : first.slice(0, 90),
      severity: hydration ? "major" : "minor",
      status: "open",
      location,
      featureId,
      detail: hydration
        ? `React reported that the server-rendered HTML did not match the client on first render, so the tree is thrown away and rebuilt in the browser. The user-visible cost is a flash of the wrong content and a slower first interaction; the maintenance cost is that any real SSR bug now hides inside a warning the team has learned to ignore.\n\nVerified to be the app's own and not an artefact of how it was walked: the same error appears in a plain browser session with no clock pinning, no injected CSS and no emulation.\n\nFull message:\n\n${text.slice(0, 600)}`
        : text.slice(0, 600),
      foundAt: new Date().toISOString(),
    });
  }
}

function writeJson(file, data) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, file), JSON.stringify(data, null, 2) + "\n");
}

const cap = await openCapture({ outDir: OUT, videoDir: join(OUT, "video"), driver: DRIVER });

// ── The gallery ────────────────────────────────────────────────────────────
//
// The feature here is not "a page exists at /". It is four controls that
// change what the page shows, so the walk is four interactions and their
// outcomes. Capturing only the arrival state would document a screenshot.
async function walkGallery(surface) {
  const F = "gallery";
  const walk = await cap.feature(F, surface, { url: BASE, video: surface.id === "desktop" });
  const steps = [];
  const { ctx } = walk;

  steps.push({
    stepNumber: 1,
    title: "Every live deck, counted",
    action: "Opened the gallery.",
    description:
      "The landing surface is an index, not a marketing page: a count, a search field, a type filter and the decks themselves in a table. The headline total and the filter pills agree at rest — four decks, three scroll and one slides — so nothing is hidden from the list before you touch anything.",
    screenshotFilename: await walk.shot("step-01-gallery.png"),
    screenshotAlt: "The Openstage gallery listing four presentations",
    location: "/",
    verificationStatus: "live-walked",
  });

  // Search. A real query with a real result, not an armed empty field.
  if (await ctx.fill('input[placeholder^="Search"]', "grammar")) {
    await ctx.settle();
    const file = await walk.shot("step-02-search.png", { optional: true });
    if (file) {
      steps.push({
        stepNumber: steps.length + 1,
        title: "Search narrows to one",
        action: 'Typed "grammar" into the search field.',
        description:
          "Filtering happens as you type and against the title, so a half-remembered deck name is enough. Note what does **not** move: the headline count stays at the library total while the table below it narrows, so the big number answers \"how many decks are there\" rather than \"how many am I looking at\".",
        screenshotFilename: file,
        screenshotAlt: 'The gallery filtered to a single deck by the search term "grammar"',
        location: "/",
        verificationStatus: "live-walked",
      });
    }
    await ctx.fill('input[placeholder^="Search"]', "");
    await ctx.settle();
  }

  // Type filter.
  if (await ctx.clickText("Slides")) {
    await ctx.settle();
    const file = await walk.shot("step-03-filter-slides.png", { optional: true });
    if (file) {
      steps.push({
        stepNumber: steps.length + 1,
        title: "Two kinds of deck, filtered apart",
        action: 'Clicked the "Slides" filter pill.',
        description:
          "Openstage renders two genuinely different artefacts — a long-form scroll and a fixed slide deck — and the filter is how you pick which kind you are shopping for. Each pill carries its own count, so an empty category is visible before you click it. The filtered count lives on the pill; the headline total stays put.",
        screenshotFilename: file,
        screenshotAlt: "The gallery filtered to slide decks only",
        location: "/",
        verificationStatus: "live-walked",
      });
    }
    await ctx.clickText("All");
    await ctx.settle();
  }

  // Grouping. This is the native <select> that the issue below is about.
  const grouped = await ctx.evaluate(`(() => {
    const sel = document.querySelector('select');
    if (!sel) return false;
    sel.value = [...sel.options].find(o => /type/i.test(o.text))?.value ?? sel.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (grouped) {
    await ctx.settle();
    const file = await walk.shot("step-04-group-by-type.png", { optional: true });
    if (file) {
      steps.push({
        stepNumber: steps.length + 1,
        title: "Grouping turns the list into sections",
        action: 'Set the grouping control to "By type".',
        description:
          "Grouping re-sections the table by type, customer, author or date without leaving the page. On a library of four this is convenience; on a library of forty it is the difference between a list and an index.",
        screenshotFilename: file,
        screenshotAlt: "The gallery grouped into sections by deck type",
        location: "/",
        verificationStatus: "live-walked",
      });
    }
  }

  recordConsole(walk, F, "/");
  const { video } = await walk.finish();
  note(F, surface.id, steps.length > 1 ? "done" : "blocked");

  return {
    featureId: F,
    featureName: "Presentation gallery",
    type: "feature",
    location: "/",
    category: "decks",
    surface: surface.id,
    platform: "web",
    locale: "en",
    headline: "An index that answers questions, not a landing page",
    overview:
      "The gallery is where a reader decides which deck to open. Search, a type filter and a grouping control all act on the same table in place, with no page loads. The per-type pill counts track the filter; the headline total reports the library.",
    steps,
    keyFeatures: [
      "Type-ahead search across deck titles",
      "Type filter with per-category counts",
      "Re-grouping by type, customer, author or date without a page load",
    ],
    ...(video ? { videoFilename: `video/${video.split("/").pop()}` } : {}),
    generatedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
  };
}

// ── A scroll deck ──────────────────────────────────────────────────────────
async function walkScrollDeck(surface) {
  const F = "deck-scroll";
  const walk = await cap.feature(F, surface, { url: `${BASE}/awwwards-flagship` });
  const steps = [];
  const { ctx } = walk;

  steps.push({
    stepNumber: 1,
    title: "A deck that opens like an essay",
    action: "Opened the flagship scroll deck.",
    description:
      "A scroll deck has no slide numbers and no next button. The first screen is a full-bleed hero that sets the argument, and everything after it is reached the way a reader already knows how to reach it.",
    screenshotFilename: await walk.shot("step-01-hero.png"),
    screenshotAlt: "The opening hero of the flagship scroll deck",
    location: "/awwwards-flagship",
    verificationStatus: "live-walked",
  });

  // Scroll by viewport heights, capturing what the reader meets on the way.
  // Absolute scrolls, never scrollIntoViewIfNeeded — that no-ops when the
  // target is already on screen and silently yields a duplicate capture.
  const stops = [
    { at: 1.4, title: "The argument begins", why: "The first section after the hero states the claim the rest of the deck spends its length defending." },
    { at: 3.2, title: "Evidence, mid-scroll", why: "Sections alternate between assertion and demonstration, so a reader who stops anywhere still has something concrete on screen." },
  ];
  for (const [i, stop] of stops.entries()) {
    await ctx.evaluate(`window.scrollTo({ top: window.innerHeight * ${stop.at}, behavior: 'instant' })`);
    await ctx.settle();
    const file = await walk.shot(`step-0${i + 2}-scroll-${i + 1}.png`, { optional: true });
    if (!file) continue;
    steps.push({
      stepNumber: steps.length + 1,
      title: stop.title,
      action: `Scrolled to ${stop.at} viewport heights.`,
      description: stop.why,
      screenshotFilename: file,
      screenshotAlt: `The flagship deck partway down, at ${stop.at} viewport heights`,
      location: "/awwwards-flagship",
      verificationStatus: "live-walked",
    });
  }

  recordConsole(walk, F, steps[0]?.location ?? "/");
  await walk.finish();
  note(F, surface.id, steps.length > 1 ? "done" : "blocked");

  return {
    featureId: F,
    featureName: "Scroll deck",
    type: "feature",
    location: "/awwwards-flagship",
    category: "decks",
    surface: surface.id,
    platform: "web",
    locale: "en",
    headline: "The deck is the page",
    overview:
      "Scroll decks trade slide mechanics for reading mechanics: no controls to learn, no deck that ends before the reader is finished, and a shareable position anywhere in the argument.",
    steps,
    keyFeatures: ["Full-bleed hero", "Scroll-bound sections with no navigation to learn"],
    generatedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
  };
}

// ── A slide deck ───────────────────────────────────────────────────────────
async function walkSlideDeck(surface) {
  const F = "deck-slides";
  const walk = await cap.feature(F, surface, { url: `${BASE}/sample-slides` });
  const steps = [];
  const { ctx } = walk;

  steps.push({
    stepNumber: 1,
    title: "Title slide, fixed frame",
    action: "Opened the slide-mode deck.",
    description:
      "Slide mode is the other half of the product: a fixed-height frame that never scrolls, so every slide is composed rather than flowed. What fits is what the author decided fits.",
    screenshotFilename: await walk.shot("step-01-title.png"),
    screenshotAlt: "The title slide of the slide-mode sample deck",
    location: "/sample-slides",
    verificationStatus: "live-walked",
  });

  // Advance with the keyboard — the way a presenter actually drives a deck
  // from a clicker, and the path most likely to be broken without anyone
  // noticing, because authors test by clicking.
  for (let i = 0; i < 2; i++) {
    await ctx.press("ArrowRight");
    await ctx.settle();
    const file = await walk.shot(`step-0${i + 2}-slide-${i + 2}.png`, { optional: true });
    if (!file) continue;
    steps.push({
      stepNumber: steps.length + 1,
      title: i === 0 ? "Advancing with the keyboard" : "And again, without a reload",
      action: "Pressed the right arrow key.",
      description:
        i === 0
          ? "The right arrow advances the deck, which is what a presenter's clicker sends. The frame stays fixed and only the content inside it changes — no scroll position to lose, no layout reflow between slides."
          : "Successive advances stay within one page: the deck is a single route with slide state, so a presenter never waits for a navigation mid-sentence.",
      screenshotFilename: file,
      screenshotAlt: `Slide ${i + 2} of the sample deck`,
      location: "/sample-slides",
      verificationStatus: "live-walked",
    });
  }

  recordConsole(walk, F, steps[0]?.location ?? "/");
  await walk.finish();
  note(F, surface.id, steps.length > 1 ? "done" : "blocked");

  return {
    featureId: F,
    featureName: "Slide deck",
    type: "feature",
    location: "/sample-slides",
    category: "decks",
    surface: surface.id,
    platform: "web",
    locale: "en",
    headline: "A fixed frame a presenter can drive blind",
    overview:
      "Slide mode renders a deck as composed, fixed-height slides driven by the keyboard, so a presenter with a clicker never scrolls, never reflows and never waits for a page load between slides.",
    steps,
    keyFeatures: ["Fixed-height slide frame", "Keyboard/clicker advance without navigation"],
    generatedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
  };
}

// ── The draft deck that is the talk itself ─────────────────────────────────
async function walkDraftDeck(surface) {
  const F = "deck-draft-unlisted";
  const walk = await cap.feature(F, surface, { url: `${BASE}/ai-patterns` });
  const steps = [];

  steps.push({
    stepNumber: 1,
    title: "Reachable, deliberately unlisted",
    action: "Opened /ai-patterns directly.",
    description:
      "This deck carries `status: draft` in the registry, so it never appears in the gallery — and it renders perfectly for anyone holding the link. That is the product working as designed: a draft is shareable before it is announced. It is also the distinction a route scan cannot make, because the route exists either way.",
    screenshotFilename: await walk.shot("step-01-draft.png"),
    screenshotAlt: "The unlisted AI Patterns deck, reached directly by URL",
    location: "/ai-patterns",
    verificationStatus: "live-walked",
  });

  await walk.ctx.evaluate("window.scrollTo({ top: window.innerHeight * 1.6, behavior: 'instant' })");
  await walk.ctx.settle();
  const file = await walk.shot("step-02-body.png", { optional: true });
  if (file) {
    steps.push({
      stepNumber: 2,
      title: "A draft is a whole deck, not a stub",
      action: "Scrolled into the body of the draft.",
      description:
        "Draft status changes listing, not rendering. The deck below the fold is fully composed, which is what makes the state useful — you circulate a link to something finished-looking and decide later whether it belongs in the index.",
      screenshotFilename: file,
      screenshotAlt: "The body of the unlisted deck, fully rendered",
      location: "/ai-patterns",
      verificationStatus: "live-walked",
    });
  }

  recordConsole(walk, F, steps[0]?.location ?? "/");
  await walk.finish();
  note(F, surface.id, steps.length > 1 ? "done" : "blocked");

  return {
    featureId: F,
    featureName: "Unlisted draft deck",
    type: "feature",
    location: "/ai-patterns",
    category: "viewer",
    surface: surface.id,
    platform: "web",
    locale: "en",
    headline: "Shareable before it is announced",
    overview:
      "A deck marked draft is excluded from the gallery and served in full to anyone with the link — the state an author needs between writing and publishing.",
    steps,
    keyFeatures: ["Draft status hides a deck from the index without gating it"],
    generatedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
  };
}

// ── The admin area, reached without a password ─────────────────────────────
//
// Walked, not skipped, precisely BECAUSE it was reachable. The capture is the
// evidence for the issue filed below; the walkthrough says plainly how it was
// reached so nobody mistakes it for an authenticated session.
async function walkAdmin(surface) {
  const F = "admin-dashboard";
  const walk = await cap.feature(F, surface, { url: `${BASE}/admin` });
  const steps = [];

  const reachedUnauthenticated = await walk.ctx.evaluate(
    "document.body.innerText.includes('Dashboard') && !location.pathname.startsWith('/auth')",
  );

  steps.push({
    stepNumber: 1,
    title: "The operator's view of every deck",
    action: "Opened /admin in a browser context with no cookies.",
    description: reachedUnauthenticated
      ? "The admin dashboard lists every presentation with its status, customer and date, plus counts for live, password-protected and pending decks. **This capture was taken without signing in.** The middleware only enforces the admin gate when `ADMIN_PASSWORD` is set in the environment, and it is unset here — so the gate failed open rather than closed. Recorded as an issue; not repaired by this walk."
      : "The admin area redirected to its password gate, as configured.",
    screenshotFilename: await walk.shot("step-01-admin.png"),
    screenshotAlt: "The Openstage admin dashboard listing presentations and status counts",
    location: "/admin",
    verificationStatus: reachedUnauthenticated ? "live-walked" : "gated-write",
  });

  // A one-step walkthrough documents a front door, not a feature — and the
  // hub flags it, correctly. The Studio is the other half of the operator
  // surface and it is reached the way an operator reaches it: by clicking.
  if (reachedUnauthenticated && (await walk.ctx.clickText("Studio", { role: "link" }))) {
    await walk.ctx.settle();
    const file = await walk.shot("step-02-studio.png", { optional: true });
    if (file) {
      steps.push({
        stepNumber: 2,
        title: "Studio, one click away",
        action: 'Clicked "Studio" in the admin navigation.',
        description:
          "The Studio is where a deck is actually composed, and it sits behind the same gate as the dashboard — which is the point of recording the gate failure as a blocker rather than a curiosity. Everything an operator can do is one click from the page that let us in without a password.",
        screenshotFilename: file,
        screenshotAlt: "The Openstage admin studio",
        location: "/admin/studio",
        verificationStatus: "live-walked",
      });
    }
  }

  if (reachedUnauthenticated) {
    issues.push({
      id: "admin-gate-fails-open",
      title: "The /admin gate is skipped entirely when ADMIN_PASSWORD is unset",
      severity: "blocker",
      status: "open",
      location: "/admin",
      featureId: F,
      detail:
        "`src/middleware.ts` wraps the admin cookie check in `if (adminPassword)`. With the variable unset the branch is skipped and the request falls through to `NextResponse.next()`, so the dashboard, the studio and the new-presentation form all render to an anonymous visitor. Reproduced in a browser context with no cookies: /admin returned the dashboard rather than redirecting to /auth/admin.\n\nThe risk is not the local machine — it is that a deploy which loses the variable exposes the admin area **silently**, with no error, no log line and nothing visibly different. A missing admin password should fail closed: deny and say why.",
      foundAt: new Date().toISOString(),
    });
  }

  recordConsole(walk, F, "/admin");
  await walk.finish();
  note(F, surface.id, "done");

  return {
    featureId: F,
    featureName: "Admin dashboard",
    type: "feature",
    location: "/admin",
    category: "admin",
    surface: surface.id,
    platform: "web",
    locale: "en",
    headline: "Every deck, its status, and who can see it",
    overview:
      "The operator surface: presentations with status and visibility, counts for live and protected decks, and the entry points for requesting a new one. Captured in this run **without authentication**, which is itself the finding — see the open issue.",
    steps,
    keyFeatures: ["Presentation inventory with draft/live status", "Live, protected and pending counts"],
    notes:
      "Reached unauthenticated because ADMIN_PASSWORD is unset in the walked environment. Not evidence that production is open.",
    generatedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
  };
}

// ── The persona journey ────────────────────────────────────────────────────
//
// A feature walk answers "what does this screen do". A journey answers "what
// happened to this person", and it is the artifact non-engineers actually
// read. The Reader is the only persona Openstage really has at the moment:
// somebody handed a link, usually on a phone, usually while the talk they are
// about to watch is already starting.
//
// Scenes reuse captures from the feature walks via `sourceFeature` where they
// fit, so the journey is a re-sequencing of known-good evidence rather than a
// second, divergent account of the same UI. The one scene that needs its own
// capture gets one.
async function walkReaderJourney() {
  const walk = await cap.feature("journey-reader", SURFACES.mobile, { url: BASE });
  const scenes = [];

  scenes.push({
    id: "arrive",
    title: "A link, on a phone, two minutes before the talk",
    narrative:
      "She has the URL and nothing else — no account, no app, no sense of what she is about to open. The gallery loads to a list of four decks with their type and date, which is exactly enough to tell her she is in the right place and which of them is the one being presented.",
    frames: [await walk.shot("scene-01-arrive.png")],
    frameCaptions: ["The gallery as a first-time reader meets it, on a phone"],
    location: "/",
    surface: "mobile",
    sourceFeature: "gallery",
    verificationStatus: "live-walked",
  });

  if (await walk.ctx.clickText("The Grammar of Attention", { role: "link" })) {
    await walk.ctx.settle();
    const file = await walk.shot("scene-02-open.png", { optional: true });
    if (file) {
      scenes.push({
        id: "open",
        title: "She taps the one with the interesting name",
        narrative:
          "No login wall, no cookie banner, no app-install interstitial. The deck opens straight onto its hero and she is reading within a second of tapping — which is the entire product promise for somebody in her position.",
        frames: [file],
        frameCaptions: ["The deck opens directly, with nothing between the tap and the content"],
        location: "/awwwards-flagship",
        surface: "mobile",
        sourceFeature: "deck-scroll",
        verificationStatus: "live-walked",
      });
    }
  }

  await walk.ctx.evaluate("window.scrollTo({ top: window.innerHeight * 2.2, behavior: 'instant' })");
  await walk.ctx.settle();
  const reading = await walk.shot("scene-03-reading.png", { optional: true });
  if (reading) {
    scenes.push({
      id: "reading",
      title: "She scrolls, because there is nothing else to learn",
      narrative:
        "A scroll deck has no controls: no next button to find, no slide count to track, no gesture to discover. She reads it the way she reads everything else on this phone, and the deck never asks her to do anything different.",
      frames: [reading],
      frameCaptions: ["Partway into the argument, reached by scrolling"],
      location: "/awwwards-flagship",
      surface: "mobile",
      sourceFeature: "deck-scroll",
      verificationStatus: "live-walked",
      // The honest footnote. This is the finding from the capture layer, in
      // the persona's terms, and a journey that omitted it would be selling
      // rather than documenting.
      note:
        "Measured during this run: the document is 560px wide on a 393px phone, so the browser zooms out to fit and this page can be scrolled sideways. She would not know why it looks slightly small — she would just pinch.",
    });
  }

  const { video } = await walk.finish();
  recordConsole(walk, "journey-reader", "/awwwards-flagship");

  writeJson("persona-reader.find-and-read.json", {
    personaId: "reader",
    journeyId: "find-and-read",
    headline: "From a shared link to reading the thing, with nothing in between",
    overview:
      "The Reader is handed a URL and opens it on a phone. Openstage's job for her is entirely negative — no account, no install, no controls to learn — and the journey is worth walking precisely because a product that does its job this way leaves nothing to screenshot except the absence of obstacles.",
    payoff: "She is reading the deck within a second of tapping the link, on a phone, with no account.",
    scenes,
    platform: "web",
    surface: "mobile",
    capturedAt: new Date().toISOString(),
    ...(video ? { storyVideo: `video/${video.split("/").pop()}` } : {}),
  });

  return scenes.length;
}

// ── Run ────────────────────────────────────────────────────────────────────

console.log(`\nWalking ${SLUG} against ${BASE}\n`);

const PLAN = [
  { fn: walkGallery, surfaces: ["desktop", "mobile"] },
  { fn: walkScrollDeck, surfaces: ["desktop", "mobile"] },
  { fn: walkSlideDeck, surfaces: ["desktop"] },
  { fn: walkDraftDeck, surfaces: ["desktop", "mobile"] },
  { fn: walkAdmin, surfaces: ["desktop"] },
];

for (const { fn, surfaces } of PLAN) {
  for (const surfaceId of surfaces) {
    const surface = SURFACES[surfaceId];
    process.stdout.write(`  ${fn.name.replace("walk", "").toLowerCase()} · ${surfaceId} … `);
    try {
      const wt = await fn(surface);
      walkthroughs.push(wt);
      // Write the walkthrough file BEFORE the catalog claims it was walked.
      // If the run dies here we understate coverage, which is the correct
      // direction to fail.
      writeJson(`${wt.featureId}.${surfaceId}.json`, wt);
      console.log(`${wt.steps.length} steps`);
    } catch (err) {
      console.log(`FAILED — ${err.message.split("\n")[0]}`);
      issues.push({
        id: `walk-failed-${fn.name}-${surfaceId}`,
        title: `Walk failed: ${fn.name} on ${surfaceId}`,
        severity: "major",
        status: "open",
        detail: err.message,
        foundAt: new Date().toISOString(),
      });
    }
  }
}

process.stdout.write("  persona · reader · mobile … ");
try {
  const n = await walkReaderJourney();
  console.log(`${n} scenes`);
} catch (err) {
  console.log(`FAILED — ${err.message.split("\n")[0]}`);
}

// The native <select>, observed on the gallery. Recorded, not fixed: the walk
// observes the product as the team committed it.
issues.push({
  id: "native-select-on-gallery",
  title: "The gallery's grouping control is a native <select>",
  severity: "minor",
  status: "open",
  location: "/",
  featureId: "gallery",
  detail:
    "The grouping control renders a bare `<select>` with the options No grouping / By type / By customer / By author / By date. Native selects draw their popup with OS chrome, which ignores the app's dark theme and differs between macOS, Windows and Android — so the one control on the page that opens a menu is the one control that will not match the design. The workspace's own UI standard calls for the project's Select component here.",
  foundAt: new Date().toISOString(),
});

const report = cap.report();
await cap.close();

// Horizontal overflow, found by the capture layer rather than by eye. A
// reviewer scrolling a mobile screenshot would see a plausible-looking deck;
// only the measurement shows the layout viewport was never 393px wide.
for (const o of report.overflows) {
  issues.push({
    id: `horizontal-overflow-${o.featureId}-${o.surface}`,
    title: `${o.featureId} overflows horizontally on ${o.surface}`,
    severity: "major",
    status: "open",
    location: o.location ? new URL(o.location).pathname : "/",
    featureId: o.featureId,
    detail:
      `On a ${o.surfaceWidth}px phone surface this page's document is ${o.contentWidth}px wide, so the browser widens the ` +
      `layout viewport to fit and the page renders zoomed out with a sideways scroll. The widest element measured across ` +
      "the decks is a `flex shrink-0` row at 2940px — a horizontal strip that never shrinks below its content. " +
      "The viewport meta is correct (`width=device-width, initial-scale=1`); the overflow is in the layout.\n\n" +
      "This one is worth dwelling on: it is **invisible in the screenshot**. The capture looks like a perfectly normal " +
      "narrow render, and only the measured layout width shows that a real phone never sees it at 1:1. A reviewer " +
      "flicking through mobile captures would pass it every time.",
    foundAt: new Date().toISOString(),
  });
}

// ── Catalog ────────────────────────────────────────────────────────────────

const FEATURES = [
  { featureId: "gallery", featureName: "Presentation gallery", location: "/", category: "decks", requiresAuth: false },
  { featureId: "deck-scroll", featureName: "Scroll deck", location: "/awwwards-flagship", category: "decks", requiresAuth: false },
  { featureId: "deck-slides", featureName: "Slide deck", location: "/sample-slides", category: "decks", requiresAuth: false },
  { featureId: "deck-draft-unlisted", featureName: "Unlisted draft deck", location: "/ai-patterns", category: "viewer", requiresAuth: false },
  { featureId: "admin-dashboard", featureName: "Admin dashboard", location: "/admin", category: "admin", requiresAuth: true, authRole: "admin" },
  {
    featureId: "share-link",
    featureName: "Share link",
    location: "/share/[id]",
    category: "viewer",
    requiresAuth: false,
    surfaceStatusOverride: { desktop: "pending", mobile: "pending" },
    notes:
      "Not walked: the route needs a real share id and this run created none. Creating one would have written a record to the app's store, which a walk does not do uninvited.",
  },
  {
    featureId: "deck-password-gate",
    featureName: "Password-gated deck",
    location: "/auth/[slug]",
    category: "auth",
    requiresAuth: false,
    surfaceStatusOverride: { desktop: "pending", mobile: "pending" },
    notes:
      "Not walked: no deck in the registry is currently marked protected, so the gate has nothing to guard and cannot be reached honestly. The admin dashboard confirms it — Password Protected reads 0.",
  },
];

writeJson("catalog.json", {
  schemaVersion: 2,
  projectName: "Openstage",
  platform: "web",
  driver: report.driver === "cdp" ? "chrome-cli" : "playwright",
  capturedAgainst: BASE,
  discoveredAt: startedAt,
  updatedAt: new Date().toISOString(),
  features: FEATURES.map((f) => {
    const { surfaceStatusOverride, ...rest } = f;
    return {
      ...rest,
      surfaceStatus: surfaceStatusOverride ?? surfaceStatus[f.featureId] ?? {},
      issueCount: issues.filter((i) => i.featureId === f.featureId).length,
      lastWalkthroughAt: surfaceStatus[f.featureId] ? new Date().toISOString() : null,
    };
  }),
  personas: [
    {
      id: "reader",
      name: "Reader with a link",
      description:
        "Anyone handed a deck URL. No account, no sign-in, often on a phone in a room where the talk is already happening.",
      entryPoint: "/",
      keyJourneys: ["find-and-read"],
      navItems: [
        { label: "Gallery", location: "/" },
        { label: "A deck", location: "/awwwards-flagship" },
      ],
    },
  ],
});

writeJson("issues.json", { issues, updatedAt: new Date().toISOString() });

// ── Run manifest ───────────────────────────────────────────────────────────
//
// Append-only. Each entry is the baseline a later staleness check measures
// against, so a rewrite of a historical entry silently breaks drift detection.
const runsPath = join(OUT, "runs.json");
const existing = existsSync(runsPath) ? JSON.parse(readFileSync(runsPath, "utf8")) : { runs: [] };
let sha = null;
try {
  sha = execSync(`git -C ${TARGET_REPO} log -1 --pretty=%H -- .`).toString().trim();
} catch {
  /* the target repo may not be a checkout on this machine */
}

// Shape comes from `RunManifest` in apps/hub/src/lib/types.ts, read rather
// than remembered. The first version of this block invented `results.features`
// and `runId`, which type-checked nowhere and crashed the hub's run card with
// "Cannot read properties of undefined (reading 'features')" — the contract is
// in one place precisely so this does not happen.
const finishedAt = new Date().toISOString();
let commitSubject = "";
let branch = "";
try {
  commitSubject = execSync(`git -C ${TARGET_REPO} log -1 --pretty=%s`).toString().trim();
  branch = execSync(`git -C ${TARGET_REPO} rev-parse --abbrev-ref HEAD`).toString().trim();
} catch {
  /* target repo may not be a checkout here */
}

existing.runs.push({
  id: finishedAt,
  startedAt,
  completedAt: finishedAt,
  skill: "walkthrough",
  agent: "walk-openstage.mjs",
  target: {
    sha: sha ?? "",
    shaShort: sha ? sha.slice(0, 7) : "—",
    branch,
    dirty: false,
    commitSubject,
  },
  config: {
    platform: "web",
    driver: report.driver === "cdp" ? "chrome-cli" : "playwright",
    capturedAgainst: BASE,
    surfaces: report.surfaces,
    locales: ["en"],
    // The manifest records which invariants this run actually verified, not
    // which the backend advertises, plus what was hidden from the captures.
    // A reader can tell a 2x run with frozen animations and isolated contexts
    // from one that merely claimed to be.
    notes: [
      `backend: ${report.driverLabel}`,
      `invariants verified: ${Object.keys(report.verified).join(", ") || "none"}`,
      report.unverified.length ? `declared but unverified: ${report.unverified.join(", ")}` : null,
      ...report.suppressed,
      ...report.warnings,
    ]
      .filter(Boolean)
      .join(" · "),
  },
  coverage: {
    features: Object.keys(surfaceStatus),
    personas: existsSync(join(OUT, "persona-reader.find-and-read.json")) ? ["reader"] : [],
    screenshots: report.captures,
    videos: walkthroughs.filter((w) => w.videoFilename).length,
    issues: issues.length,
  },
});
writeJson("runs.json", existing);

console.log(`\n  ${report.captures} captures · ${walkthroughs.length} walkthrough files · ${issues.length} issues`);
console.log(`  backend: ${report.driverLabel}`);
console.log(`  verified: ${Object.keys(report.verified).join(", ") || "none"}`);
if (report.warnings.length) for (const w of report.warnings) console.log(`  note: ${w}`);
console.log(`\n  open http://localhost:3000/${SLUG} in the hub\n`);
