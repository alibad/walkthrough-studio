#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openCapture, SURFACES } from "./lib/capture/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TARGET = resolve(ROOT, "..", "done_os");
const OUT = resolve(ROOT, "apps/hub/public/walkthroughs/doneos");
const BASE = process.env.DONEOS_PREVIEW_URL ?? "http://127.0.0.1:5322";
const startedAt = new Date().toISOString();

const FEATURES = [
  {
    id: "focus-stack",
    name: "Focus Stack",
    screen: "focus",
    headline: "Three commitments, with everything else waiting",
    overview:
      "Focus is the execution boundary: active human and agent commitments share one stack, a visible WIP limit, and explicit ownership.",
  },
  {
    id: "shared-queue",
    name: "Shared Queue",
    screen: "queue",
    headline: "One ordered queue for people and agents",
    overview:
      "Queue places human and agent work in one priority order, with ownership and urgency visible before anybody claims the next item.",
  },
  {
    id: "activity-ledger",
    name: "Activity Ledger",
    screen: "activity",
    headline: "Every meaningful transition leaves a trace",
    overview:
      "Activity is the accountability layer: completions, claims, blocks, reviews, and external updates remain attributable after the work moves on.",
  },
  {
    id: "slack-status",
    name: "Slack Status",
    screen: "slack",
    headline: "Execution becomes a daily status automatically",
    overview:
      "The Slack view turns the execution ledger into a scheduled team update rather than asking somebody to reconstruct the day from memory.",
  },
  {
    id: "goal-progress",
    name: "Goal Progress",
    screen: "goals",
    headline: "Tasks stay separate while outcomes stay visible",
    overview:
      "Goals summarize progress, active work, and blockers without embedding the task system inside the outcome itself.",
  },
];

function writeJson(name, value) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);
}

function git(args) {
  return execFileSync("git", ["-C", TARGET, ...args], { encoding: "utf8" }).trim();
}

const cap = await openCapture({ outDir: OUT, videoDir: join(OUT, "video"), driver: "playwright" });
const results = [];

for (const feature of FEATURES) {
  for (const surface of [SURFACES.desktop, SURFACES.mobile]) {
    const walk = await cap.feature(feature.id, surface, {
      url: `${BASE}/?screen=${feature.screen}`,
      pinClock: false,
      video: feature.id === "focus-stack" && surface.id === "mobile",
    });
    const page = walk.ctx._page;
    const semantics = page.locator("flt-semantics-placeholder");
    if (await semantics.count()) await semantics.press("Enter");
    await page.waitForTimeout(500);
    const rendered = await page.locator("flt-glass-pane, flutter-view").count();
    if (!rendered) throw new Error(`Flutter did not render ${feature.name} on ${surface.id}`);

    const steps = [
      {
        stepNumber: 1,
        title: `${feature.name}, ready`,
        action: `Opened the committed DoneOS store-preview harness with screen=${feature.screen}.`,
        description: feature.overview,
        screenshotFilename: await walk.shot("step-01-ready.png", { firstOfScreen: true }),
        screenshotAlt: `${feature.name} in the DoneOS Flutter product on ${surface.label}`,
        location: `DoneOS → ${feature.name}`,
        verificationStatus: "live-walked",
      },
    ];

    if (surface.id === "mobile") {
      await walk.ctx.evaluate("window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })");
      await walk.ctx.settle();
      const detail = await walk.shot("step-02-detail.png", { optional: true });
      if (detail) {
        steps.push({
          stepNumber: 2,
          title: "The detail survives the phone surface",
          action: "Scrolled to the end of the Flutter view on the mobile browser surface.",
          description:
            "The lower controls and final records remain readable inside the product's compact navigation, rather than being clipped below a desktop-only layout.",
          screenshotFilename: detail,
          screenshotAlt: `${feature.name} after scrolling on the compact DoneOS surface`,
          location: `DoneOS → ${feature.name}`,
          verificationStatus: "live-walked",
        });
      }
    }

    const finished = await walk.finish();
    if (finished.video && steps.length) {
      steps[steps.length - 1].videoFilename = `video/${finished.video.split("/").pop()}`;
    }

    const payload = {
      featureId: feature.id,
      featureName: feature.name,
      type: "feature",
      location: `DoneOS → ${feature.name}`,
      category: "product",
      surface: surface.id,
      platform: "web",
      locale: "en",
      headline: feature.headline,
      overview: feature.overview,
      targetAudience: "Operators coordinating accountable human and agent execution",
      steps,
      keyFeatures: [feature.headline],
      note:
        "Live-rendered from DoneOS's committed store-preview entry point with fictional showcase data. This proves the Flutter product surface, not a production account or a signed iOS/Android store binary.",
      generatedAt: new Date().toISOString(),
      capturedAt: new Date().toISOString(),
    };
    writeJson(`${feature.id}.${surface.id}.json`, payload);
    results.push(payload);
  }
}

const journeyFrames = [
  ["focus-stack", "mobile", "step-01-ready.png"],
  ["shared-queue", "mobile", "step-01-ready.png"],
  ["goal-progress", "desktop", "step-01-ready.png"],
  ["activity-ledger", "desktop", "step-01-ready.png"],
  ["slack-status", "mobile", "step-01-ready.png"],
];
const scenes = [
  {
    id: "morning-focus",
    title: "Maya starts with three commitments",
    narrative:
      "Maya is coordinating a product launch with two people and two agents. She opens Focus first because she does not need another backlog; she needs to know what is allowed to move now.",
  },
  {
    id: "choose-next",
    title: "The next work is already ordered",
    narrative:
      "A reviewer account, an observability spec, and a permissions map are already ranked together. Agent work does not live in a separate console that Maya has to remember to check.",
  },
  {
    id: "check-outcomes",
    title: "Tasks still point to outcomes",
    narrative:
      "Before assigning more work, Maya checks the goals. The launch is 72 percent complete, one item is blocked, and the execution loop still has room to prove itself.",
  },
  {
    id: "audit-agents",
    title: "Agent work leaves names behind",
    narrative:
      "The ledger shows who claimed a contract test, who blocked a release check, and who moved artwork to review. Maya can reconstruct the day without asking every actor for a status.",
  },
  {
    id: "share-status",
    title: "The team gets the same truth",
    narrative:
      "DoneOS turns that ledger into the scheduled Slack update. Maya leaves with one status source instead of a message assembled from tabs, memory, and private agent logs.",
  },
].map((scene, index) => {
  const [featureId, surface, filename] = journeyFrames[index];
  return {
    ...scene,
    frames: [`${featureId}/${surface}/${filename}`],
    frameCaptions: [scene.title],
    location: `DoneOS → ${FEATURES.find((item) => item.id === featureId)?.name}`,
    surface,
    sourceFeature: featureId,
    verificationStatus: "live-walked",
  };
});

writeJson("persona-execution-lead.coordinate-launch.json", {
  personaId: "execution-lead",
  journeyId: "coordinate-launch",
  headline: "From a crowded launch day to one accountable execution story",
  overview:
    "Maya runs a launch where people and agents work side by side. DoneOS gives her one focus boundary, one queue, one outcome view, one ledger, and one team status.",
  payoff: "Maya shares a launch status she can trace back to the work, actor, and blocker behind every line.",
  platform: "web",
  surface: "desktop",
  scenes,
  capturedAt: new Date().toISOString(),
});

const existingCatalog = JSON.parse(readFileSync(join(OUT, "catalog.json"), "utf8"));
const existingById = new Map(existingCatalog.features.map((feature) => [feature.featureId, feature]));
for (const feature of FEATURES) {
  existingById.set(feature.id, {
    featureId: feature.id,
    featureName: feature.name,
    location: `DoneOS → ${feature.name}`,
    category: "product",
    requiresAuth: false,
    surfaceStatus: { desktop: "done", mobile: "done" },
    videoStatus: feature.id === "focus-stack" ? "done" : "pending",
    issueCount: 0,
    lastWalkthroughAt: new Date().toISOString(),
    notes: "Committed Flutter store-preview surface with synthetic showcase data.",
  });
}
writeJson("catalog.json", {
  ...existingCatalog,
  schemaVersion: 2,
  platform: "web",
  driver: "playwright",
  capturedAgainst: `${BASE} · committed Flutter store-preview harness`,
  updatedAt: new Date().toISOString(),
  scope: {
    status: "partial",
    note:
      "Core execution, goals, status, and audit surfaces are live-rendered from committed Flutter code on desktop and compact web surfaces. The MCP loop is independently proven. Groups, Account, and signed native store binaries remain outside this run.",
    excluded: ["Groups", "Account", "Signed iOS binary", "Signed Android binary"],
  },
  features: [...existingById.values()],
  personas: [
    {
      id: "execution-lead",
      name: "Maya Torres",
      description:
        "Maya is coordinating a product launch where people and agents share the work. She needs one answer to what is moving, what is blocked, and who changed it. She does not care which client or model performed the action once accountability is preserved.",
      authRole: "member",
      entryPoint: "DoneOS → Focus Stack",
      keyJourneys: ["coordinate-launch"],
      navItems: FEATURES.map((feature) => ({ label: feature.name, location: `DoneOS → ${feature.name}` })),
    },
  ],
});

const runsPath = join(OUT, "runs.json");
const runs = existsSync(runsPath) ? JSON.parse(readFileSync(runsPath, "utf8")) : { runs: [] };
const sha = git(["rev-parse", "HEAD"]);
runs.runs.push({
  id: new Date().toISOString(),
  startedAt,
  completedAt: new Date().toISOString(),
  skill: "walkthrough",
  agent: "walk-doneos-product.mjs",
  target: {
    sha,
    shaShort: sha.slice(0, 8),
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    dirty: Boolean(git(["status", "--porcelain"])),
    commitDate: git(["log", "-1", "--format=%aI"]),
    commitSubject: git(["log", "-1", "--format=%s"]),
    watchPath: ".",
  },
  config: {
    platform: "web",
    driver: "Playwright + Flutter store-preview harness",
    capturedAgainst: BASE,
    env: { data: "fictional committed preview data", productionAuth: "none" },
    surfaces: ["desktop", "mobile"],
    locales: ["en"],
    notes: "Core product story only; no production account or native binary was used.",
  },
  coverage: {
    features: FEATURES.map((feature) => feature.id),
    personas: ["execution-lead"],
    screenshots: results.reduce((sum, result) => sum + result.steps.length, 0),
    videos: results.flatMap((result) => result.steps).filter((step) => step.videoFilename).length,
    issues: 0,
  },
});
writeJson("runs.json", runs);

const report = cap.report();
await cap.close();
console.log(`DoneOS: ${report.captures} captures across ${FEATURES.length} product surfaces and one persona journey.`);
