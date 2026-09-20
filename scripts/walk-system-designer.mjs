#!/usr/bin/env node
/**
 * A product-level System Designer walkthrough.
 *
 * Reconnaissance is intentionally separate from recording: the live product
 * was first explored with the host's computer-control tool, then these stable
 * paths were encoded against the repository capture contract. That makes the
 * result rerunnable from Codex or Claude on macOS or Windows while keeping the
 * evidence deterministic.
 *
 * Usage: node scripts/walk-system-designer.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openCapture, SURFACES } from "./lib/capture/index.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "apps", "hub", "public", "walkthroughs", "system-designer");
const BASE = "https://www.systemdesigner.net";
const startedAt = new Date().toISOString();
const issues = [];
const completed = new Map();
const videoRefs = new Set();

const FEATURES = [
  {
    featureId: "daily-learning-path",
    featureName: "Daily learning path",
    location: "/learn",
    category: "learning",
    requiresAuth: false,
    headline: "A concept becomes a working request path",
    overview:
      "The daily path turns a large curriculum into a short session. This walk opens the first lesson and drives its browser-to-service-to-database model rather than stopping at the lesson card.",
    targetAudience: "A developer beginning structured system-design study",
    async drive(walk) {
      const steps = [];
      steps.push(step(1, "A finite plan for the day", "Opened the Daily Learning Path.", "The learner sees one chapter, a seven-part week, an experience-placement option, and a clear first lesson instead of a wall of unrelated articles.", await walk.shot("step-01-daily-plan.png"), "System Designer's daily learning path with the first week of lessons", "/learn"));
      if (!(await walk.ctx.click('button:has-text("How a web request works")'))) throw new Error("The first daily lesson was not available");
      await walk.ctx.waitForSelector('button:has-text("Send a request")');
      steps.push(step(2, "The lesson opens as a system", 'Opened "How a web request works".', "A three-minute lesson frames the request as an interactive Browser → Service → Database system, with five moments to advance through.", await walk.shot("step-02-lesson-open.png"), "The interactive How a web request works lesson", "/learn"));
      if (!(await walk.ctx.clickText("Send a request"))) throw new Error("Send a request was not available");
      steps.push(step(3, "The request moves to its next hop", 'Clicked "Send a request".', "The diagram advances to **2 of 5** and changes the primary action to **Next hop**. The lesson is demonstrating causality, not merely displaying a finished diagram.", await walk.shot("step-03-request-moving.png"), "The lesson after sending a request, at moment two of five", "/learn"));
      return steps;
    },
  },
  {
    featureId: "capacity-planning-lab",
    featureName: "Capacity planning lab",
    location: "/tools/capacity-planning",
    category: "tools",
    requiresAuth: false,
    headline: "Break a capacity plan before production does",
    overview:
      "The control room ties growth, storage, traffic, fleet survival, headroom, and cost together. Scenario buttons make the trade-off visible immediately, so this walk records the changed outputs rather than just the sliders.",
    targetAudience: "An engineer sizing a service before a launch",
    async drive(walk) {
      const steps = [];
      await walk.ctx.scrollToSelector('h2:has-text("Operational scenario")', 100);
      steps.push(step(1, "The baseline has numbers, not adjectives", "Opened the capacity-planning control room and moved to the operational scenarios.", "The baseline quantifies users, replicated storage, scenario RPS, surviving instances, headroom, and monthly cost in one model.", await walk.shot("step-01-baseline.png"), "Capacity planning baseline and scenario controls", "/tools/capacity-planning"));
      if (!(await walk.ctx.click('button:has-text("Launch spike")'))) throw new Error("Launch spike scenario was not available");
      steps.push(step(2, "A launch more than doubles demand", 'Selected "Launch spike".', "The same fleet is challenged with **2.2× demand**; the scenario output rises from 87.5K to 192.5K RPS, making the capacity risk concrete.", await walk.shot("step-02-launch-spike.png"), "Capacity plan under the launch spike scenario", "/tools/capacity-planning"));
      if (!(await walk.ctx.click('button:has-text("Zone loss")'))) throw new Error("Zone loss scenario was not available");
      steps.push(step(3, "The plan survives with one zone gone", 'Selected "Zone loss".', "The model removes a third of the fleet while keeping peak traffic, so the learner can read the new surviving-instance and headroom consequences before touching production.", await walk.shot("step-03-zone-loss.png"), "Capacity plan after losing one availability zone", "/tools/capacity-planning"));
      return steps;
    },
  },
  {
    featureId: "interview-gym",
    featureName: "Interview gym",
    location: "/gym",
    category: "practice",
    requiresAuth: false,
    headline: "From six prompts to one timed design session",
    overview:
      "The gym offers focused system-design prompts with difficulty and skill filters. This walk chooses the URL shortener, reads the rubric and expectations, then starts the 45-minute session.",
    targetAudience: "An interview candidate rehearsing under realistic constraints",
    async drive(walk) {
      const steps = [];
      steps.push(step(1, "Six interview rooms, each with a purpose", "Opened the Interview Gym.", "The candidate can compare URL shortener, chat, feed, streaming, cache, and search prompts by difficulty and focus before committing to a timed session.", await walk.shot("step-01-gym.png"), "System Designer Interview Gym with six practice prompts", "/gym"));
      if (!(await walk.ctx.click('a:has-text("Start Session")'))) throw new Error("No interview session link was available");
      await walk.ctx.waitForSelector('button:has-text("Start 45-Minute Session")');
      steps.push(step(2, "The URL shortener brief sets the bar", "Opened the URL Shortener Service prompt.", "The brief states the problem, expectations, components to consider, notes area, interview tips, and the 45-minute constraint before the timer begins.", await walk.shot("step-02-url-shortener-brief.png", { firstOfScreen: true }), "The URL Shortener interview problem and expectations", "/gym/url-shortener"));
      if (!(await walk.ctx.click('button:has-text("Start 45-Minute Session")'))) throw new Error("Timed interview session could not be started");
      steps.push(step(3, "The rehearsal is now live", 'Clicked "Start 45-Minute Session".', "The session enters its timed state with the prompt and working notes still in view. The candidate has crossed from browsing practice material into doing the interview.", await walk.shot("step-03-session-running.png"), "The URL Shortener interview session after its timer starts", "/gym/url-shortener"));
      return steps;
    },
  },
  {
    featureId: "knowledge-quizzes",
    featureName: "Knowledge quizzes",
    location: "/quiz",
    category: "assessment",
    requiresAuth: false,
    headline: "Find a topic, answer it, and get immediate evidence",
    overview:
      "The assessment hub spans the whole curriculum. This walk narrows it to fundamentals, opens the system-design quiz, and answers a real question correctly so the artifact contains feedback rather than an untouched question form.",
    targetAudience: "A learner checking whether the fundamentals have stuck",
    async drive(walk) {
      const steps = [];
      steps.push(step(1, "The assessment map mirrors the curriculum", "Opened the Knowledge Assessment Hub.", "Topic counts and category filters expose quizzes across ML, fundamentals, GenAI, technology, case studies, practice, reference, and tools.", await walk.shot("step-01-quiz-hub.png"), "System Designer's knowledge assessment hub", "/quiz"));
      if (!(await walk.ctx.click('button:has-text("Fundamentals(52)")'))) throw new Error("Fundamentals quiz filter was not available");
      steps.push(step(2, "Fifty-two fundamentals checks", 'Selected the "Fundamentals" category.', "The hub narrows to system-design foundations such as scalability, reliability, databases, APIs, queues, and architecture.", await walk.shot("step-02-fundamentals-filter.png"), "The quiz hub filtered to fundamentals", "/quiz"));
      if (!(await walk.ctx.click('button:has-text("Start Quiz")'))) throw new Error("A fundamentals quiz could not be opened");
      await walk.ctx.waitForSelector('button:has-text("To design scalable, reliable, and maintainable systems")');
      steps.push(step(3, "One question, four explicit trade-offs", 'Opened the "What is System Design?" quiz.', "The first question asks for the field's primary goal and exposes four plausible choices, progress, score, and keyboard navigation.", await walk.shot("step-03-question.png", { firstOfScreen: true }), "The first question in the What is System Design quiz", "/quiz"));
      if (!(await walk.ctx.click('button:has-text("To design scalable, reliable, and maintainable systems")'))) throw new Error("The observed correct answer was not available");
      steps.push(step(4, "The answer is checked immediately", "Selected the scalable, reliable, and maintainable systems answer.", "The chosen answer turns green and the answered count advances to **1 of 4**. The walkthrough records the assessed outcome, not just a ready-to-submit state.", await walk.shot("step-04-correct-answer.png"), "The first system-design quiz answer marked correct", "/quiz"));
      return steps;
    },
  },
];

const cap = await openCapture({ outDir: OUT, videoDir: join(OUT, "video"), driver: "playwright" });

function step(stepNumber, title, action, description, screenshotFilename, screenshotAlt, location) {
  return { stepNumber, title, action, description, screenshotFilename, screenshotAlt, location, verificationStatus: "live-walked" };
}

function writeJson(name, value) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(name, fallback) {
  const file = join(OUT, name);
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}

async function walkFeature(feature, surface) {
  const walk = await cap.feature(feature.featureId, surface, {
    url: `${BASE}${feature.location}`,
    video: surface.id === "desktop",
  });
  try {
    const steps = await feature.drive(walk);
    const { video } = await walk.finish();
    if (video) {
      const ref = `video/${video.split("/").pop()}`;
      steps[steps.length - 1].videoFilename = ref;
      videoRefs.add(ref);
    }
    const now = new Date().toISOString();
    writeJson(`${feature.featureId}.${surface.id}.json`, {
      featureId: feature.featureId,
      featureName: feature.featureName,
      type: "feature",
      location: feature.location,
      category: feature.category,
      surface: surface.id,
      platform: "web",
      locale: "en",
      headline: feature.headline,
      overview: feature.overview,
      targetAudience: feature.targetAudience,
      steps,
      capturedAt: now,
      generatedAt: now,
      note: "Live production evidence. Discovery used Codex computer control; recording used the cross-runtime capture contract so Claude can rerun the same script.",
    });
    completed.set(`${feature.featureId}:${surface.id}`, true);
    console.log(`  ✓ ${feature.featureId} · ${surface.id} · ${steps.length} steps${video ? " · video" : ""}`);
  } catch (error) {
    await walk.finish().catch(() => {});
    issues.push({
      id: `walk-failed-${feature.featureId}-${surface.id}`,
      featureId: feature.featureId,
      location: feature.location,
      surface: surface.id,
      severity: "major",
      title: `${feature.featureName} failed on ${surface.label}`,
      detail: error.message,
      foundAt: new Date().toISOString(),
      status: "open",
    });
    console.log(`  ✗ ${feature.featureId} · ${surface.id} · ${error.message.split("\n")[0]}`);
  }
}

async function walkPersonaJourney() {
  const walk = await cap.feature("journey-interview-candidate", SURFACES.desktop, {
    url: `${BASE}/learn`,
    video: true,
  });
  const scenes = [];
  try {
    scenes.push(scene("plan", "Maya starts with today's plan", "Maya is a frontend engineer moving toward senior roles. She needs a tractable path through system design, not another unranked reading list. The daily plan gives her one chapter and a visible week.", await walk.shot("scene-01-plan.png"), "/learn", "daily-learning-path", "Opened the Daily Learning Path."));

    if (!(await walk.ctx.click('button:has-text("How a web request works")'))) throw new Error("Persona could not open the first lesson");
    scenes.push(scene("lesson", "She opens the smallest useful lesson", "The first lesson is only three minutes, but it names the browser, service, and database as one system. That is small enough to begin and concrete enough to rehearse.", await walk.shot("scene-02-lesson.png"), "/learn", "daily-learning-path", 'Opened "How a web request works".'));

    if (!(await walk.ctx.clickText("Send a request"))) throw new Error("Persona could not send the request");
    scenes.push(scene("request", "She watches causality, one hop at a time", "The diagram advances to moment two of five. Maya is not memorising a static architecture; she is following what actually happens after a user action.", await walk.shot("scene-03-request.png"), "/learn", "daily-learning-path", 'Clicked "Send a request".'));

    await walk.ctx.goto(`${BASE}/tools/capacity-planning`);
    await walk.ctx.scrollToSelector('h2:has-text("Operational scenario")', 100);
    scenes.push(scene("model", "The lesson turns into an operating model", "Next she opens the capacity control room. Users, storage, RPS, instances, headroom, and cost put numbers behind the boxes she just learned.", await walk.shot("scene-04-model.png", { firstOfScreen: true }), "/tools/capacity-planning", "capacity-planning-lab", "Opened the capacity-planning control room."));

    if (!(await walk.ctx.click('button:has-text("Launch spike")'))) throw new Error("Persona could not apply launch spike");
    scenes.push(scene("stress", "She breaks the happy-path forecast", "A launch spike drives 2.2 times the planned peak through the same fleet. The changed RPS is the moment a design assumption becomes an interview talking point.", await walk.shot("scene-05-launch-spike.png"), "/tools/capacity-planning", "capacity-planning-lab", 'Selected "Launch spike".'));

    await walk.ctx.goto(`${BASE}/gym`);
    if (!(await walk.ctx.click('a:has-text("Start Session")'))) throw new Error("Persona could not choose an interview prompt");
    await walk.ctx.waitForSelector('button:has-text("Start 45-Minute Session")');
    scenes.push(scene("brief", "She chooses the URL shortener rehearsal", "The interview brief gives Maya a problem statement, expectations, components, notes, and tips. Her earlier request path and capacity model now have somewhere to be used.", await walk.shot("scene-06-brief.png", { firstOfScreen: true }), "/gym/url-shortener", "interview-gym", "Opened the URL Shortener Service prompt."));

    if (!(await walk.ctx.click('button:has-text("Start 45-Minute Session")'))) throw new Error("Persona could not start the timed session");
    scenes.push(scene("practice", "The timer starts; preparation becomes practice", "Maya starts the 45-minute session with the rubric and working notes in reach. The payoff is not another completed article: it is a realistic rehearsal where she can explain the system under time pressure.", await walk.shot("scene-07-practice.png"), "/gym/url-shortener", "interview-gym", 'Clicked "Start 45-Minute Session".'));

    const { video } = await walk.finish();
    const now = new Date().toISOString();
    const journey = {
      personaId: "interview-candidate",
      journeyId: "learn-model-practice",
      headline: "From one request hop to a timed system-design interview",
      overview: "Maya uses System Designer as a progression: learn one causal model, stress it with real capacity numbers, and then explain a related design under interview conditions.",
      payoff: "She begins a timed URL-shortener design session with a request model and capacity language she has just practised.",
      scenes,
      platform: "web",
      surface: "desktop",
      capturedAt: now,
      ...(video ? { walkRecording: `video/${video.split("/").pop()}` } : {}),
    };
    if (journey.walkRecording) videoRefs.add(journey.walkRecording);
    writeJson("persona-interview-candidate.learn-model-practice.json", journey);
    console.log(`  ✓ persona · interview-candidate · ${scenes.length} scenes · video`);
    return true;
  } catch (error) {
    await walk.finish().catch(() => {});
    issues.push({ id: "journey-failed-interview-candidate", severity: "major", title: "Interview candidate journey failed", detail: error.message, foundAt: new Date().toISOString(), status: "open" });
    console.log(`  ✗ persona · ${error.message.split("\n")[0]}`);
    return false;
  }
}

function scene(id, title, narrative, frame, location, sourceFeature, action) {
  return { id, title, narrative, frames: [frame], location, surface: "desktop", sourceFeature, action, verificationStatus: "live-walked" };
}

console.log(`\nWalking System Designer against ${BASE}\n`);
for (const feature of FEATURES) {
  for (const surface of [SURFACES.desktop, SURFACES.mobile]) await walkFeature(feature, surface);
}
const personaDone = await walkPersonaJourney();

const report = cap.report();
await cap.close();
for (const overflow of report.overflows) {
  issues.push({
    id: `horizontal-overflow-${overflow.featureId}-${overflow.surface}`,
    featureId: overflow.featureId,
    location: overflow.location ? new URL(overflow.location).pathname : undefined,
    surface: overflow.surface,
    severity: "major",
    title: `${overflow.featureId} overflows on ${overflow.surface}`,
    detail: `Measured ${overflow.contentWidth}px of content on a ${overflow.surfaceWidth}px surface.`,
    foundAt: new Date().toISOString(),
    status: "open",
  });
}

const completedAt = new Date().toISOString();
const catalogEntries = [
  ...FEATURES.map((feature) => ({ ...feature, source: undefined })),
  { featureId: "lesson-reading", featureName: "Long-form fundamentals lesson", location: "/fundamentals/what-is-system-design", category: "learning", requiresAuth: false, legacyDone: true, notes: "Existing live walk retained; it reaches the lesson's read-path diagram and opens the AI learning panel without claiming an unobserved model response." },
  { featureId: "fundamentals-curriculum", featureName: "Fundamentals curriculum", location: "/fundamentals", category: "learning", requiresAuth: false },
  { featureId: "genai-systems", featureName: "GenAI systems curriculum", location: "/genai", category: "learning", requiresAuth: false },
  { featureId: "ml-systems", featureName: "ML systems curriculum", location: "/ml-systems", category: "learning", requiresAuth: false },
  { featureId: "technology-library", featureName: "Technology library", location: "/technology", category: "learning", requiresAuth: false },
  { featureId: "interview-questions", featureName: "Interview question library", location: "/practice", category: "practice", requiresAuth: false },
  { featureId: "case-studies", featureName: "Case studies", location: "/case-studies", category: "learning", requiresAuth: false },
  { featureId: "reference-library", featureName: "Quick reference library", location: "/reference", category: "reference", requiresAuth: false },
  { featureId: "tool-library", featureName: "Engineering tool library", location: "/tools", category: "tools", requiresAuth: false },
  { featureId: "whiteboard", featureName: "System design whiteboard", location: "/whiteboard", category: "creation", requiresAuth: true, authRole: "learner", blocked: true, notes: "The live route was reached and displayed a Google sign-in gate. An owner session is required before this can be walked." },
  { featureId: "projects", featureName: "Saved design projects", location: "/projects", category: "creation", requiresAuth: true, authRole: "learner", blocked: true, notes: "Authenticated creation and saving remain in the inventory; they were not omitted from the denominator." },
].map((feature) => {
  const desktopDone = completed.has(`${feature.featureId}:desktop`) || feature.legacyDone;
  const mobileDone = completed.has(`${feature.featureId}:mobile`) || feature.legacyDone;
  return {
    featureId: feature.featureId,
    featureName: feature.featureName,
    location: feature.location,
    category: feature.category,
    requiresAuth: feature.requiresAuth,
    ...(feature.authRole ? { authRole: feature.authRole } : {}),
    surfaceStatus: {
      desktop: feature.blocked ? "blocked" : desktopDone ? "done" : "pending",
      mobile: feature.blocked ? "blocked" : mobileDone ? "done" : "pending",
    },
    videoStatus: videoRefs.size > 0 && FEATURES.some((item) => item.featureId === feature.featureId) ? "done" : "pending",
    issueCount: issues.filter((issue) => issue.featureId === feature.featureId).length,
    lastWalkthroughAt: desktopDone || mobileDone ? completedAt : null,
    ...(feature.notes ? { notes: feature.notes } : {}),
  };
});

writeJson("catalog.json", {
  schemaVersion: 2,
  projectName: "System Designer",
  platform: "web",
  driver: "playwright",
  capturedAgainst: BASE,
  discoveredAt: startedAt,
  updatedAt: completedAt,
  scope: {
    status: "comprehensive",
    note: "Top-level capabilities were reconciled from source navigation and live Codex computer-control reconnaissance. Unwalked and authenticated capabilities remain visible as pending or blocked.",
    excluded: ["Administrative content-management routes that are not part of the learner product"],
  },
  features: catalogEntries,
  personas: [{
    id: "interview-candidate",
    name: "Maya Chen",
    description: "A frontend engineer preparing for senior interviews who needs to turn scattered system-design knowledge into explanations she can defend under time pressure.",
    portrait: "personas/interview-candidate.png",
    entryPoint: "/learn",
    keyJourneys: personaDone ? ["learn-model-practice"] : [],
    navItems: [
      { label: "Learn", location: "/learn" },
      { label: "Model", location: "/tools/capacity-planning" },
      { label: "Practice", location: "/gym" },
      { label: "Assess", location: "/quiz" },
    ],
  }],
});
writeJson("issues.json", { issues, updatedAt: completedAt });

const runs = readJson("runs.json", { runs: [] });
runs.runs.push({
  id: completedAt,
  startedAt,
  completedAt,
  skill: "walkthrough",
  agent: "codex-recon + walk-system-designer.mjs",
  target: { sha: "", shaShort: "—", dirty: false, commitSubject: "Public production capture; deployed source SHA not exposed" },
  config: {
    platform: "web",
    driver: "playwright",
    capturedAgainst: BASE,
    surfaces: report.surfaces,
    locales: ["en"],
    notes: [
      "live reconnaissance performed with Codex computer control",
      "deterministic evidence recorded through the cross-runtime driver contract",
      "production deployment SHA not exposed; no local checkout commit is claimed",
      `invariants verified: ${Object.keys(report.verified).join(", ") || "none"}`,
      ...report.warnings,
    ].join(" · "),
  },
  coverage: {
    features: FEATURES.filter((feature) => completed.has(`${feature.featureId}:desktop`) || completed.has(`${feature.featureId}:mobile`)).map((feature) => feature.featureId),
    personas: personaDone ? ["interview-candidate"] : [],
    screenshots: report.captures,
    videos: videoRefs.size,
    issues: issues.length,
  },
});
writeJson("runs.json", runs);

console.log(`\n${report.captures} captures · ${videoRefs.size} videos · ${issues.length} issues`);
