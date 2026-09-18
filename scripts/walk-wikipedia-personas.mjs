#!/usr/bin/env node
/**
 * walk-wikipedia-personas.mjs — the reference *persona* walk.
 *
 * `walk-wikipedia.mjs` documents features: search, article, history. Each is a
 * capability, walked on its own, and that is the right shape for a reference
 * manual. This script documents two people using the same site for completely
 * different reasons, and that is the shape that answers "what is this app
 * for".
 *
 * The two are chosen to be genuinely different paths, not two labels on one
 * path — which is the failure mode the catalog health report calls
 * `variants-as-features`:
 *
 *   fact-checker  follows a claim down to its source, and finishes on a phone
 *   copy-editor   watches an article change over time, and reads the argument
 *
 * ── What this demonstrates that a feature walk cannot ──────────────────────
 *
 *  1. **A scene can override the journey's surface.** The fact-checker's last
 *     scene is captured on the real mobile site (`en.m.wikipedia.org`), inside
 *     a phone frame, in the middle of an otherwise-desktop journey. That is
 *     the `surface`-per-scene generalization earning its keep: the old schema
 *     had a per-*walkthrough* viewport and could not express it at all.
 *
 *  2. **Scenes cite the feature walk they draw on.** `sourceFeature` ties a
 *     narrative beat back to the reference capture of the same screen, so the
 *     journey is not a second, divergent source of truth about the UI.
 *
 * Every lesson from the feature walk applies here and the helpers are copied
 * deliberately rather than shared: this file is the archetype an agent clones,
 * and an archetype that imports half its behaviour from elsewhere teaches the
 * wrong thing.
 *
 * Usage:
 *   node scripts/walk-wikipedia-personas.mjs
 *   node scripts/walk-wikipedia-personas.mjs --article=Engraving
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
const ARTICLE = articleArg ? articleArg.split("=")[1] : "Pointillism";
const BASE = "https://en.wikipedia.org";
/** The real mobile site is a different host and a different skin (Minerva). */
const MOBILE_BASE = "https://en.m.wikipedia.org";

const SURFACES = {
  desktop: { id: "desktop", width: 1440, height: 900, scale: 2, mobile: false },
  mobile: { id: "mobile", width: 393, height: 852, scale: 3, mobile: true },
};

const startedAt = new Date().toISOString();
let shotCount = 0;
const issues = [];

// ── helpers (see walk-wikipedia.mjs for why each one exists) ───────────────

const SUPPRESS_CSS = `
  #centralNotice, .cn-fundraising, .frb-banner, #frbanner,
  .mw-dismissable-notice, #siteNotice, .vector-sticky-header-icon-end,
  #mw-indicator-mw-helplink, .banner-container { display: none !important; }
  * { caret-color: transparent !important; }
`;

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.addStyleTag({ content: SUPPRESS_CSS }).catch(() => {});
  await page.waitForTimeout(250);
}

/** Every hash seen per journey — not just the previous one. */
const seenHashes = new Map();

async function shot(page, journeyId, file) {
  const dir = join(OUT, "personas", journeyId);
  mkdirSync(dir, { recursive: true });
  const abs = join(dir, file);
  await page.screenshot({ path: abs, animations: "disabled" });

  const hash = createHash("md5").update(readFileSync(abs)).digest("hex");
  const seen = seenHashes.get(journeyId) ?? new Map();
  const clash = seen.get(hash);
  if (clash) {
    throw new Error(
      `${file} is byte-identical to ${clash} in ${journeyId}. The interaction ` +
        `before it didn't change the screen — fix the action, or drop the scene.`,
    );
  }
  seen.set(hash, file);
  seenHashes.set(journeyId, seen);
  shotCount += 1;
  return `personas/${journeyId}/${file}`;
}

const STICKY_HEADER_PX = 80;

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
    timezoneId: "UTC",
  });
  const page = await context.newPage();
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

// ── journey 1: the fact-checker ────────────────────────────────────────────

/**
 * Maya follows a claim to its source.
 *
 * The arc is deliberately the one a reader actually performs and almost no
 * product demo shows: not "search works", but "I do not take this sentence on
 * trust, and here is what the site does when I refuse to."
 */
async function walkFactChecker(browser) {
  const journeyId = "verify-a-claim";
  const scenes = [];
  console.log("\n  fact-checker · verify-a-claim");

  const { context, page } = await newContext(browser, SURFACES.desktop);

  // 1 — arriving with a question, from the search box.
  await page.goto(`${BASE}/wiki/Main_Page`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const search = page.locator('input[name="search"]').first();
  await search.click();
  await search.type(ARTICLE.slice(0, 7), { delay: 60 });
  // Wait for the suggestion menu itself, not a duration — a fixed wait here
  // captures an empty dropdown on a slow connection.
  await page
    .locator(".cdx-menu-item, .suggestions-results")
    .first()
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(350);
  scenes.push({
    id: "arrive",
    title: "A sentence she does not want to take on trust",
    narrative:
      "Maya is writing about late-19th-century technique and has a claim she needs to attribute. She starts where every reader starts — the search box — and the site offers completions before she has finished the word.",
    frames: [await shot(page, journeyId, "01-search.png")],
    location: "/wiki/Main_Page",
    surface: "desktop",
    sourceFeature: "search",
    verificationStatus: "live-walked",
  });

  // 2 — the lead section, which is the summary she will not cite.
  await page.goto(`${BASE}/wiki/${ARTICLE}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  scenes.push({
    id: "lead",
    title: "The lead tells her what, but not who says so",
    narrative:
      "The opening paragraphs define the term and name the painters. Useful for orientation, useless for a citation — the lead deliberately summarises the body rather than sourcing it.",
    frames: [await shot(page, journeyId, "02-lead.png")],
    location: `/wiki/${ARTICLE}`,
    surface: "desktop",
    sourceFeature: "article",
    verificationStatus: "live-walked",
  });

  // 3 — an inline citation marker in the body.
  const marker = page.locator("#mw-content-text sup.reference a").first();
  const markerFound = await marker.count();
  if (markerFound) {
    await scrollTo(page, marker);
    // Hovering a reference raises Wikipedia's own preview popup, which is the
    // fastest honest answer to "what is this footnote" — and is a real part of
    // the product, not a state we manufactured.
    await marker.hover();
    await page
      .locator(".mwe-popups, .mwe-popups-type-reference")
      .first()
      .waitFor({ state: "visible", timeout: 6000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    scenes.push({
      id: "marker",
      title: "A numbered marker, and a preview on hover",
      narrative:
        "Every sourced statement in the body carries a bracketed number. Hovering one raises a preview of the reference without leaving the paragraph, so she can judge whether it is worth following before she loses her place.",
      frames: [await shot(page, journeyId, "03-citation-hover.png")],
      location: `/wiki/${ARTICLE}`,
      surface: "desktop",
      sourceFeature: "article",
      verificationStatus: "live-walked",
    });
  }

  // 4 — following the footnote down to the reference list.
  if (markerFound) {
    await marker.click();
    await page.waitForTimeout(700);
    const target = page.locator("li.mw-cite-backlink, ol.references li").first();
    await scrollTo(page, target);
    scenes.push({
      id: "reference",
      title: "The footnote lands her in the reference list",
      narrative:
        "Clicking the marker jumps to the numbered entry at the foot of the article and highlights it. This is the end of Wikipedia's own responsibility and the start of hers: the entry is a pointer to a book or a paper, not the evidence itself.",
      frames: [await shot(page, journeyId, "04-reference-list.png")],
      location: `/wiki/${ARTICLE}#References`,
      surface: "desktop",
      sourceFeature: "article",
      verificationStatus: "live-walked",
    });
  }

  await context.close();

  // 5 — the same check, on a phone, on the real mobile site.
  //
  // A different host and a different skin, so this is genuinely a different
  // surface rather than the desktop layout squeezed narrow. It is also where
  // the scene-level `surface` override matters: one mobile beat inside a
  // desktop journey is a shape the old per-walkthrough viewport field could
  // not describe.
  const mobile = await newContext(browser, SURFACES.mobile);
  await mobile.page.goto(`${MOBILE_BASE}/wiki/${ARTICLE}`, { waitUntil: "domcontentloaded" });
  await settle(mobile.page);
  const mobileRef = mobile.page.locator("#mw-content-text sup.reference a").first();
  let drawerOpened = false;
  if (await mobileRef.count()) {
    await scrollTo(mobile.page, mobileRef);
    await mobileRef.click();
    // Minerva raises the reference in a bottom drawer instead of jumping to the
    // foot of the page. The drawer is injected by JS, so clicking before the
    // page's scripts are ready gets you a plain hash jump and a capture that
    // looks like the desktop behaviour — `settle()` above is what prevents it.
    await mobile.page
      .locator(".drawer-container__drawer")
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => {});
    drawerOpened = await mobile.page
      .locator(".drawer-container__drawer")
      .first()
      .isVisible()
      .catch(() => false);
    await mobile.page.waitForTimeout(600);
  }
  if (!drawerOpened) {
    throw new Error(
      "The mobile reference drawer never opened. The scene's narrative asserts " +
        "it does, so the capture would be a false claim — fix the interaction " +
        "rather than shipping the screenshot.",
    );
  }
  // Record where the browser actually ended up. `en.m.` redirects to the
  // canonical host while still serving Minerva, and writing the requested URL
  // instead of the final one would put a location in the frame chrome that
  // nobody can reproduce.
  const mobileUrl = new URL(mobile.page.url());
  scenes.push({
    id: "mobile-drawer",
    title: "On a phone the same footnote slides up instead",
    narrative:
      "Later, away from her desk, she checks a second claim on her phone. The mobile skin answers the same tap differently — the reference rises in a drawer over the article rather than scrolling her to the bottom of it, so she keeps her place in the sentence.",
    frames: [await shot(mobile.page, journeyId, "05-mobile-reference.png")],
    location: `${mobileUrl.host}${mobileUrl.pathname}`,
    surface: "mobile",
    sourceFeature: "article",
    verificationStatus: "live-walked",
  });
  await mobile.context.close();

  return {
    personaId: "fact-checker",
    journeyId,
    headline: "Following a claim down to the source",
    overview:
      "A student will not cite an encyclopedia, but she will use one to find out *who* to cite. This is the path from a sentence she does not trust to the reference behind it — and what changes when she does the same thing on a phone.",
    payoff:
      "Four taps from an unattributed sentence to a named source, without ever losing her place in the paragraph.",
    platform: "web",
    surface: "desktop",
    capturedAt: new Date().toISOString(),
    scenes,
  };
}

// ── journey 2: the copy-editor ─────────────────────────────────────────────

/**
 * Tom checks what changed and why.
 *
 * This is the half of Wikipedia that readers never see and that no product
 * tour ever shows: the article is the output, and the history is the argument
 * that produced it.
 */
async function walkCopyEditor(browser) {
  const journeyId = "review-a-change";
  const scenes = [];
  console.log("\n  copy-editor · review-a-change");

  const { context, page } = await newContext(browser, SURFACES.desktop);

  // 1 — the article as the public sees it.
  await page.goto(`${BASE}/wiki/${ARTICLE}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const toolsTab = page.locator("#p-cactions, #ca-history").first();
  await scrollTo(page, toolsTab).catch(() => {});
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(250);
  scenes.push({
    id: "published",
    title: "The version the world is reading",
    narrative:
      "Tom watches this article. What he sees first is what everyone sees — the current published revision, with no indication on the page of how contested or how recent any of it is.",
    frames: [await shot(page, journeyId, "01-article.png")],
    location: `/wiki/${ARTICLE}`,
    surface: "desktop",
    sourceFeature: "article",
    verificationStatus: "live-walked",
  });

  // 2 — the history: every edit, with who and why.
  await page.goto(`${BASE}/w/index.php?title=${ARTICLE}&action=history`, {
    waitUntil: "domcontentloaded",
  });
  await settle(page);
  scenes.push({
    id: "history",
    title: "Every edit, with a name and a reason attached",
    narrative:
      "The history is the article's real content: a dated list of revisions, each with an author, a byte delta, and an edit summary. Nothing here is anonymous to the system, and nothing is deleted — only superseded.",
    frames: [await shot(page, journeyId, "02-history.png")],
    location: `/w/index.php?title=${ARTICLE}&action=history`,
    surface: "desktop",
    sourceFeature: "revision-history",
    verificationStatus: "live-walked",
  });

  // 3 — selecting two revisions to compare.
  //
  // Driving the radios rather than deep-linking a diff URL: the selection
  // state *is* the step, and a constructed URL would skip the interaction and
  // leave a capture that looks the same but proves nothing.
  const older = page.locator('input[name="oldid"]');
  const newer = page.locator('input[name="diff"]');
  let compared = false;
  if ((await older.count()) > 2 && (await newer.count()) > 2) {
    await newer.nth(0).check().catch(() => {});
    await older.nth(2).check().catch(() => {});
    await page.waitForTimeout(400);
    scenes.push({
      id: "select",
      title: "Two revisions, picked by hand",
      narrative:
        "He marks the current revision and one from a few edits back. The radio columns enforce direction — you cannot compare a revision with itself, and the older column locks out everything newer than your pick.",
      frames: [await shot(page, journeyId, "03-revisions-selected.png")],
      location: `/w/index.php?title=${ARTICLE}&action=history`,
      surface: "desktop",
      sourceFeature: "revision-history",
      verificationStatus: "live-walked",
    });

    const compare = page
      .locator('button.historysubmit, input.historysubmit, button[name="compare"]')
      .first();
    if (await compare.count()) {
      await compare.click();
      await page.waitForLoadState("domcontentloaded");
      await settle(page);
      compared = true;
    }
  }

  // 4 — the word-level diff.
  if (compared) {
    const diffBody = page.locator("table.diff, .mw-diff-inline-changed").first();
    await scrollTo(page, diffBody).catch(() => {});
    scenes.push({
      id: "diff",
      title: "The change, down to the word",
      narrative:
        "The comparison is not a file diff — it highlights the changed words inside the changed sentences, so a one-word substitution in a long paragraph is visible immediately instead of being buried in a wall of identical text.",
      frames: [await shot(page, journeyId, "04-diff.png")],
      location: "/w/index.php?diff=…&oldid=…",
      surface: "desktop",
      sourceFeature: "revision-history",
      verificationStatus: "live-walked",
    });
  }

  // 5 — the talk page, where the argument lives.
  await page.goto(`${BASE}/wiki/Talk:${ARTICLE}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const talkHasContent = await page.locator("#mw-content-text").count();
  scenes.push({
    id: "talk",
    title: "The disagreement has its own page",
    narrative:
      "Edits that need justifying get argued on the talk page rather than in the article. For Tom this is the difference between reverting a change and understanding it — the reasoning is a click away from the text it produced.",
    frames: [await shot(page, journeyId, "05-talk.png")],
    location: `/wiki/Talk:${ARTICLE}`,
    surface: "desktop",
    verificationStatus: "live-walked",
    note: talkHasContent
      ? undefined
      : "This article's talk page is a stub; a busier article shows threaded discussion here.",
  });

  await context.close();

  return {
    personaId: "copy-editor",
    journeyId,
    headline: "Reading the argument behind the article",
    overview:
      "The article is the output. For someone who maintains one, the interesting surfaces are the ones readers never open: the revision list, the word-level diff, and the page where the disagreement is recorded.",
    payoff:
      "He can see exactly which words changed, who changed them, and the reason they gave — without leaving the article's own namespace.",
    platform: "web",
    surface: "desktop",
    capturedAt: new Date().toISOString(),
    scenes,
  };
}

// ── run ────────────────────────────────────────────────────────────────────

console.log(`walking personas on ${BASE} (article: ${ARTICLE}) → ${OUT}`);

const browser = await chromium.launch();
let failed = null;
const journeys = [];

try {
  journeys.push(await walkFactChecker(browser));
  journeys.push(await walkCopyEditor(browser));
} catch (err) {
  failed = err;
} finally {
  await browser.close();
}

if (failed) {
  console.error(`\n✗ ${failed.message}`);
  process.exit(1);
}

for (const journey of journeys) {
  writeJson(`persona-${journey.personaId}.${journey.journeyId}.json`, journey);
  console.log(
    `\n  → persona-${journey.personaId}.${journey.journeyId}.json (${journey.scenes.length} scenes)`,
  );
}

// Register the personas in the catalog, preserving anything already there.
const catalogPath = join(OUT, "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const PERSONAS = [
  {
    id: "fact-checker",
    name: "Maya",
    description:
      "A second-year history-of-art student. She reads Wikipedia constantly and cites it never — her use of the site is to find out **whose** work to read next. Fast, sceptical, and more interested in the reference list than the article.",
    authRole: "Reader",
    entryPoint: "/wiki/Main_Page",
    keyJourneys: ["verify-a-claim"],
  },
  {
    id: "copy-editor",
    name: "Tom",
    description:
      "A long-time volunteer editor who watches a handful of articles. He spends most of his time in the surfaces readers never open — revision histories, diffs, and talk pages — deciding whether a change was an improvement.",
    authRole: "Editor",
    entryPoint: "/w/index.php?title=Pointillism&action=history",
    keyJourneys: ["review-a-change"],
  },
];
catalog.personas = PERSONAS;
catalog.updatedAt = new Date().toISOString();
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`  → catalog.json (${PERSONAS.length} personas registered)`);

// Append to the run log. Third-party site: there is no local checkout, so
// there is no sha to diff against and drift reads `unknown` by design.
const runsPath = join(OUT, "runs.json");
const runs = existsSync(runsPath) ? JSON.parse(readFileSync(runsPath, "utf8")) : { runs: [] };
const completedAt = new Date().toISOString();
runs.runs.push({
  id: completedAt,
  startedAt,
  completedAt,
  skill: "walkthrough",
  agent: "walk-wikipedia-personas.mjs",
  target: {
    sha: "",
    shaShort: "—",
    branch: "—",
    dirty: false,
    commitDate: completedAt,
    commitSubject: "Third-party site — no local checkout to diff against",
    watchPath: "",
  },
  config: {
    baseUrl: BASE,
    surfaces: ["desktop", "mobile"],
    locales: ["en"],
    notes:
      "Persona journeys. Fundraising banners and site notices suppressed via CSS so runs are " +
      "comparable; the mobile scene is captured on en.m.wikipedia.org, which is a different " +
      "skin (Minerva) rather than the desktop layout at a narrow viewport.",
  },
  coverage: {
    features: journeys.map((j) => `${j.personaId}/${j.journeyId}`),
    screenshots: countShots(join(OUT, "personas")),
    videos: 0,
    issues: issues.length,
  },
});
writeFileSync(runsPath, JSON.stringify(runs, null, 2) + "\n");

if (issues.length) {
  const uniq = [...new Map(issues.map((i) => [i.text, i])).values()];
  writeJson("issues.json", {
    issues: uniq.map((i, n) => ({
      id: `persona-run-${n + 1}`,
      title: i.text,
      severity: i.severity,
      status: "open",
      foundAt: completedAt,
      foundDuring: "persona walk",
    })),
  });
  console.log(`\n  ! ${uniq.length} distinct HTTP error(s) recorded to issues.json`);
}

console.log(`\n✓ ${journeys.length} journeys · ${shotCount} captures\n`);
