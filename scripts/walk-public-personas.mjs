#!/usr/bin/env node
/**
 * Persona-only journeys for the public Human Quest showcases.
 *
 * Each journey is planned as an arc before capture and ends at an observed
 * payoff. The catalogs remain explicitly bounded: adding a persona does not
 * turn one public slice into a complete product inventory.
 *
 * Usage:
 *   node scripts/walk-public-personas.mjs
 *   node scripts/walk-public-personas.mjs --project=yoga-quest-web
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openCapture, SURFACES } from "./lib/capture/index.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STORE = join(ROOT, "apps", "hub", "public", "walkthroughs");
const argv = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));

const PROJECTS = [
  {
    slug: "yoga-quest-web",
    name: "Yoga Quest Web",
    base: "https://yogaquest.app",
    surface: SURFACES.desktop,
    persona: {
      id: "class-planning-teacher",
      name: "Nadia Rahman",
      description: "A yoga teacher planning tomorrow's mixed-level class from a laptop. She needs a progression she can adapt and explain, not another account to maintain or a workout she must follow verbatim.",
      portrait: "personas/class-planning-teacher.png",
      entryPoint: "/classes",
      journeyId: "find-and-export-balance-program",
      navItems: [
        { label: "Browse classes", location: "/classes" },
        { label: "Choose a program", location: "/classes?type=program" },
        { label: "Preview the import", location: "/import" },
      ],
    },
    headline: "From a crowded class library to a validated three-week balance plan",
    overview: "Nadia narrows the public teacher library to balance work, switches from individual classes to programs, inspects the progression, then carries the structured program into Yoga Quest's importer for review.",
    payoff: "She reaches a real import preview confirming the complete eight-session program, 33 exercises, and six workouts before anything is saved.",
    async drive(walk) {
      const scenes = [];
      await walk.ctx.scrollToSelector('button[role="tab"]', 100);
      scenes.push(scene("arrive", "Nadia starts with the whole teacher library", "Tomorrow's class needs balance work, but Nadia does not want to assemble it from memory. The public library gives her duration, level, focus, and format before she commits to anything.", await walk.shot("scene-01-library.png"), "/classes", "class-library", "Opened the public teacher library.", "desktop"));

      if (!(await walk.ctx.fill('input[placeholder*="Search workouts"]', "balance"))) throw new Error("The class search field was not available");
      scenes.push(scene("search", "She names the teaching need, not a pose", "Typing **balance** reduces the class inventory to relevant sessions. She can compare foundations, supported practice, and longer flows without knowing the library's exact titles.", await walk.shot("scene-02-balance-search.png"), "/classes", "class-library", 'Searched for "balance".', "desktop"));

      if (!(await walk.ctx.click('button[role="tab"]:has-text("Programs")'))) throw new Error("Programs tab was not available");
      scenes.push(scene("programs", "She switches from sessions to progression", "Nadia needs a sequence that develops over time, not one isolated class. The Programs tab turns the same intent into multi-week paths with session counts and pacing.", await walk.shot("scene-03-programs.png"), "/classes", "class-library", 'Selected the "Programs" tab.', "desktop"));

      if (!(await walk.ctx.clickText("Build a balance practice"))) throw new Error("The balance program was not available");
      await walk.ctx.waitForSelector('[role="dialog"]');
      scenes.push(scene("open", "The balance plan explains its promise", "The detail view names the three-week goal, the eight-session cadence, and the role of wall and chair support. Nadia can judge whether the plan fits her group before looking at individual days.", await walk.shot("scene-04-program.png"), "/classes", "class-library", 'Opened "Build a balance practice".', "desktop"));

      if (!(await walk.ctx.scrollToSelector('h3:has-text("Your path through the program")', 120))) throw new Error("The program path was not present");
      scenes.push(scene("path", "She checks how the challenge actually grows", "The path moves from supports and an easy step-down to standing foundations, hinges, recovery, and a final integrated flow. Rest days are part of the plan rather than missing content.", await walk.shot("scene-05-path.png"), "/classes", "class-library", "Scrolled through the eight-session path.", "desktop"));

      await walk.ctx._page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: projectOrigin("https://yogaquest.app") });
      if (!(await walk.ctx.clickText("Copy for app import"))) throw new Error("Copy for app import was not available");
      await walk.ctx.waitForSelector('button:has-text("Copied for app import")');
      const payload = await walk.ctx.evaluate("navigator.clipboard.readText()");
      if (typeof payload !== "string" || payload.length < 1000) throw new Error("The copied program payload was unexpectedly empty");

      await walk.ctx.goto("https://yogaquest.app/import");
      await walk.ctx.waitForSelector('button:has-text("JSON / file")');
      if (!(await walk.ctx.clickText("JSON / file"))) throw new Error("JSON import mode was not available");
      if (!(await walk.ctx.fill("textarea", payload))) throw new Error("The copied program could not be pasted into the importer");
      scenes.push(scene("import", "The copied plan lands in the real importer", "Nadia moves the generated JSON into the product's own import surface. The interface explains that this draft stays in the tab and can be reviewed before it changes her library.", await walk.shot("scene-06-import.png", { firstOfScreen: true }), "/import", undefined, "Opened JSON import mode and pasted the copied program payload.", "desktop"));

      if (!(await walk.ctx.clickText("Preview import"))) throw new Error("Preview import was not available");
      await walk.ctx.waitForSelector('h3:has-text("Ready to review")');
      scenes.push(scene("preview", "The product validates the complete teaching plan", "The importer confirms **33 exercises · 6 workouts · 1 program** and names the eight-session balance path. Nadia can inspect the first session and every downstream workout before deciding whether to save it.", await walk.shot("scene-07-preview.png"), "/import", undefined, 'Clicked "Preview import" and observed the parsed program summary.', "desktop"));
      return scenes;
    },
  },
  {
    slug: "globe-quest",
    name: "Globe Quest",
    base: "https://www.globequest.app",
    surface: SURFACES.mobile,
    persona: {
      id: "curious-traveler",
      name: "Mira Patel",
      description: "A curious traveler considering Copenhagen and looking things up on her phone between errands. She wants one concrete thread to follow into the place; she does not want to join a community or build a detailed itinerary yet.",
      portrait: "personas/curious-traveler.png",
      entryPoint: "/explore",
      journeyId: "copenhagen-to-first-phrases",
      navItems: [
        { label: "Explore", location: "/explore" },
        { label: "Copenhagen", location: "/explore?place=copenhagen" },
        { label: "Danish phrases", location: "/relocate/copenhagen/language" },
      ],
    },
    headline: "From a name in the search box to useful Danish phrases",
    overview: "Mira uses the world explorer to find Copenhagen, changes the geographic view, then follows the place's own language path into public phrases she can actually use.",
    payoff: "She leaves the explorer with a visible set of essential Danish phrases tied to the city she chose.",
    scopeNote: "This bounded journey follows the public explorer into Copenhagen's public language guide. Quests, circles, journals, saved places, accounts, and paid access remain outside this run.",
    async drive(walk) {
      const scenes = [];
      scenes.push(scene("arrive", "Mira opens the world with only a city name", "She is on her phone and has one question—what thread should she follow into Copenhagen? The explorer offers search, layers, a world view, and a place index without asking her to sign in first.", await walk.shot("scene-01-explorer.png"), "/explore", "world-explorer", "Opened the public world explorer.", "mobile"));

      if (!(await walk.ctx.fill('input[placeholder*="Constantinople"]', "Copenhagen"))) throw new Error("The place search field was not available");
      await walk.ctx.waitForSelector('button:has-text("Copenhagen")');
      scenes.push(scene("search", "The world narrows to one plausible result", "The index collapses to **Copenhagen · City · Europe**. Mira gets a specific destination without wrestling with region filters or guessing a category.", await walk.shot("scene-02-search.png"), "/explore", "world-explorer", 'Searched for "Copenhagen".', "mobile"));

      if (!(await walk.ctx.click('button:has-text("Copenhagen")'))) throw new Error("Copenhagen result was not available");
      await walk.ctx.waitForSelector('h2:has-text("Copenhagen")');
      scenes.push(scene("place", "Copenhagen becomes a place, not a pin", "The selected-place view gives Mira a concise orientation and three routes forward: language, people, or the full destination guide. The explorer has converted a search result into a decision.", await walk.shot("scene-03-copenhagen.png"), "/explore", "world-explorer", "Opened the Copenhagen place card.", "mobile"));

      if (!(await walk.ctx.clickText("Flat map"))) throw new Error("Flat map control was not available");
      scenes.push(scene("map", "She changes perspective without losing the place", "The projection switches while Copenhagen stays selected. Mira can orient geographically without starting the search again or losing the paths she just found.", await walk.shot("scene-04-flat-map.png"), "/explore", "world-explorer", 'Selected "Flat map".', "mobile"));

      if (!(await walk.ctx.clickText("Learn a little of the language", { role: "link" }))) throw new Error("The language path was not available");
      await walk.ctx.waitForSelector('h1:has-text("Essential Danish phrases")');
      scenes.push(scene("phrases", "The city opens into words she can use", "The next page is not a generic language upsell. It is Copenhagen's public guide to essential Danish phrases, organised around daily life, work, culture, and emergencies.", await walk.shot("scene-05-phrases.png", { firstOfScreen: true }), "/relocate/copenhagen/language", undefined, 'Opened "Learn a little of the language".', "mobile"));

      if (!(await walk.ctx.scrollToSelector('h2:has-text("Daily life")', 90))) throw new Error("Daily life phrases were not present");
      scenes.push(scene("daily-life", "She reaches the practical first phrases", "Mira finishes with the daily-life section visible on her phone. The journey has moved from curiosity to a concrete first preparation step without requiring an account.", await walk.shot("scene-06-daily-life.png"), "/relocate/copenhagen/language", undefined, "Scrolled to the Daily life phrase group.", "mobile"));
      return scenes;
    },
  },
  {
    slug: "polytyper",
    name: "Polytyper",
    base: "https://www.polytyper.com",
    surface: SURFACES.desktop,
    persona: {
      id: "multiscript-learner",
      name: "Elena Markovic",
      description: "A language learner comparing how Arabic and Russian feel on a physical keyboard. She wants a usable sample and the right layout in seconds; she does not want to configure an operating-system keyboard or create an account first.",
      portrait: "personas/multiscript-learner.png",
      entryPoint: "/keyboard/arabic",
      journeyId: "compare-arabic-and-russian",
      navItems: [
        { label: "Arabic keyboard", location: "/keyboard/arabic" },
        { label: "Switch language", location: "/keyboard/arabic" },
        { label: "Russian keyboard", location: "/keyboard/russian" },
      ],
    },
    headline: "From an empty Arabic editor to a Russian sample without leaving the workspace",
    overview: "Elena uses real sample text to understand one script, opens the keyboard-aware language switcher, and lands in a second script with another usable sample.",
    payoff: "She has produced visible sample text in both Arabic and Russian and confirmed the matching layouts without installing anything.",
    async drive(walk) {
      const scenes = [];
      scenes.push(scene("arrive", "Elena starts in a right-to-left workspace", "The Arabic editor, native layout, speech controls, and physical-keyboard guidance are ready without sign-in. She can see the writing direction before typing a character.", await walk.shot("scene-01-arabic.png"), "/keyboard/arabic", "language-keyboards", "Opened the Arabic keyboard.", "desktop"));

      if (!(await walk.ctx.click('button:has-text("Sample")'))) throw new Error("Arabic sample control was not available");
      scenes.push(scene("arabic-sample", "A complete Arabic sentence fills the editor", "One click produces a real Arabic sentence in the right-to-left field. Elena can inspect spacing, letter joining, and the matching on-screen key layout instead of practising against placeholder text.", await walk.shot("scene-02-arabic-sample.png"), "/keyboard/arabic", "language-keyboards", 'Clicked "Sample".', "desktop"));

      if (!(await walk.ctx.click('button:has-text("Jump to language")'))) throw new Error("Language switcher was not available");
      await walk.ctx.waitForSelector('[role="dialog"]');
      // This command palette is intentionally sparse: the dimmed workspace and
      // one focused list are the product's real composition, not a load failure.
      scenes.push(scene("switcher", "Every other script stays one command away", "The language picker keeps the Arabic workspace behind it and lists destinations by both English and native names. Switching scripts is a workspace action, not a return to the homepage.", await walk.shot("scene-03-language-picker.png", { sparse: true }), "/keyboard/arabic", "language-keyboards", 'Opened "Jump to language".', "desktop"));

      if (!(await walk.ctx.click('button:has-text("Russian keyboard")'))) throw new Error("Russian keyboard option was not available");
      await walk.ctx.waitForSelector('[aria-label="Russian text field"]');
      scenes.push(scene("russian", "The workspace genuinely becomes Russian", "The route, editor label, direction, help copy, and full on-screen layout now describe Russian. Elena did not merely change a heading over the same keys.", await walk.shot("scene-04-russian.png", { firstOfScreen: true }), "/keyboard/russian", "language-keyboards", 'Selected "Russian keyboard".', "desktop"));

      if (!(await walk.ctx.click('button:has-text("Sample")'))) throw new Error("Russian sample control was not available");
      scenes.push(scene("russian-sample", "A second script produces a second real sentence", "The Russian sample fills the editor above its matching Cyrillic keys. Elena has now compared two functioning writing surfaces, not two screenshots in a language menu.", await walk.shot("scene-05-russian-sample.png"), "/keyboard/russian", "language-keyboards", 'Clicked "Sample" on the Russian keyboard.', "desktop"));
      return scenes;
    },
  },
];

function projectOrigin(url) { return new URL(url).origin; }

function scene(id, title, narrative, frame, location, sourceFeature, action, surface) {
  return {
    id,
    title,
    narrative,
    frames: [frame],
    frameCaptions: [title],
    location,
    surface,
    ...(sourceFeature ? { sourceFeature } : {}),
    action,
    verificationStatus: "live-walked",
  };
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function capture(project) {
  const out = join(STORE, project.slug);
  const startedAt = new Date().toISOString();
  const issuesFile = join(out, "issues.json");
  const issuesDoc = readJson(issuesFile, { issues: [] });
  const cap = await openCapture({ outDir: out, videoDir: join(out, "video"), driver: "playwright" });
  const walk = await cap.feature(`journey-${project.persona.id}`, project.surface, { url: `${project.base}${project.persona.entryPoint}`, video: true });
  let scenes;
  let video;
  try {
    scenes = await project.drive(walk);
    if (scenes.length < 5) throw new Error(`journey produced ${scenes.length} scenes; five are required`);
    ({ video } = await walk.finish());
  } catch (error) {
    await walk.finish().catch(() => {});
    await cap.close();
    throw error;
  }

  const report = cap.report();
  await cap.close();
  for (const overflow of report.overflows) {
    issuesDoc.issues.push({
      id: `persona-overflow-${project.persona.id}-${overflow.surface}-${Date.now()}`,
      featureId: overflow.featureId,
      location: overflow.location ? new URL(overflow.location).pathname : undefined,
      surface: overflow.surface,
      severity: "major",
      title: `${project.persona.name}'s journey overflows on ${overflow.surface}`,
      detail: `Measured ${overflow.contentWidth}px of content on a ${overflow.surfaceWidth}px surface.`,
      foundAt: new Date().toISOString(),
      status: "open",
    });
  }

  const completedAt = new Date().toISOString();
  const videoRef = video ? `video/${video.split("/").pop()}` : undefined;
  writeJson(join(out, `persona-${project.persona.id}.${project.persona.journeyId}.json`), {
    personaId: project.persona.id,
    journeyId: project.persona.journeyId,
    headline: project.headline,
    overview: project.overview,
    payoff: project.payoff,
    scenes,
    platform: "web",
    surface: project.surface.id,
    capturedAt: completedAt,
    ...(videoRef ? { walkRecording: videoRef } : {}),
  });

  const catalogFile = join(out, "catalog.json");
  const catalog = readJson(catalogFile, null);
  if (!catalog) throw new Error(`${project.slug} has no catalog.json`);
  catalog.updatedAt = completedAt;
  if (project.scopeNote && catalog.scope) catalog.scope.note = project.scopeNote;
  catalog.personas = [
    ...(catalog.personas ?? []).filter((persona) => persona.id !== project.persona.id),
    {
      id: project.persona.id,
      name: project.persona.name,
      description: project.persona.description,
      portrait: project.persona.portrait,
      entryPoint: project.persona.entryPoint,
      keyJourneys: [project.persona.journeyId],
      navItems: project.persona.navItems,
    },
  ];
  writeJson(catalogFile, catalog);

  issuesDoc.updatedAt = completedAt;
  writeJson(issuesFile, issuesDoc);

  const runsFile = join(out, "runs.json");
  const runs = readJson(runsFile, { runs: [] });
  runs.runs.push({
    id: completedAt,
    startedAt,
    completedAt,
    skill: "walkthrough",
    agent: "walk-public-personas.mjs",
    target: { sha: "", shaShort: "—", dirty: false, commitSubject: "Public production capture; deployed source SHA not exposed" },
    config: {
      platform: "web",
      driver: "playwright",
      capturedAgainst: `${project.base}${project.persona.entryPoint}`,
      surfaces: report.surfaces,
      locales: ["en"],
      notes: [
        "persona-only run; catalog remains explicitly bounded",
        "video normalized to portable H.264 MP4 when ffmpeg was available",
        `invariants verified: ${Object.keys(report.verified).join(", ") || "none"}`,
        ...report.warnings,
      ].join(" · "),
    },
    coverage: {
      features: [...new Set(scenes.map((item) => item.sourceFeature).filter(Boolean))],
      personas: [project.persona.id],
      screenshots: report.captures,
      videos: videoRef ? 1 : 0,
      issues: report.overflows.length,
    },
  });
  writeJson(runsFile, runs);
  console.log(`  ✓ ${project.slug} · ${project.persona.name} · ${scenes.length} scenes${videoRef ? " · video" : ""}`);
}

const selected = argv.project ? PROJECTS.filter((project) => project.slug === argv.project) : PROJECTS;
if (selected.length === 0) throw new Error(`unknown project ${argv.project}`);
console.log("\nWalking public persona journeys\n");
for (const project of selected) await capture(project);
