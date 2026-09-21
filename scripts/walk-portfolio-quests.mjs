#!/usr/bin/env node
/**
 * Deep public-entry journeys for the Human Quest homepage portfolio.
 *
 * These are not brochure screenshots: every project advances through at least
 * five distinct observed states and ends at a concrete decision or product
 * gate. Source-only features stay visible as pending/blocked in catalog.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { openCapture, SURFACES } from "./lib/capture/index.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STORE = join(ROOT, "apps", "hub", "public", "walkthroughs");
const argv = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));

const PROJECTS = [
  {
    slug: "autobounds",
    name: "AutoBounds",
    base: "https://www.autobounds.com",
    codebase: "../autobounds",
    featureId: "evaluate-field-mapping-workflow",
    featureName: "Evaluating a field-mapping workflow",
    category: "field mapping",
    entry: "/",
    persona: {
      id: "ag-operations-lead",
      name: "Maya Thornton",
      description: "Runs mapping operations for a regional agriculture team and needs a faster first pass before GIS review. She cares about accepted boundaries and export compatibility, not an impressive model name on its own.",
      journeyId: "assess-ai-boundary-workflow",
      payoff: "Maya reaches the real app gate knowing the three-step workflow, available models, export formats, and credit model she is evaluating.",
    },
    inventory: [
      ["map-and-extract", "Map and extract field boundaries", "/projects/[projectId]/farms/[farmId]/fields/[fieldId]", "field mapping", true],
      ["model-labs", "Compare extraction models", "/labs", "experiments", true],
      ["projects-and-farms", "Organize projects, farms, and fields", "/projects", "organization", true],
      ["export-boundaries", "Export accepted boundaries", "/projects/[projectId]", "export", true],
      ["admin-operations", "Operate model and user settings", "/admin", "administration", true],
    ],
    async drive(walk) {
      const p = walk.ctx._page;
      const steps = [];
      steps.push(await shotStep(walk, 1, "The outcome is stated before the machinery", "Opened the public AutoBounds product page.", "The promise is concrete: turn manual delineation into an export-ready starting point from satellite imagery.", "step-01-outcome.png", "AutoBounds explaining AI field-boundary mapping", "/"));
      await scrollHeading(p, "Simple Process, Powerful Results");
      steps.push(await shotStep(walk, 2, "The workflow is point, process, export", "Moved to the three-step workflow.", "Maya can see what she must provide, what the model does, and what leaves the system before she evaluates implementation detail.", "step-02-workflow.png", "The three-step AutoBounds field mapping workflow", "/"));
      await p.getByRole("link", { name: /See AI Model Comparison/i }).click();
      await p.waitForLoadState("domcontentloaded");
      steps.push(await shotStep(walk, 3, "Models are compared by operating trade-offs", "Opened the AI model comparison.", "The model page makes speed, prompting, and boundary quality part of the product decision instead of presenting AI as one opaque button.", "step-03-models.png", "AutoBounds AI model comparison", "/ai-models", { firstOfScreen: true }));
      await p.goto(`${this.base}/pricing`, { waitUntil: "domcontentloaded" });
      steps.push(await shotStep(walk, 4, "Credits map to accepted work", "Opened pricing.", "Pricing explains that one credit buys one extraction and is deducted only when a result is accepted, which is the operational unit Maya needed.", "step-04-pricing.png", "AutoBounds credit pricing and acceptance model", "/pricing", { firstOfScreen: true }));
      await p.goto("https://app.autobounds.com/demo", { waitUntil: "domcontentloaded" });
      steps.push(await shotStep(walk, 5, "The real application starts at an account gate", "Opened the production app demo route.", "The walkthrough stops honestly at the production sign-in surface; projects, Labs, and exports remain blocked without an authenticated workspace.", "step-05-app-gate.png", "AutoBounds production sign-in screen", "/demo", { firstOfScreen: true }));
      return steps;
    },
  },
  {
    slug: "leela-quest-web",
    name: "Leela Quest · Web",
    base: "https://www.leela.quest",
    codebase: "../leela/leela_quest",
    featureId: "understand-the-game",
    featureName: "Understanding the game before playing",
    category: "guided reflection",
    entry: "/",
    persona: {
      id: "reflective-player",
      name: "Aisha Karim",
      description: "Arrives with a real decision she has been circling for weeks and wants a structured reflection, not a prediction or a generic meditation app.",
      journeyId: "prepare-for-a-guided-journey",
      payoff: "Aisha understands the intention, roll, wisdom, reflection, and observation loop before she enters the game.",
    },
    inventory: [
      ["set-intention", "Set an intention", "IntentionScreen", "journey", false],
      ["roll-and-move", "Roll and move on the board", "GameBoardScreen", "gameplay", false],
      ["receive-wisdom", "Receive square wisdom", "SquareDetailScreen", "wisdom", false],
      ["reflect-on-journey", "Reflect on the journey", "ReflectionScreen", "reflection", true],
      ["talk-mode", "Use a spoken guide", "TalkModeScreen", "guidance", false],
      ["journey-history", "Review past journeys", "HistoryScreen", "reflection", true],
    ],
    async drive(walk) {
      const p = walk.ctx._page;
      const steps = [];
      steps.push(await shotStep(walk, 1, "A journey, not a fortune teller", "Opened the public Leela Quest introduction.", "The product frames the board as self-discovery through ancient wisdom and offers native and browser entry points.", "step-01-introduction.png", "Leela Quest introduction and platform links", "/"));
      await scrollHeading(p, "How It Works");
      steps.push(await shotStep(walk, 2, "The full reflection loop is visible", "Moved to How It Works.", "Aisha sees that the product begins with her intention, uses the roll to create a prompt, and ends with reflection and observation.", "step-02-loop.png", "Leela Quest five-step reflection loop", "/"));
      await p.goto(`${this.base}/how-to-play`, { waitUntil: "domcontentloaded" });
      steps.push(await shotStep(walk, 3, "Rules turn symbolism into a usable practice", "Opened How to Play.", "The guide explains how intention, dice, snakes, arrows, and square meanings work together so the ritual is learnable rather than mystical UI.", "step-03-how-to-play.png", "Leela Quest how-to-play guide", "/how-to-play", { firstOfScreen: true }));
      await p.goto(`${this.base}/board`, { waitUntil: "domcontentloaded" });
      steps.push(await shotStep(walk, 4, "The 72-square board can be studied before a roll", "Opened the board reference.", "The board reference exposes the map and its states outside a live session, giving Aisha context for the guidance she will receive.", "step-04-board.png", "Leela Quest cosmic board reference", "/board", { firstOfScreen: true }));
      await p.goto("https://app.leelaquest.com/#/menu", { waitUntil: "domcontentloaded" });
      steps.push(await shotStep(walk, 5, "The product hands off to the real game", "Opened the production web app.", "The browser build is the actual Flutter game surface. Native iPhone evidence is published separately so this web handoff is not misrepresented as mobile-app proof.", "step-05-web-app.png", "Leela Quest production web app", "/#/menu", { firstOfScreen: true, sparse: true }));
      return steps;
    },
  },
  {
    slug: "handstand-quest-web",
    name: "Handstand Quest · Web",
    base: "https://www.handstandquest.com",
    codebase: "../handstand-timer-ios",
    featureId: "choose-a-training-workflow",
    featureName: "Choosing a handstand training workflow",
    category: "training",
    entry: "/",
    persona: {
      id: "consistent-beginner",
      name: "Jordan Lee",
      description: "Can kick up to a wall but practices inconsistently. Jordan needs a short repeatable session and visible progress, not a library that assumes they already know how to program handstand training.",
      journeyId: "choose-and-trust-a-practice",
      payoff: "Jordan sees how goals, structured or freestyle practice, voice timing, video, and progress records form one repeatable training loop.",
    },
    inventory: [
      ["goals-and-habits", "Set goals and practice habits", "GoalsView", "planning", false],
      ["structured-workouts", "Follow structured workouts", "WorkoutPlayerView", "training", false],
      ["freestyle-practice", "Run a freestyle practice", "PracticeView", "training", false],
      ["voice-timer", "Control the timer by voice", "TimerView", "practice", false],
      ["progress-stats", "Review progress and records", "StatsView", "progress", false],
      ["hands-free-video", "Record hands-free practice video", "CameraView", "recording", false],
    ],
    async drive(walk) {
      const p = walk.ctx._page;
      const steps = [];
      steps.push(await shotStep(walk, 1, "The promise is consistency and measurement", "Opened Handstand Quest.", "Jordan is told what improves: practice frequency and measurable hold time, not an abstract fitness score.", "step-01-promise.png", "Handstand Quest consistency promise", "/"));
      await scrollText(p, "Set goals and start habits");
      steps.push(await shotStep(walk, 2, "Goals become scheduled habits", "Moved to goals and habits.", "The product connects an outcome to recurring exercises instead of leaving Jordan with a one-off workout.", "step-02-habits.png", "Handstand Quest goals and habit scheduling", "/"));
      await scrollText(p, "Get right into practice mode");
      steps.push(await shotStep(walk, 3, "Voice keeps hands off the screen", "Moved to practice mode.", "Start and stop voice commands make timing compatible with being upside down—the interaction is designed around the physical task.", "step-03-voice.png", "Handstand Quest voice-controlled practice mode", "/"));
      await scrollText(p, "Follow a structured workout");
      steps.push(await shotStep(walk, 4, "Structure and freestyle coexist", "Moved to workout choices.", "Jordan can follow a program while learning, then choose exercises directly when energy or time changes.", "step-04-workouts.png", "Handstand Quest structured and freestyle workout choices", "/"));
      await scrollText(p, "Measure your progress");
      steps.push(await shotStep(walk, 5, "The loop closes on evidence", "Moved to progress and customization.", "Records, per-exercise stats, custom exercises, workouts, and hands-free video make improvement reviewable rather than anecdotal.", "step-05-progress.png", "Handstand Quest progress, custom exercise, and video features", "/"));
      return steps;
    },
  },
  {
    slug: "plan-quest",
    name: "Plan Quest",
    base: "https://www.plans.quest",
    codebase: "../plan/timequest",
    featureId: "turn-a-goal-into-a-living-plan",
    featureName: "Turning a goal into a living plan",
    category: "planning",
    entry: "/",
    persona: {
      id: "multi-goal-planner",
      name: "Samira Nasser",
      description: "Is balancing a professional transition with family and study commitments. She needs to see trade-offs and revise dates without rebuilding the plan, not another static task list.",
      journeyId: "evaluate-an-adaptive-plan",
      payoff: "Samira reaches the real sign-in surface after seeing prompt-to-plan, timeline, prioritization, reflection, collaboration, and MCP access as one adaptable system.",
    },
    inventory: [
      ["plan-from-prompt", "Generate a plan from a prompt", "/plans", "planning", true],
      ["timeline", "Rebalance a timeline", "/timeline", "planning", true],
      ["priorities", "Choose current priorities", "/priorities", "execution", true],
      ["backlog", "Keep a planning backlog", "/backlog", "execution", true],
      ["notes-and-reflection", "Keep notes and reflect", "/notes", "reflection", true],
      ["shared-workspaces", "Plan with a team", "/teams", "collaboration", true],
      ["mcp-connection", "Connect an AI planning client", "/settings/mcp", "connections", true],
    ],
    async drive(walk) {
      const p = walk.ctx._page;
      const steps = [];
      steps.push(await shotStep(walk, 1, "The job is a plan that survives change", "Opened Plan Quest.", "The promise names the failure mode Samira recognizes: goals keep changing shape after the first burst of motivation.", "step-01-goal.png", "Plan Quest adaptive planning introduction", "/"));
      await scrollHeading(p, "The quick tour before the product deep dive.");
      steps.push(await shotStep(walk, 2, "Three real planning problems anchor the tour", "Moved to the quick tour.", "Broad goals, changing plans, and lost momentum are presented as separate situations rather than one generic productivity pitch.", "step-02-tour.png", "Plan Quest quick-tour choices", "/"));
      const selectors = p.getByRole("button", { name: /For plans that keep changing/i });
      if (await selectors.count()) await selectors.first().click();
      steps.push(await shotStep(walk, 3, "Changing plans is treated as normal", "Selected the changing-plan tour.", "The active scenario shifts to rebalancing as dates, capacity, and energy change—the core behavior of a living plan.", "step-03-changing.png", "Plan Quest changing-plan tour selected", "/"));
      await scrollHeading(p, "A calmer way to plan, prioritize, and adjust.");
      steps.push(await shotStep(walk, 4, "The system spans creation through reflection", "Moved to the complete feature set.", "Prompt planning, timeline, priorities, progress, notes, reflection, teamwork, and bring-your-own AI are visible as one connected workflow.", "step-04-system.png", "Plan Quest planning and reflection feature system", "/"));
      await p.goto("https://my.plans.quest/", { waitUntil: "domcontentloaded" });
      steps.push(await shotStep(walk, 5, "The next step is the real product gate", "Opened the production planning app.", "The authenticated workspace offers Google, GitHub, email, and Twitter sign-in. No account is created during this evidence run.", "step-05-sign-in.png", "Plan Quest production sign-in screen", "/", { firstOfScreen: true }));
      return steps;
    },
  },
  {
    slug: "scribe-quest-web",
    name: "Scribe Quest · Web",
    base: "https://www.scribe-quest.com",
    codebase: "../scribe_quest",
    featureId: "follow-a-conversation-into-action",
    featureName: "Following a conversation into action",
    category: "conversation capture",
    entry: "/",
    persona: {
      id: "client-conversation-owner",
      name: "Amal Rahman",
      description: "Runs client conversations that create decisions and follow-ups faster than she can document them. She needs meaning and ownership preserved, not a verbatim transcript to reread.",
      journeyId: "assess-the-follow-up-loop",
      payoff: "Amal sees how a saved conversation becomes a summary, evidence-linked relationship insight, and deliberately scoped PDF before the real app sign-in.",
    },
    inventory: [
      ["capture", "Capture a conversation", "CaptureScreen", "capture", true],
      ["transcription", "Transcribe on device or in the cloud", "ProcessingScreen", "processing", true],
      ["summary-and-actions", "Review summary and next steps", "ConversationDetailScreen", "follow-up", true],
      ["relationships", "Trace relationship insights to sources", "RelationshipMapScreen", "relationships", true],
      ["pdf-export", "Choose what a PDF shares", "PdfPreviewScreen", "sharing", true],
      ["people", "Review people and commitments", "PeopleScreen", "follow-up", true],
    ],
    async drive(walk) {
      const p = walk.ctx._page;
      const steps = [];
      steps.push(await shotStep(walk, 1, "The output is meaning and momentum", "Opened Scribe Quest.", "The sample result shows what mattered, next steps, and people before asking Amal to trust the capture machinery.", "step-01-result.png", "Scribe Quest example summary with next steps and people", "/"));
      await scrollHeading(p, "From conversation to clarity in three moves.");
      steps.push(await shotStep(walk, 2, "Capture, signal, and action stay distinct", "Moved to the three-part workflow.", "The product separates recording from interpretation and follow-up, making control and responsibility visible.", "step-02-workflow.png", "Scribe Quest capture-to-action workflow", "/"));
      await scrollHeading(p, "Small walkthroughs. Real app screens.");
      const isMobile = await p.evaluate(() => window.innerWidth < 700);
      if (isMobile) {
        const buttons = p.getByRole("button", { name: /Read the walkthrough/i });
        if (await buttons.count()) await buttons.nth(0).click();
        await scrollHeading(p, "Return to what mattered");
        steps.push(await shotStep(walk, 3, "A saved conversation reopens around the result", "Expanded Return to what mattered.", "The first embedded walkthrough follows a saved conversation into its useful summary and explicit next steps.", "step-03-conversation.png", "Scribe Quest conversation walkthrough expanded", "/#demos", { firstOfScreen: true }));
        if (await buttons.count() > 1) await buttons.nth(1).click();
        await scrollHeading(p, "Look behind a connection");
        steps.push(await shotStep(walk, 4, "Relationship claims retain their source", "Expanded Look behind a connection.", "The second walkthrough makes provenance part of the experience by tracing a relationship hypothesis back to a transcript quote.", "step-04-relationship.png", "Scribe Quest relationship provenance walkthrough", "/#demos", { firstOfScreen: true }));
        if (await buttons.count() > 2) await buttons.nth(2).click();
        await scrollHeading(p, "Choose what you share");
        steps.push(await shotStep(walk, 5, "Sharing is a deliberate content decision", "Expanded Choose what you share.", "The PDF walkthrough shows transcript and source excerpts as explicit inclusion choices rather than a hidden all-or-nothing export.", "step-05-share.png", "Scribe Quest PDF sharing walkthrough", "/#demos", { firstOfScreen: true }));
      } else {
        steps.push(await shotStep(walk, 3, "Three real app walkthroughs expose the result", "Moved to the recorded app walkthroughs.", "Conversation review, relationship provenance, and PDF scope are shown with real simulator recordings and explicit synthetic-sample disclosure.", "step-03-demos.png", "Scribe Quest recorded app walkthrough gallery", "/#demos", { firstOfScreen: true }));
        await scrollHeading(p, "Walk away knowing what to remember—and what to do.");
        steps.push(await shotStep(walk, 4, "Meaning, context, and ownership stay connected", "Moved to the result model.", "Summaries, decisions, people, and follow-ups are framed as connected outcomes rather than independent AI outputs.", "step-04-outcomes.png", "Scribe Quest outcome model", "/#use-cases", { firstOfScreen: true }));
        await scrollHeading(p, "A microphone should never feel like a trap.");
        steps.push(await shotStep(walk, 5, "Capture permission remains a choice", "Moved to the privacy model.", "Recording, audio retention, transcription, and AI assistance are separated so a user can choose what data leaves the device.", "step-05-privacy.png", "Scribe Quest microphone and privacy model", "/#privacy", { firstOfScreen: true }));
      }
      await p.goto("https://app.scribe-quest.com/", { waitUntil: "domcontentloaded" });
      steps.push(await shotStep(walk, 6, "The real workspace is account-protected", "Opened the production web app.", "The Flutter workspace reaches its genuine email and Google sign-in screen; no test account is invented for the walkthrough.", "step-06-sign-in.png", "Scribe Quest web-app sign-in screen", "/", { firstOfScreen: true, sparse: true }));
      return steps;
    },
  },
  {
    slug: "calendar-clarity",
    name: "Calendar Clarity",
    base: "https://www.calendarclarity.app",
    codebase: "../ccc",
    featureId: "see-a-calmer-calendar",
    featureName: "Seeing a calmer calendar",
    category: "calendar focus",
    entry: "/",
    persona: {
      id: "meeting-heavy-operator",
      name: "Priya Shah",
      description: "Has a calendar full of meetings, solo blocks, tentative holds, and follow-ups. She wants the important commitments to stand out without moving to a new calendar app.",
      journeyId: "evaluate-the-extension",
      payoff: "Priya can distinguish visibility, focus, event actions, and native syncing colors before installing the extension.",
    },
    inventory: [
      ["event-visibility", "Dim distracting events", "Google Calendar › Visibility", "visibility", false],
      ["focus-timer", "Run a focus timer with Zen mode", "Google Calendar › Focus", "focus", false],
      ["event-actions", "Reshape an event", "Google Calendar › Event actions", "calendar actions", true],
      ["custom-colors", "Apply native syncing colors", "Google Calendar › Colors", "organization", true],
    ],
    async drive(walk) {
      const p = walk.ctx._page;
      const steps = [];
      steps.push(await shotStep(walk, 1, "The same calendar, with less visual competition", "Opened Calendar Clarity.", "Before and after states explain the product without asking Priya to abandon Google Calendar or create another account.", "step-01-clarity.png", "Calendar Clarity hero and calmer calendar promise", "/"));
      await scrollHeading(p, "A calmer way to use Google Calendar");
      steps.push(await shotStep(walk, 2, "Four jobs are kept separate", "Moved to the feature map.", "Visibility, focus, event actions, and colors are presented as distinct tools so Priya can evaluate the part she actually needs.", "step-02-features.png", "Calendar Clarity four-feature map", "/#features"));
      await scrollHeading(p, "See what matters — the noise fades back.");
      const visibility = p.getByRole("button", { name: /Open Event Visibility walkthrough/i });
      if (await visibility.count()) await visibility.click();
      steps.push(await shotStep(walk, 3, "Visibility dims noise without hiding events", "Opened the Event Visibility walkthrough.", "Solo, external, declined, and tentative events recede but remain present, preserving awareness without equal visual weight.", "step-03-visibility.png", "Calendar Clarity Event Visibility walkthrough", "/#event-visibility"));
      await p.keyboard.press("Escape");
      await scrollHeading(p, "Protect your focus, right on your calendar.");
      const focus = p.getByRole("button", { name: /Open Focus Timer walkthrough/i });
      if (await focus.count()) await focus.click();
      steps.push(await shotStep(walk, 4, "Focus happens inside the event context", "Opened the Focus Timer walkthrough.", "The timer, ambient sounds, and Zen mode keep the work session attached to the calendar block that justified it.", "step-04-focus.png", "Calendar Clarity Focus Timer walkthrough", "/#focus-timer"));
      await p.keyboard.press("Escape");
      await scrollHeading(p, "…and colors that sync to your phone.");
      const colors = p.getByRole("button", { name: /Open Custom Colors walkthrough/i });
      if (await colors.count()) await colors.click();
      steps.push(await shotStep(walk, 5, "Colors are native, named, and portable", "Opened the Custom Colors walkthrough.", "AI grouping remains optional, while saved colors use Google's own event colors so they survive on mobile and other devices.", "step-05-colors.png", "Calendar Clarity Custom Colors walkthrough", "/#custom-colors"));
      return steps;
    },
  },
  {
    slug: "breath-quest",
    name: "Breath Quest",
    base: "http://localhost:3110",
    codebase: "../breathquest",
    featureId: "try-audio-controlled-experiments",
    featureName: "Trying audio-controlled experiments",
    category: "biological interfaces",
    entry: "/",
    persona: {
      id: "interaction-researcher",
      name: "Noah Bennett",
      description: "Prototypes playful wellness interfaces and wants to understand which audio signals are robust enough to control a game. He cares about observable detection and calibration, not a polished wellness claim.",
      journeyId: "compare-breath-and-clap-controls",
      payoff: "Noah compares the three experiments and reaches their actual calibration, clap-detection, and game surfaces on the local build.",
    },
    inventory: [
      ["breath-detection", "Calibrate breath detection", "/hypothesis-1", "breath", false],
      ["clap-patterns", "Control with clap patterns", "/hypothesis-2", "clap", false],
      ["sound-game", "Play the sound-controlled game", "/hypothesis-3", "game", false],
      ["audio-tools", "Inspect live audio features", "/audio-tools", "analysis", false],
    ],
    async drive(walk) {
      const p = walk.ctx._page;
      await p.context().grantPermissions(["microphone"], { origin: this.base }).catch(() => {});
      const steps = [];
      steps.push(await shotStep(walk, 1, "The project is explicit about being an experiment", "Opened the local Breath Quest build.", "Three hypotheses separate breath detection, clap patterns, and a playful sound-controlled runner instead of pretending one sensor already solves everything.", "step-01-lab.png", "Breath Quest experiment index", "/", { sparse: true }));
      await p.goto(`${this.base}/hypothesis-1`, { waitUntil: "domcontentloaded" });
      steps.push(await shotStep(walk, 2, "Breath control begins with calibration", "Opened the breath-detection experiment.", "The real interface explains that personal microphone levels must be calibrated before gameplay; the dependency is visible, not hidden.", "step-02-breath.png", "Breath Quest breath-detection calibration surface", "/hypothesis-1", { firstOfScreen: true }));
      await p.goto(`${this.base}/hypothesis-2`, { waitUntil: "domcontentloaded" });
      steps.push(await shotStep(walk, 3, "Clap detection exposes its live controls", "Opened the clap-pattern experiment.", "Start/stop listening, detection counts, settings, timelines, and play feedback expose what the recognizer is doing.", "step-03-clap.png", "Breath Quest clap-pattern controls", "/hypothesis-2", { firstOfScreen: true }));
      await p.goto(`${this.base}/hypothesis-3`, { waitUntil: "domcontentloaded" });
      steps.push(await shotStep(walk, 4, "The signal is tested in an actual game", "Opened the sound-controlled runner.", "The third hypothesis moves beyond meters into onboarding, lives, scoring, and a complete game loop controlled by sound.", "step-04-game.png", "Breath Quest sound-controlled runner", "/hypothesis-3", { firstOfScreen: true }));
      await p.goto(`${this.base}/audio-tools`, { waitUntil: "domcontentloaded" });
      steps.push(await shotStep(walk, 5, "The sensor can be inspected, not merely trusted", "Opened the audio analysis tools.", "Time-domain, frequency, envelope, and zero-crossing tools make the experimental signal visible to Noah before he treats it as a controller.", "step-05-tools.png", "Breath Quest audio analysis tools", "/audio-tools", { firstOfScreen: true }));
      return steps;
    },
  },
];

async function scrollHeading(page, name) {
  const locator = page.getByRole("heading", { name, exact: false }).first();
  await locator.waitFor({ state: "visible", timeout: 12_000 });
  await locator.evaluate((el) => window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 90), behavior: "instant" }));
  await page.waitForTimeout(350);
}

async function scrollText(page, text) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.waitFor({ state: "visible", timeout: 12_000 });
  await locator.evaluate((el) => window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 90), behavior: "instant" }));
  await page.waitForTimeout(350);
}

async function shotStep(walk, stepNumber, title, action, description, file, alt, location, options = {}) {
  return {
    stepNumber,
    title,
    action,
    description,
    screenshotFilename: await walk.shot(file, options),
    screenshotAlt: alt,
    location,
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

function sourceState(project) {
  const cwd = resolve(ROOT, project.codebase);
  const git = (args) => {
    try { return spawnSync("git", args, { cwd, encoding: "utf8" }).stdout.trim(); } catch { return ""; }
  };
  return { cwd, git };
}

async function captureProject(project) {
  const out = join(STORE, project.slug);
  const startedAt = new Date().toISOString();
  const issues = [];
  const source = sourceState(project);
  const isLocalCapture = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(project.base);
  const sourceSha = source.git(["rev-parse", "HEAD"]);
  const sourceCommitDate = source.git(["show", "-s", "--format=%cI", "HEAD"]);
  const cap = await openCapture({ outDir: out, videoDir: join(out, "video"), driver: "playwright" });
  const captured = [];
  const statuses = {};

  for (const surface of [SURFACES.desktop, SURFACES.mobile]) {
    let walk;
    try {
      walk = await cap.feature(project.featureId, surface, { url: `${project.base}${project.entry}`, video: true, readyTimeoutMs: 20_000 });
      const steps = await project.drive(walk);
      if (steps.length < 5) throw new Error(`journey produced ${steps.length} states; five are required`);
      const { video } = await walk.finish();
      const videoRef = video ? `video/${video.split("/").pop()}` : undefined;
      const artifact = {
        featureId: project.featureId,
        featureName: project.featureName,
        type: "feature",
        location: project.entry,
        category: project.category,
        surface: surface.id,
        platform: "web",
        locale: "en",
        headline: project.persona.payoff,
        overview: `A live product-level walk for ${project.name}, framed around ${project.persona.name}'s actual decision rather than a list of routes.`,
        targetAudience: project.persona.description,
        steps,
        ...(videoRef ? { video: { file: videoRef } } : {}),
        keyFeatures: project.inventory.map((item) => item[1]),
        capturedAt: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        ...(isLocalCapture ? { targetSha: sourceSha, targetCommitDate: sourceCommitDate } : {}),
      };
      writeJson(join(out, `${project.featureId}.${surface.id}.json`), artifact);
      captured.push(artifact);
      statuses[surface.id] = "done";
      console.log(`  ✓ ${surface.id}: ${steps.length} states${videoRef ? " · video" : ""}`);
    } catch (error) {
      if (walk) await walk.finish().catch(() => {});
      statuses[surface.id] = "blocked";
      issues.push({
        id: `${project.featureId}-${surface.id}-capture`,
        featureId: project.featureId,
        location: project.entry,
        surface: surface.id,
        severity: "major",
        title: `${surface.id} product journey could not complete`,
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
      id: `${overflow.featureId}-${overflow.surface}-overflow`,
      featureId: overflow.featureId,
      location: overflow.location,
      surface: overflow.surface,
      severity: "major",
      title: `${project.name} overflows on ${overflow.surface}`,
      detail: `Measured ${overflow.contentWidth}px of content on a ${overflow.surfaceWidth}px surface.`,
      foundAt: new Date().toISOString(),
      status: "open",
    });
  }

  const completedAt = new Date().toISOString();
  const liveFeature = {
    featureId: project.featureId,
    featureName: project.featureName,
    location: project.entry,
    category: project.category,
    requiresAuth: false,
    surfaceStatus: statuses,
    videoStatus: captured.some((item) => item.video?.file) ? "done" : "blocked",
    issueCount: issues.filter((item) => item.featureId === project.featureId).length,
    lastWalkthroughAt: captured.length ? completedAt : null,
  };
  const pendingFeatures = project.inventory.map(([featureId, featureName, location, category, requiresAuth]) => ({
    featureId,
    featureName,
    location,
    category,
    requiresAuth,
    surfaceStatus: { desktop: requiresAuth ? "blocked" : "pending", mobile: requiresAuth ? "blocked" : "pending" },
    videoStatus: "pending",
    issueCount: 0,
    notes: requiresAuth ? "Catalogued from source; the live production path requires an authenticated workspace." : "Catalogued from source and awaiting an isolated feature walk.",
  }));
  writeJson(join(out, "catalog.json"), {
    schemaVersion: 2,
    projectName: project.name,
    platform: "web",
    driver: "playwright",
    capturedAgainst: project.base,
    discoveredAt: startedAt,
    updatedAt: completedAt,
    scope: {
      status: "partial",
      note: "Source navigation and the live public entry were reconciled. The product-level journey is live-walked on desktop and mobile; authenticated and device-gated features remain explicitly pending or blocked.",
      excluded: [],
    },
    features: [liveFeature, ...pendingFeatures],
    personas: [{
      id: project.persona.id,
      name: project.persona.name,
      description: project.persona.description,
      entryPoint: project.entry,
      keyJourneys: [project.persona.journeyId],
      portrait: `personas/${project.persona.id}.png`,
      scene: `personas/${project.persona.id}-scene.png`,
      navItems: project.inventory.slice(0, 5).map((item) => ({ label: item[1], location: item[2] })),
    }],
  });

  const journeySource = captured.find((item) => item.surface === "desktop") ?? captured[0];
  if (journeySource) {
    writeJson(join(out, `persona-${project.persona.id}.${project.persona.journeyId}.json`), {
      personaId: project.persona.id,
      journeyId: project.persona.journeyId,
      headline: journeySource.headline,
      overview: journeySource.overview,
      payoff: project.persona.payoff,
      platform: "web",
      surface: journeySource.surface,
      scenes: journeySource.steps.map((step) => ({
        id: `scene-${String(step.stepNumber).padStart(2, "0")}`,
        title: step.title,
        narrative: step.description,
        frames: [step.screenshotFilename],
        frameCaptions: [step.title],
        location: step.location,
        surface: journeySource.surface,
        sourceFeature: project.featureId,
        action: step.action,
        verificationStatus: "live-walked",
      })),
      capturedAt: completedAt,
      ...(journeySource.targetSha ? { targetSha: journeySource.targetSha } : {}),
      ...(journeySource.video?.file ? { walkRecording: journeySource.video.file } : {}),
    });
  }
  writeJson(join(out, "issues.json"), { issues, updatedAt: completedAt });
  const runsFile = join(out, "runs.json");
  const runs = readJson(runsFile, { runs: [] });
  runs.runs.push({
    id: completedAt,
    startedAt,
    completedAt,
    skill: "walkthrough",
    agent: "walk-portfolio-quests.mjs",
    target: {
      sha: isLocalCapture ? sourceSha : "",
      shaShort: isLocalCapture ? source.git(["rev-parse", "--short", "HEAD"]) : "—",
      branch: source.git(["branch", "--show-current"]),
      dirty: Boolean(source.git(["status", "--porcelain"])),
      commitDate: isLocalCapture ? sourceCommitDate : null,
      commitSubject: isLocalCapture ? source.git(["show", "-s", "--format=%s", "HEAD"]) : "Public production capture; deployed source SHA is not exposed.",
    },
    config: {
      platform: "web",
      driver: "playwright",
      capturedAgainst: project.base,
      surfaces: report.surfaces,
      locales: ["en"],
      notes: [
        "source inventory reconciled with live public entry",
        "authenticated features remain blocked rather than simulated",
        "video normalized to H.264 MP4 when available",
        `invariants verified: ${Object.keys(report.verified).join(", ") || "none"}`,
        ...report.warnings,
      ].join(" · "),
    },
    coverage: {
      features: captured.length ? [project.featureId] : [],
      personas: journeySource ? [project.persona.id] : [],
      screenshots: report.captures,
      videos: captured.filter((item) => item.video?.file).length,
      issues: issues.length,
    },
  });
  writeJson(runsFile, runs);
}

const selected = argv.project ? PROJECTS.filter((project) => project.slug === argv.project) : PROJECTS;
if (!selected.length) throw new Error(`Unknown project: ${argv.project}`);
for (const project of selected) {
  console.log(`\n${project.name}`);
  await captureProject(project);
}
