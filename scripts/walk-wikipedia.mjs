#!/usr/bin/env node
/**
 * walk-wikipedia.mjs — the reference walk, against a public site.
 *
 * Wikipedia is the sample app because it costs nothing to reproduce: no
 * account, no local build, no secrets, and content under CC BY-SA that is fine
 * to ship screenshots of. Anyone who clones this repo can re-run this and get
 * comparable output, which is the whole point of a reference implementation.
 *
 * The `walkthrough` skill points agents here as the archetype to clone, so
 * it's written to be read: every non-obvious capture decision carries a
 * comment saying why, and several of those comments exist because that exact
 * mistake shipped once.
 *
 * ── Lessons baked in ───────────────────────────────────────────────────────
 *
 *  1. **Interact between every capture, and prove it.** `shot()` hashes each
 *     capture against EVERY capture already taken in the walk — not just the
 *     previous one. A one-step lookback let a real duplicate through: step 3
 *     matched step 1 (a tab that was already active) but differed from step 2.
 *
 *  2. **Viewport first, then navigate.** Configure the context before loading.
 *     Resizing a loaded page produces a layout that only exists mid-resize.
 *
 *  3. **Wait for conditions, not durations.** Fonts before pixels. The
 *     suggestion menu before the suggestion capture. A bare `waitForTimeout`
 *     is a guess that flakes on a slow machine and wastes time on a fast one.
 *
 *  4. **`scrollIntoViewIfNeeded()` is a trap.** It does nothing when the
 *     element is already visible, so using it to reach a state silently
 *     produces a duplicate. `scrollTo()` below always scrolls, and offsets for
 *     the sticky header.
 *
 *  5. **Suppress transient overlays, and say that you did.** Wikipedia serves
 *     fundraising banners that vary by day and geography. Left in, no two runs
 *     are comparable. They're hidden here and the suppression is recorded in
 *     `runs.json › config.notes` — hiding chrome silently would be the
 *     dishonest version.
 *
 * Usage:
 *   node scripts/walk-wikipedia.mjs
 *   node scripts/walk-wikipedia.mjs --article=Engraving
 */

import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SLUG = "wikipedia";
const OUT = resolve(ROOT, "apps/hub/public/walkthroughs", SLUG);

const argv = process.argv.slice(2);
const articleArg = argv.find((a) => a.startsWith("--article="));
/** On-theme by design: the app's own illustration idiom is stipple/pointillist. */
const ARTICLE = articleArg ? articleArg.split("=")[1] : "Pointillism";
const BASE = "https://en.wikipedia.org";

const SURFACES = {
  desktop: { id: "desktop", width: 1440, height: 900, scale: 2, mobile: false },
  mobile: { id: "mobile", width: 393, height: 852, scale: 3, mobile: true },
};

const startedAt = new Date().toISOString();
let shotCount = 0;
const issues = [];

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Hide transient overlays that vary run to run.
 *
 * Fundraising banners, cookie notices and "try the new feature" nudges are not
 * the product and they change daily — left in, every capture differs from the
 * last and visual comparison becomes useless. Recorded in the run notes.
 */
const SUPPRESS_CSS = `
  #centralNotice, .cn-fundraising, .frb-banner, #frbanner,
  .mw-dismissable-notice, #siteNotice, .vector-sticky-header-icon-end,
  #mw-indicator-mw-helplink { display: none !important; }
  /* Stop the caret blinking so a focused input isn't a coin flip. */
  * { caret-color: transparent !important; }
`;

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // Fonts before pixels: a capture taken pre-font-swap shows fallback metrics,
  // so text wraps differently and every later comparison is noise.
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.addStyleTag({ content: SUPPRESS_CSS }).catch(() => {});
  await page.waitForTimeout(250);
}

/**
 * Every capture hash seen in each walk — NOT just the previous one. The hub
 * compares every pair, so a one-step lookback is weaker than the check this
 * exists to pre-empt.
 */
const seenHashes = new Map();

async function shot(page, featureId, surfaceId, file) {
  const dir = join(OUT, featureId, surfaceId);
  mkdirSync(dir, { recursive: true });
  const abs = join(dir, file);
  await page.screenshot({ path: abs, animations: "disabled" });

  const key = `${featureId}:${surfaceId}`;
  const hash = createHash("md5").update(readFileSync(abs)).digest("hex");
  const seen = seenHashes.get(key) ?? new Map();
  const clash = seen.get(hash);
  if (clash) {
    throw new Error(
      `${file} is byte-identical to ${clash} in ${key}. The interaction before ` +
        `it didn't change the screen — fix the action, or drop the step.`,
    );
  }
  seen.set(hash, file);
  seenHashes.set(key, seen);
  shotCount += 1;
  return `${featureId}/${surfaceId}/${file}`;
}

/** Like `shot`, but a duplicate skips the step instead of failing the walk. */
async function tryShot(page, featureId, surfaceId, file) {
  try {
    return await shot(page, featureId, surfaceId, file);
  } catch (err) {
    if (!/byte-identical/.test(err.message)) throw err;
    console.log(`\n    · skipped ${file} — nothing changed on screen`);
    return null;
  }
}

const STICKY_HEADER_PX = 80;

/**
 * Scroll an element to just below the sticky header, unconditionally.
 * `scrollIntoViewIfNeeded()` no-ops when the element is already on screen.
 */
async function scrollTo(page, locator) {
  if (!(await locator.count())) return false;
  await locator.first().evaluate((el, offset) => {
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
  }, STICKY_HEADER_PX);
  await page.waitForTimeout(400);
  return true;
}

function writeJson(file, data) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, file), JSON.stringify(data, null, 2) + "\n");
}

function countShots(dir) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countShots(join(dir, e.name));
    else if (/\.png$/i.test(e.name)) n += 1;
  }
  return n;
}

async function newContext(browser, surface) {
  const context = await browser.newContext({
    viewport: { width: surface.width, height: surface.height },
    deviceScaleFactor: surface.scale,
    isMobile: surface.mobile,
    hasTouch: surface.mobile,
    // A mobile viewport is not a mobile client. Wikipedia (like most large
    // sites) picks its skin from the user agent, so a 393px context with a
    // desktop UA gets the desktop layout squeezed narrow — and `en.m.` will
    // even redirect you back to the desktop host. Without this line the
    // capture is honestly labelled "mobile" and is still the wrong page.
    ...(surface.mobile
      ? {
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        }
      : {}),
    reducedMotion: "reduce",
    locale: "en-GB",
    timezoneId: "UTC", // pin it — pages render timestamps
  });
  const page = await context.newPage();
  // Record failing REQUESTS with their path. "Failed to load resource" in the
  // console is unactionable; a status and a path is something to look at.
  page.on("response", (r) => {
    if (r.status() < 400) return;
    issues.push({
      text: `${r.status()} from ${new URL(r.url()).pathname}`,
      severity: r.status() >= 500 ? "major" : "minor",
      endpoint: true,
    });
  });
  return { context, page };
}

// ── the walks ──────────────────────────────────────────────────────────────

/** Search: the one flow every reader of this site starts with. */
async function walkSearch(browser, surface) {
  const { context, page } = await newContext(browser, surface);
  const steps = [];
  const F = "search";

  await page.goto(`${BASE}/wiki/Main_Page`, { waitUntil: "domcontentloaded" });
  await settle(page);

  steps.push({
    stepNumber: 1,
    title: "The front door",
    action: "Opened the main page.",
    description:
      "The entry point puts a search field in the header and the day's editorial selections below it. Nothing is personalised and nothing is gated — the fastest route to any of six million articles is to type its name.",
    screenshotFilename: await shot(page, F, surface.id, "step-01-main-page.png"),
    screenshotAlt: "The Wikipedia main page",
    location: "/wiki/Main_Page",
    verificationStatus: "live-walked",
  });

  const search = page.locator('input[name="search"]').first();
  if (await search.count()) {
    await search.click();
    await search.fill(ARTICLE.toLowerCase());
    // Wait for the menu, not for a duration — the suggestion request is a
    // network round-trip and its latency is not ours to guess.
    await page
      .waitForSelector(".cdx-menu-item, .suggestions-results, .cdx-typeahead-search__menu", {
        timeout: 10_000,
      })
      .catch(() => {});
    await page.waitForTimeout(400);

    const file = await tryShot(page, F, surface.id, "step-02-suggestions.png");
    if (file) {
      steps.push({
        stepNumber: 2,
        title: "Suggestions arrive as you type",
        action: `Typed "${ARTICLE.toLowerCase()}" into the search field.`,
        description:
          "A typeahead request returns candidate articles with a thumbnail and a one-line description, so the reader disambiguates **before** committing to a page. The description is what does the work here — several candidates often share a name.",
        screenshotFilename: file,
        screenshotAlt: `Search suggestions for "${ARTICLE.toLowerCase()}"`,
        location: "/wiki/Main_Page",
        verificationStatus: "live-walked",
      });
    }

    await page.keyboard.press("Enter");
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await settle(page);

    const landed = await tryShot(page, F, surface.id, "step-03-article.png");
    if (landed) {
      steps.push({
        stepNumber: steps.length + 1,
        title: "Straight to the article",
        action: "Pressed Enter to accept the top suggestion.",
        description:
          "Submitting an exact title navigates directly rather than to a results page. That one decision is why search here feels like addressing a thing instead of querying a database.",
        screenshotFilename: landed,
        screenshotAlt: `The ${ARTICLE} article`,
        location: `/wiki/${ARTICLE}`,
        verificationStatus: "live-walked",
      });
    }
  }

  await context.close();

  return {
    featureId: F,
    featureName: "Search",
    type: "feature",
    location: "/wiki/Main_Page",
    category: "search",
    surface: surface.id,
    platform: "web",
    locale: "en",
    headline: "Type a title, land on the thing",
    overview:
      "The primary navigation path. A typeahead disambiguates with a thumbnail and a short description before the reader commits, and an exact title goes straight to the article rather than to a results page.",
    steps,
    keyFeatures: [
      "Typeahead with thumbnails and disambiguating descriptions",
      "Exact-title submission navigates directly, skipping a results page",
    ],
    generatedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
  };
}

/** The article itself, including the locale axis. */
async function walkArticle(browser, surface) {
  const { context, page } = await newContext(browser, surface);
  const steps = [];
  const F = "article";

  await page.goto(`${BASE}/wiki/${ARTICLE}`, { waitUntil: "domcontentloaded" });
  await settle(page);

  steps.push({
    stepNumber: 1,
    title: "Lead section first, apparatus around it",
    action: `Opened /wiki/${ARTICLE}.`,
    description:
      "The lead answers the question before any navigation appears. Contents, references and language links are all present but subordinate — the page is a document with apparatus, not an app with content in it.",
    screenshotFilename: await shot(page, F, surface.id, "step-01-lead.png"),
    screenshotAlt: `The lead section of the ${ARTICLE} article`,
    location: `/wiki/${ARTICLE}`,
    verificationStatus: "live-walked",
  });

  // A named section, reached by a real scroll.
  const section = page.locator("h2").filter({ hasText: /Technique|Practice|History/i }).first();
  if (await scrollTo(page, section)) {
    const file = await tryShot(page, F, surface.id, "step-02-section.png");
    if (file) {
      steps.push({
        stepNumber: steps.length + 1,
        title: "Sections carry their own citations",
        action: "Scrolled to the first substantive section.",
        description:
          "Every claim is footnoted at the point it's made rather than in a bibliography at the end. On a long article that's the difference between a reader being able to check one sentence and having to trust the whole page.",
        screenshotFilename: file,
        screenshotAlt: "A body section of the article with inline citations",
        location: `/wiki/${ARTICLE}`,
        verificationStatus: "live-walked",
      });
    }
  }

  // The locale axis, demonstrated as a STEP rather than a separate feature.
  //
  // This is the schema claim made concrete: a translation is a *variant* of a
  // feature, not a feature of its own. Cataloguing `article-fr` alongside
  // `article` would inflate the feature count — the first number any reader
  // looks at — without documenting anything more.
  const langBtn = page.locator("#p-lang-btn, .mw-interlanguage-selector").first();
  if (await langBtn.count()) {
    await langBtn.click().catch(() => {});
    await page.waitForTimeout(700);
    const file = await tryShot(page, F, surface.id, "step-03-languages.png");
    if (file) {
      steps.push({
        stepNumber: steps.length + 1,
        title: "The same article, in every language that has one",
        action: "Opened the language selector.",
        description:
          "Each language is a separate article with its own editors and its own revision history, not a translation of the English one. They're linked as siblings rather than derived from a source — which is why the list is a navigation surface and not a locale toggle.",
        screenshotFilename: file,
        screenshotAlt: "The language selector listing other-language versions",
        location: `/wiki/${ARTICLE}`,
        verificationStatus: "live-walked",
        annotations: [
          {
            type: "tip",
            text: "Captured as a step inside this feature, not as a separate `article-fr` feature. A locale is an axis through a feature; cataloguing it separately would inflate the feature count without documenting anything new.",
          },
        ],
      });
    }
  }

  await context.close();

  return {
    featureId: F,
    featureName: "Reading an article",
    type: "feature",
    location: `/wiki/${ARTICLE}`,
    category: "reading",
    surface: surface.id,
    platform: "web",
    locale: "en",
    headline: "A document with apparatus, not an app with content",
    overview:
      "The page a reader actually came for. The lead answers first; contents, inline citations and the other-language versions sit around it without competing for attention.",
    steps,
    tips: [
      "Each language version is an independent article with its own history — the language list is navigation between siblings, not a translation switch.",
    ],
    generatedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Revision history — thematically the most interesting thing here.
 *
 * This tool exists to make documentation drift visible. Wikipedia solved the
 * same problem thirty years earlier by making every version addressable and
 * every change diffable, and walking it is the clearest available statement of
 * what "know whether what you're reading is current" looks like when it works.
 */
async function walkHistory(browser, surface) {
  const { context, page } = await newContext(browser, surface);
  const steps = [];
  const F = "revision-history";

  await page.goto(`${BASE}/w/index.php?title=${ARTICLE}&action=history`, {
    waitUntil: "domcontentloaded",
  });
  await settle(page);

  steps.push({
    stepNumber: 1,
    title: "Every version, addressable",
    action: `Opened the revision history for ${ARTICLE}.`,
    description:
      "Each row is a revision: who, when, the size delta, and their edit summary. Nothing is overwritten — the current article is just the newest row, and every earlier one is still a URL you can link someone to.",
    screenshotFilename: await shot(page, F, surface.id, "step-01-history.png"),
    screenshotAlt: "The revision history list",
    location: `/w/index.php?title=${ARTICLE}&action=history`,
    verificationStatus: "live-walked",
  });

  // Select two revisions to compare. Real interaction with real radio inputs.
  const older = page.locator('input[name="oldid"]');
  const newer = page.locator('input[name="diff"]');
  if ((await older.count()) > 2 && (await newer.count()) > 2) {
    await older.nth(3).check().catch(() => {});
    await newer.nth(0).check().catch(() => {});
    await page.waitForTimeout(400);

    const file = await tryShot(page, F, surface.id, "step-02-selected.png");
    if (file) {
      steps.push({
        stepNumber: steps.length + 1,
        title: "Pick any two points in time",
        action: "Selected a revision from a few edits back and the current one.",
        description:
          "The comparison is between arbitrary revisions, not just consecutive ones — so a reader can ask *what changed since the version I read last month* rather than stepping through every edit in between.",
        screenshotFilename: file,
        screenshotAlt: "Two revisions selected for comparison",
        location: `/w/index.php?title=${ARTICLE}&action=history`,
        verificationStatus: "live-walked",
      });
    }

    const compare = page.getByRole("button", { name: /Compare selected revisions/i });
    const compareInput = page.locator('input[value*="Compare" i]');
    if (await compare.count()) await compare.first().click().catch(() => {});
    else if (await compareInput.count()) await compareInput.first().click().catch(() => {});

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await settle(page);

    const diff = await tryShot(page, F, surface.id, "step-03-diff.png");
    if (diff) {
      steps.push({
        stepNumber: steps.length + 1,
        title: "The change itself, word by word",
        action: "Compared the selected revisions.",
        description:
          "Removed text on the left, added on the right, changed words highlighted within the line. **This is the artifact this whole tool is trying to produce for software** — the difference being that a wiki's content and its diff are the same medium, whereas a running app's behaviour has to be captured before it can be compared.",
        screenshotFilename: diff,
        screenshotAlt: "A word-level diff between two revisions",
        location: `/w/index.php?title=${ARTICLE}&diff=next`,
        verificationStatus: "live-walked",
        annotations: [
          {
            type: "important",
            text: "Wikipedia makes drift visible by making every version addressable. A deployed app can't do that, which is why this hub records the commit each capture was taken at instead.",
          },
        ],
      });
    }
  }

  await context.close();

  return {
    featureId: F,
    featureName: "Revision history",
    type: "feature",
    location: `/w/index.php?title=${ARTICLE}&action=history`,
    category: "inspect",
    surface: surface.id,
    platform: "web",
    locale: "en",
    headline: "Nothing is overwritten, so every change is checkable",
    overview:
      "The feature that makes the rest trustworthy. Every revision keeps its own URL, any two can be compared, and the diff is word-level — so a reader can establish what changed without taking anyone's word for it.",
    steps,
    keyFeatures: [
      "Every revision is permanently addressable",
      "Arbitrary pairs compare, not just consecutive edits",
      "Word-level diffs rather than line-level",
    ],
    generatedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
  };
}

// ── main ───────────────────────────────────────────────────────────────────

const browser = await chromium.launch();
console.log(`walking ${BASE} (article: ${ARTICLE}) → ${OUT}\n`);

const written = [];
const PLAN = [
  ["search", walkSearch, ["desktop", "mobile"]],
  ["article", walkArticle, ["desktop", "mobile"]],
  ["revision-history", walkHistory, ["desktop"]],
];

for (const [name, walk, surfaceKeys] of PLAN) {
  for (const key of surfaceKeys) {
    const surface = SURFACES[key];
    process.stdout.write(`… ${name} · ${surface.id} `);
    try {
      const wt = await walk(browser, surface);
      writeJson(`${wt.featureId}.${surface.id}.json`, wt);
      written.push({ featureId: wt.featureId, surfaceId: surface.id, walkthrough: wt });
      console.log(`✓ ${wt.steps.length} steps`);
    } catch (err) {
      console.log(`✗ ${err.message.slice(0, 150)}`);
      issues.push({ text: `${name} (${surface.id}): ${err.message.slice(0, 250)}`, severity: "major" });
    }
    // Be a considerate client of somebody else's servers.
    await new Promise((r) => setTimeout(r, 1200));
  }
}

await browser.close();

// ── catalog ────────────────────────────────────────────────────────────────

const byFeature = new Map();
for (const { featureId, surfaceId, walkthrough } of written) {
  const entry = byFeature.get(featureId) ?? {
    featureId,
    featureName: walkthrough.featureName,
    location: walkthrough.location,
    category: walkthrough.category,
    requiresAuth: false,
    surfaceStatus: {},
    lastWalkthroughAt: walkthrough.capturedAt,
  };
  entry.surfaceStatus[surfaceId] = walkthrough.steps.length > 0 ? "done" : "pending";
  byFeature.set(featureId, entry);
}

const prev = existsSync(join(OUT, "catalog.json"))
  ? JSON.parse(readFileSync(join(OUT, "catalog.json"), "utf8"))
  : null;

writeJson("catalog.json", {
  projectName: "Wikipedia",
  platform: "web",
  driver: "playwright",
  capturedAgainst: BASE,
  discoveredAt: prev?.discoveredAt ?? startedAt,
  updatedAt: new Date().toISOString(),
  features: [...byFeature.values()],
  personas: [],
  attribution:
    "Captures are of Wikipedia, whose article text is available under CC BY-SA 4.0. Included as a reproducible sample; not affiliated with or endorsed by the Wikimedia Foundation.",
});

// ── issues found while walking ──────────────────────────────────────────────

if (issues.length > 0) {
  // One broken endpoint hit six times is ONE finding with a count, not six.
  const counted = new Map();
  for (const i of issues) {
    const prevI = counted.get(i.text);
    if (prevI) prevI.n += 1;
    else counted.set(i.text, { ...i, n: 1 });
  }
  writeJson("issues.json", {
    issues: [...counted.values()].map((i, n) => ({
      id: `run-${startedAt.slice(0, 10)}-${n + 1}`,
      severity: i.severity ?? "minor",
      title: i.n > 1 ? `${i.text} (${i.n}×)` : i.text,
      detail:
        "Observed during capture against the live site, not fixed — the walk observes, it doesn't repair. On a third-party site this is informational.",
      foundAt: new Date().toISOString(),
      status: "open",
    })),
  });
}

// ── run manifest ───────────────────────────────────────────────────────────

const runsFile = join(OUT, "runs.json");
const runs = existsSync(runsFile) ? JSON.parse(readFileSync(runsFile, "utf8")) : { runs: [] };
const completedAt = new Date().toISOString();

runs.runs.push({
  id: completedAt,
  startedAt,
  completedAt,
  skill: "walkthrough",
  agent: "walk-wikipedia.mjs",
  // A third-party site has no checkout we can diff against, so there is no sha
  // to anchor to. The hub reports staleness as `unknown` and says why — which
  // is the honest answer, and the reason drift only truly works on an app you
  // have the source for.
  target: {
    sha: "",
    shaShort: "—",
    branch: "",
    dirty: false,
    commitSubject: "Third-party site — no local checkout to diff against",
  },
  config: {
    platform: "web",
    driver: "playwright",
    capturedAgainst: BASE,
    surfaces: ["desktop", "mobile"],
    locales: ["en"],
    notes:
      `Live public site, article "${ARTICLE}". Fundraising banners and site notices were ` +
      `hidden via injected CSS so captures are comparable between runs; nothing else was altered.`,
  },
  coverage: {
    features: [...byFeature.keys()],
    personas: [],
    screenshots: countShots(OUT),
    videos: 0,
    issues: issues.length,
  },
});

writeJson("runs.json", runs);

console.log(
  `\ndone · ${byFeature.size} features, ${shotCount} captures this pass, ${countShots(OUT)} on disk`,
);
if (issues.length) console.log(`${issues.length} issue${issues.length === 1 ? "" : "s"} recorded`);
