#!/usr/bin/env node
/**
 * A bounded, reproducible showcase of public Human Quest product moments.
 *
 * This is intentionally not a portfolio-wide catalog. Each project declares
 * its bounded scope in catalog.json and walks one unauthenticated interaction
 * on both desktop and a real mobile-emulation surface. Production does not
 * expose a deploy SHA, so runs record no target commit rather than attaching
 * the local checkout's HEAD to pixels it may not have served.
 *
 *   node scripts/walk-humanquest-showcase.mjs
 *   node scripts/walk-humanquest-showcase.mjs --project=yoga-quest-web
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
    featureId: "class-library",
    featureName: "Class library",
    location: "/classes",
    category: "practice",
    headline: "From a full library to one teachable program",
    overview:
      "The public library separates workouts, programs, and individual exercises, then opens a program without leaving the page. This walk uses the same controls a teacher uses to move from browsing to a concrete sequence.",
    scope:
      "This event showcase walks the public class library only. My Library, imports, AI connections, the authenticated studio, and native apps are outside this run and are not counted as covered.",
    keyFeatures: ["Public class inventory", "Programs separated from workouts", "Program detail opens in context"],
    async drive(walk) {
      // The hero is valuable context but puts the changing cards below the
      // fold. Frame the tabs and grid before the first capture so the next
      // state visibly proves the filter changed the library.
      if (!(await walk.ctx.scrollToSelector('button[role="tab"]', 110))) throw new Error("Class tabs were not present");
      await walk.ctx.settle();
      const steps = [step(1, "The class inventory at rest", "Opened the public class library.", "Programs, workouts, and exercises share one library, with counts visible before a teacher chooses a format.", await walk.shot("step-01-library.png"), "The Yoga Quest class library showing workouts and format counts", "/classes")];
      if (!(await walk.ctx.click('button[role="tab"]:has-text("Programs")'))) throw new Error("Programs tab was not present");
      await walk.ctx.settle();
      steps.push(step(2, "Programs, not isolated workouts", 'Selected the "Programs" tab.', "The grid changes to multi-session paths and shows duration and session counts, so the distinction is visible in the content rather than only in a label.", await walk.shot("step-02-programs.png"), "Yoga Quest filtered to multi-session programs", "/classes"));
      if (!(await walk.ctx.clickText("Build a balance practice"))) throw new Error("Balance program card was not present");
      await walk.ctx.waitForSelector('[role="dialog"]');
      await walk.ctx.settle();
      steps.push(step(3, "The program opens with its path", 'Opened "Build a balance practice".', "The detail view names the program's sequence and progression in place, preserving the library context behind it.", await walk.shot("step-03-program-detail.png"), "The Build a balance practice program detail", "/classes"));
      return steps;
    },
  },
  {
    slug: "globe-quest",
    name: "Globe Quest",
    base: "https://www.globequest.app",
    featureId: "world-explorer",
    featureName: "World explorer",
    location: "/explore",
    category: "discovery",
    headline: "A place can be chosen or discovered",
    overview:
      "The explorer begins as a navigable globe with filters and a place index. A surprise selection and flat-map switch are walked as real state changes rather than described from the route tree.",
    scope:
      "This event showcase walks the public world explorer only. Quests, circles, the journal, city relocation guides, accounts, and paid access are outside this run and are not counted as covered.",
    keyFeatures: ["Globe and flat-map views", "Public place index", "A surprise discovery updates the selected place"],
    async drive(walk) {
      const steps = [step(1, "The globe as an index", "Opened the public explorer.", "Filters, layers, saved places, and a searchable place index surround the globe without requiring an account.", await walk.shot("step-01-globe.png"), "Globe Quest's public globe explorer", "/explore")];
      if (!(await walk.ctx.clickText("Surprise me"))) throw new Error("Surprise control was not present");
      await walk.ctx.settle();
      const surprise = await walk.shot("step-02-surprise.png", { optional: true });
      if (surprise) steps.push(step(2, "A real place is selected", 'Clicked "Surprise me".', "The URL and explorer state move to an actual place chosen by the product; this capture records the result of the interaction, not the armed button.", surprise, "A surprise place selected in Globe Quest", "/explore"));
      if (!(await walk.ctx.clickText("Flat map"))) throw new Error("Flat map control was not present");
      await walk.ctx.settle();
      const flat = await walk.shot("step-03-flat-map.png", { optional: true });
      if (flat) steps.push(step(steps.length + 1, "The same discovery, another projection", 'Selected "Flat map".', "The selected place remains in context while the geographic view changes, making the projection a surface choice rather than a new feature.", flat, "The selected Globe Quest place on the flat map", "/explore"));
      return steps;
    },
  },
  {
    slug: "polytyper",
    name: "Polytyper",
    base: "https://www.polytyper.com",
    featureId: "language-keyboards",
    featureName: "Switching language keyboards",
    location: "/keyboard/arabic",
    category: "typing",
    headline: "From one writing system to another",
    overview:
      "Polytyper keeps language layouts inside one keyboard workspace. This walk opens the language picker and moves from the Arabic layout to the Russian layout through the real navigation control.",
    scope:
      "This event showcase walks one public Arabic keyboard interaction only. The other language layouts, trainer, phrasebook, map, dictation, speech, and accounts are outside this run and are not counted as covered.",
    keyFeatures: ["Right-to-left Arabic layout", "Keyboard-aware language picker", "Russian layout reached without returning home"],
    async drive(walk) {
      const steps = [step(1, "A right-to-left editor, ready", "Opened the Arabic keyboard.", "The editor, mode control, speech actions, and complete on-screen layout are available without sign-in.", await walk.shot("step-01-keyboard.png"), "Polytyper's Arabic keyboard before typing", "/keyboard/arabic")];
      if (!(await walk.ctx.click('button:has-text("Jump to language")'))) throw new Error("Language picker control was not present");
      await walk.ctx.settle();
      steps.push(step(2, "Every language stays in reach", 'Opened "Jump to language".', "The modal lists keyboard destinations with both English and native-language names, without losing the current Arabic workspace behind it.", await walk.shot("step-02-language-picker.png", { sparse: true }), "Polytyper's language picker over the Arabic keyboard", "/keyboard/arabic"));
      if (!(await walk.ctx.click('button:has-text("Russian keyboard")'))) throw new Error("Russian keyboard option was not present");
      await walk.ctx.waitForSelector('[aria-label="Russian text field"]');
      await walk.ctx.settle();
      steps.push(step(3, "The Russian layout replaces the Arabic one", 'Selected "Russian keyboard".', "The route, writing direction, editor label, and complete key layout now describe Russian. This is a different language surface reached through the product's own switcher.", await walk.shot("step-03-russian.png", { firstOfScreen: true }), "Polytyper's Russian keyboard after switching languages", "/keyboard/russian"));
      return steps;
    },
  },
  {
    slug: "system-designer",
    name: "System Designer",
    base: "https://www.systemdesigner.net",
    featureId: "lesson-reading",
    featureName: "Reading a system-design lesson",
    location: "/fundamentals/what-is-system-design",
    category: "learning",
    headline: "A long lesson with an AI side path",
    overview:
      "The public lesson combines structured teaching, diagrams, a quiz, and an optional AI panel. The walk reads into the lesson and opens that panel without claiming a model answer it did not request.",
    scope:
      "This event showcase walks one public fundamentals lesson only. The wider curriculum, practice, whiteboard, projects, quizzes, accounts, and any AI response are outside this run and are not counted as covered.",
    keyFeatures: ["Public long-form lesson", "Structured diagrams and trade-offs", "AI panel opened without submitting a prompt"],
    async drive(walk) {
      const steps = [step(1, "The lesson begins with the decision problem", "Opened the public system-design lesson.", "The page starts with the forces a design must balance and exposes the wider curriculum in its navigation.", await walk.shot("step-01-lesson.png"), "The opening of What is System Design", "/fundamentals/what-is-system-design")];
      const scrolled = await walk.ctx.evaluate(`(() => { const h=[...document.querySelectorAll('h2,h3')].find(e=>e.textContent?.includes('simple read path')); if(!h)return false; const top=h.getBoundingClientRect().top+scrollY-90; scrollTo({top,behavior:'instant'}); return true; })()`);
      if (!scrolled) throw new Error("Read-path section was not present");
      await walk.ctx.settle();
      steps.push(step(2, "The architecture is traced as a request", 'Scrolled to "A simple read path with deliberate boundaries".', "The lesson moves from definitions to a concrete client, load balancer, service, cache, primary store, and replica path.", await walk.shot("step-02-read-path.png"), "The system-design lesson's simple read path diagram", "/fundamentals/what-is-system-design"));
      if (!(await walk.ctx.clickText("Ask AI"))) throw new Error("Ask AI control was not present");
      await walk.ctx.waitForSelector("textarea");
      await walk.ctx.settle();
      steps.push(step(3, "The AI path is present but unclaimed", 'Opened the "Ask AI" panel.', "The question composer is visible, but this bounded walk does not submit a prompt or claim an answer it did not observe.", await walk.shot("step-03-ai-panel.png"), "The Learn with AI panel open beside the lesson", "/fundamentals/what-is-system-design"));
      return steps;
    },
  },
];

function step(stepNumber, title, action, description, screenshotFilename, screenshotAlt, location) {
  return { stepNumber, title, action, description, screenshotFilename, screenshotAlt, location, verificationStatus: "live-walked" };
}

function writeJson(dir, name, value) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function previousRuns(out) {
  const file = join(out, "runs.json");
  if (!existsSync(file)) return { runs: [] };
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return { runs: [] }; }
}

async function captureProject(project) {
  const out = join(STORE, project.slug);
  const startedAt = new Date().toISOString();
  const statuses = {};
  const issues = [];
  const saved = [];
  const cap = await openCapture({ outDir: out, videoDir: join(out, "video"), driver: "playwright" });

  console.log(`\n${project.name} · ${project.location}`);
  for (const surface of [SURFACES.desktop, SURFACES.mobile]) {
    let walk = null;
    try {
      walk = await cap.feature(project.featureId, surface, {
        url: `${project.base}${project.location}`,
        video: project.slug === "yoga-quest-web" && surface.id === "desktop",
      });
      const steps = await project.drive(walk);
      const { video } = await walk.finish();
      if (video && steps.length > 0) steps[steps.length - 1].videoFilename = `video/${video.split("/").pop()}`;
      if (steps.length < 2) throw new Error("the interaction produced fewer than two distinct observed states");
      const artifact = {
        featureId: project.featureId,
        featureName: project.featureName,
        type: "feature",
        location: project.location,
        category: project.category,
        surface: surface.id,
        platform: "web",
        locale: "en",
        headline: project.headline,
        overview: project.overview,
        steps,
        keyFeatures: project.keyFeatures,
        capturedAt: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        note: "Captured from the public production URL. The deployment does not expose a source commit, so this evidence is intentionally not pinned to the local checkout's HEAD.",
      };
      writeJson(out, `${project.featureId}.${surface.id}.json`, artifact);
      statuses[surface.id] = "done";
      saved.push(artifact);
      console.log(`  ✓ ${surface.id}: ${steps.length} observed states`);

      for (const failure of walk.failures().filter((item) => item.status >= 500)) {
        issues.push({
          id: `${surface.id}-http-${failure.status}-${issues.length + 1}`,
          featureId: project.featureId,
          location: failure.path,
          surface: surface.id,
          severity: "major",
          title: `HTTP ${failure.status} during capture`,
          detail: "Observed in the production browser session and preserved as a finding; the walkthrough did not modify the application.",
          foundAt: new Date().toISOString(),
          status: "open",
        });
      }
    } catch (error) {
      statuses[surface.id] = "blocked";
      if (walk) await walk.finish().catch(() => {});
      issues.push({
        id: `walk-failed-${surface.id}`,
        featureId: project.featureId,
        location: project.location,
        surface: surface.id,
        severity: "major",
        title: `${surface.id} capture failed`,
        detail: error.message,
        foundAt: new Date().toISOString(),
        status: "open",
      });
      console.log(`  ✗ ${surface.id}: ${error.message.split("\n")[0]}`);
    }
  }

  const report = cap.report();
  await cap.close();
  for (const overflow of report.overflows) {
    issues.push({
      id: `horizontal-overflow-${overflow.surface}`,
      featureId: project.featureId,
      location: project.location,
      surface: overflow.surface,
      severity: "major",
      title: `${project.featureName} overflows on ${overflow.surface}`,
      detail: `Measured ${overflow.contentWidth}px of document width on a ${overflow.surfaceWidth}px surface.`,
      foundAt: new Date().toISOString(),
      status: "open",
    });
  }

  const completedAt = new Date().toISOString();
  writeJson(out, "catalog.json", {
    schemaVersion: 2,
    projectName: project.name,
    platform: "web",
    driver: "playwright",
    capturedAgainst: project.base,
    discoveredAt: startedAt,
    updatedAt: completedAt,
    scope: { status: "bounded", note: project.scope },
    features: [{
      featureId: project.featureId,
      featureName: project.featureName,
      location: project.location,
      category: project.category,
      requiresAuth: false,
      surfaceStatus: statuses,
      videoStatus: saved.some((walkthrough) => walkthrough.steps.some((item) => item.videoFilename)) ? "done" : "pending",
      issueCount: issues.length,
      lastWalkthroughAt: saved.length ? completedAt : null,
      notes: project.scope,
    }],
    personas: [],
  });
  writeJson(out, "issues.json", { issues, updatedAt: completedAt });

  const runs = previousRuns(out);
  runs.runs.push({
    id: completedAt,
    startedAt,
    completedAt,
    skill: "walkthrough",
    agent: "walk-humanquest-showcase.mjs",
    target: {
      sha: "",
      shaShort: "—",
      dirty: false,
      commitSubject: "Public production capture; deployed source SHA not exposed",
    },
    config: {
      platform: "web",
      driver: "playwright",
      capturedAgainst: `${project.base}${project.location}`,
      surfaces: report.surfaces,
      locales: ["en"],
      notes: [
        "bounded event showcase; not a complete product catalog",
        "production deployment SHA not exposed; no local commit is claimed",
        `invariants verified: ${Object.keys(report.verified).join(", ") || "none"}`,
        ...report.warnings,
      ].join(" · "),
    },
    coverage: {
      features: saved.length ? [project.featureId] : [],
      personas: [],
      screenshots: report.captures,
      videos: saved.flatMap((walkthrough) => walkthrough.steps).filter((item) => item.videoFilename).length,
      issues: issues.length,
    },
  });
  writeJson(out, "runs.json", runs);
  return { project: project.slug, captures: report.captures, surfaces: report.surfaces, issues: issues.length };
}

const selected = argv.project ? PROJECTS.filter((project) => project.slug === argv.project) : PROJECTS;
if (selected.length === 0) throw new Error(`unknown project ${argv.project}`);
const summary = [];
for (const project of selected) summary.push(await captureProject(project));
console.log(`\n${JSON.stringify(summary, null, 2)}`);
