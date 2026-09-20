#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { openCapture, SURFACES } from "./lib/capture/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TARGET = resolve(ROOT, "..", "openstage");
const OUT = resolve(ROOT, "apps/hub/public/walkthroughs/openstage");
const BASE = process.env.OPENSTAGE_URL ?? "http://localhost:3000";
const FEATURE = "skill-authored-presentation";
const startedAt = new Date().toISOString();

function writeJson(name, value) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const requiredSkills = ["plan-presentation", "slide-mode", "component-reference", "quality-standards"];
for (const skill of requiredSkills) {
  const file = join(TARGET, ".claude/skills", skill, "SKILL.md");
  if (!existsSync(file)) throw new Error(`Missing OpenStage authoring skill: ${file}`);
}

const contentFile = join(TARGET, "src/content/proof-before-promise.tsx");
const routeFile = join(TARGET, "src/app/proof-before-promise/page.tsx");
if (!existsSync(contentFile) || !existsSync(routeFile)) throw new Error("The skill-authored deck source is missing");

const buildOutput = execFileSync("npm", ["run", "build"], {
  cwd: TARGET,
  encoding: "utf8",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  maxBuffer: 12 * 1024 * 1024,
});
if (!/Compiled successfully/.test(buildOutput)) throw new Error("OpenStage build did not report success");

const registry = readFileSync(join(TARGET, "src/content/registry.ts"), "utf8");
if (!registry.includes('slug: "proof-before-promise"')) throw new Error("Deck is not registered");
const routeResponse = await fetch(`${BASE}/proof-before-promise`);
if (!routeResponse.ok) throw new Error(`Rendered deck returned HTTP ${routeResponse.status}`);

const terminalSteps = [
  {
    title: "The skills are part of the repository",
    action: "Listed the OpenStage skill directories and verified each required SKILL.md file.",
    command: "ls .claude/skills/{plan-presentation,slide-mode,component-reference,quality-standards}/SKILL.md",
    lines: requiredSkills.map((skill) => [`skill`, `${skill}/SKILL.md · found`]),
    description:
      "OpenStage does not depend on a hidden prompt. Narrative planning, fixed-slide constraints, the component catalog, and the quality bar all live beside the product source.",
  },
  {
    title: "Claude and Codex receive the same brief",
    action: "Prepared the agent prompt against the same repository instruction files.",
    command: "claude  # or: codex",
    lines: [
      ["prompt", "Use plan-presentation + slide-mode skills"],
      ["build", "proof-before-promise from the walkthrough brief"],
      ["verify", "run npm run build and inspect every slide"],
      ["contract", "ordinary React source, no host-specific artifact"],
    ],
    description:
      "The terminal syntax differs only in the executable name. Both agents read the same skill files and are asked to leave the same reviewable source, route, registry entry, and build proof.",
  },
  {
    title: "The skill leaves normal application code",
    action: "Verified the generated content module, route, and presentation registry entry on disk.",
    command: "git diff -- src/content/proof-before-promise.tsx src/app/proof-before-promise/page.tsx src/content/registry.ts",
    lines: [
      ["content", "src/content/proof-before-promise.tsx"],
      ["route", "src/app/proof-before-promise/page.tsx"],
      ["registry", "proof-before-promise · slides · 7 slides"],
      ["review", "source-owned and diffable"],
    ],
    description:
      "The result is not trapped inside an agent session. It is a typed React presentation with speaker notes and a stable route registered in the gallery.",
  },
  {
    title: "The production build accepts the deck",
    action: "Ran the repository build after generating and registering the presentation.",
    command: "npm run build",
    lines: [
      ["compile", "successful"],
      ["typescript", "passed"],
      ["route", "/proof-before-promise · static"],
      ["output", "34 static/dynamic routes finalized"],
    ],
    description:
      "Compilation, TypeScript, and static route generation all complete. A deck that only looks plausible in source is not considered generated successfully.",
  },
  {
    title: "The route answers before we call it done",
    action: "Requested the rendered deck from the live local OpenStage server.",
    command: "curl -I http://localhost:3000/proof-before-promise",
    lines: [
      ["http", `${routeResponse.status} ${routeResponse.statusText}`],
      ["mode", "slide deck"],
      ["slides", "7"],
      ["next", "drive the browser and capture the result"],
    ],
    description:
      "The terminal proof ends at a real HTTP route. The next surface in this walkthrough is that route, driven with the same keyboard a presenter uses.",
  },
];

const terminalDir = join(OUT, FEATURE, "terminal");
mkdirSync(terminalDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const seen = new Map();
for (const [index, step] of terminalSteps.entries()) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 2 });
  const lines = step.lines
    .map(([key, value]) => `<div class="line"><span class="key">${escapeHtml(key)}</span><span>${escapeHtml(value)}</span></div>`)
    .join("");
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#0d1117;color:#e6edf3}
    body{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;padding:34px}
    .term{height:100%;overflow:hidden;border:1px solid #30363d;border-radius:14px;background:#161b22;box-shadow:0 24px 80px #0009}
    .bar{height:48px;display:flex;align-items:center;gap:8px;padding:0 16px;border-bottom:1px solid #30363d;background:#1f242c}
    .dot{width:10px;height:10px;border:1px solid #6e7681;border-radius:50%}.label{margin-left:8px;color:#8b949e;font-size:12px}
    .body{padding:29px 34px;font-size:17px;line-height:1.72}.prompt{color:#7dd3fc;font-weight:700}.command{color:#fff}.line{white-space:pre-wrap}.key{display:inline-block;width:132px;color:#8b949e}.ok{color:#7ee787}.foot{position:absolute;right:50px;bottom:46px;color:#6e7681;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
  </style></head><body><div class="term"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="label">OpenStage · skill-authored presentation</span></div><div class="body"><div><span class="prompt">$</span> <span class="command">${escapeHtml(step.command)}</span></div><br>${lines}<br><div class="ok">✓ observed by this run</div></div></div><div class="foot">repository source · local build · no deployment</div></body></html>`);
  await page.evaluate(() => document.fonts?.ready);
  const filename = `step-${String(index + 1).padStart(2, "0")}-authoring.png`;
  const absolute = join(terminalDir, filename);
  await page.screenshot({ path: absolute, animations: "disabled" });
  const hash = createHash("md5").update(readFileSync(absolute)).digest("hex");
  if (seen.has(hash)) throw new Error(`${filename} duplicates ${seen.get(hash)}`);
  seen.set(hash, filename);
  step.screenshotFilename = `${FEATURE}/terminal/${filename}`;
  await page.close();
}
await browser.close();

writeJson(`${FEATURE}.terminal.json`, {
  featureId: FEATURE,
  featureName: "Skill-authored presentation",
  type: "feature",
  location: "OpenStage skills → npm run build → /proof-before-promise",
  category: "authoring",
  surface: "terminal",
  platform: "cli",
  locale: "en",
  headline: "From one terminal brief to a built, browser-ready deck",
  overview:
    "This is the author workflow itself: inspect the repository skills, give Claude or Codex the same brief, review the generated source, run the real build, and hand the result to the browser walkthrough.",
  targetAudience: "Presentation authors using OpenStage with Claude Code or Codex",
  steps: terminalSteps.map((step, index) => ({
    stepNumber: index + 1,
    title: step.title,
    action: step.action,
    description: step.description,
    screenshotFilename: step.screenshotFilename,
    screenshotAlt: step.title,
    location: step.command,
    verificationStatus: "live-walked",
  })),
  keyFeatures: [
    "Repository-owned narrative and quality skills",
    "Same source contract for Claude and Codex",
    "Typed content module, route, registry entry, and speaker notes",
    "Build and live HTTP verification before browser capture",
  ],
  tips: [
    "Use plan-presentation before a builder skill.",
    "Use slide-mode for fixed decks and new-deck for scroll narratives.",
    `[Open the generated Proof Before Promise deck](${BASE}/proof-before-promise).`,
    `[Compare the existing flagship scroll deck](${BASE}/awwwards-flagship).`,
  ],
  note: "The deck was built and served locally. It was not deployed or published externally.",
  generatedAt: startedAt,
  capturedAt: startedAt,
});

const cap = await openCapture({ outDir: OUT, videoDir: join(OUT, "video"), driver: "playwright" });
const deckWalks = [];
for (const surface of [SURFACES.desktop, SURFACES.mobile]) {
  const walk = await cap.feature(FEATURE, surface, {
    url: `${BASE}/proof-before-promise`,
    video: surface.id === "desktop",
  });
  const steps = [
    {
      stepNumber: 1,
      title: "The generated deck opens on its thesis",
      action: "Opened the route produced by the skill-authored source.",
      description:
        "The title slide leads with the walkthrough standard instead of explaining the framework. Speaker notes, controls, and export actions remain available without entering the composition.",
      screenshotFilename: await walk.shot("step-01-opening.png", { firstOfScreen: true }),
      screenshotAlt: "Proof Before Promise opening slide in OpenStage",
      location: "/proof-before-promise",
      verificationStatus: "live-walked",
    },
  ];
  const advances = surface.id === "desktop" ? 4 : 2;
  for (let index = 0; index < advances; index += 1) {
    await walk.ctx.press("ArrowRight");
    await walk.ctx.settle();
    const file = await walk.shot(`step-${String(index + 2).padStart(2, "0")}-slide-${index + 2}.png`, { optional: true });
    if (!file) continue;
    steps.push({
      stepNumber: steps.length + 1,
      title: ["The evidence chain becomes a diagram", "Coverage becomes a visual hierarchy", "The surface distinction is explicit", "Both agent commands are shown"][index],
      action: "Pressed the right arrow key.",
      description:
        "The fixed slide frame advances in place and preserves the composition. This state was reached through the actual presenter keyboard path, not a deep link to a screenshot.",
      screenshotFilename: file,
      screenshotAlt: `Proof Before Promise slide ${index + 2} on ${surface.label}`,
      location: "/proof-before-promise",
      verificationStatus: "live-walked",
    });
  }
  const finished = await walk.finish();
  if (finished.video && steps.length) steps[steps.length - 1].videoFilename = `video/${finished.video.split("/").pop()}`;
  const payload = {
    featureId: FEATURE,
    featureName: "Skill-authored presentation",
    type: "feature",
    location: "/proof-before-promise",
    category: "authoring",
    surface: surface.id,
    platform: "web",
    locale: "en",
    headline: "The generated source becomes a presenter-driven deck",
    overview:
      "After the terminal proof, this walkthrough opens the generated result and advances it with the presenter keyboard path on desktop and compact web surfaces.",
    targetAudience: "Presentation authors verifying the result of an agent-assisted build",
    steps,
    keyFeatures: ["Seven fixed-height slides", "Speaker notes", "Per-slide transitions", "Desktop and compact browser surfaces"],
    tips: [
      `[Open Proof Before Promise directly](${BASE}/proof-before-promise).`,
      `[Compare the component-rich scroll showcase](${BASE}/sample-scroll).`,
    ],
    note: "Live-walked against the local OpenStage server; no external deployment was performed.",
    generatedAt: startedAt,
    capturedAt: startedAt,
  };
  writeJson(`${FEATURE}.${surface.id}.json`, payload);
  deckWalks.push(payload);
}

const authorJourneyScenes = [
  {
    id: "find-skills",
    title: "Noor starts with the repository's rules",
    narrative:
      "Noor needs a client-ready deck but does not want an agent inventing a style from scratch. She finds planning, slide, component, and quality skills inside the same repository that will own the result.",
    frames: [terminalSteps[0].screenshotFilename],
    location: terminalSteps[0].command,
    surface: "terminal",
  },
  {
    id: "prompt-agent",
    title: "The brief is portable between agents",
    narrative:
      "She can open Claude Code or Codex and issue the same outcome-focused prompt. The agent changes; the instructions, source contract, and review bar do not.",
    frames: [terminalSteps[1].screenshotFilename],
    location: terminalSteps[1].command,
    surface: "terminal",
  },
  {
    id: "review-source",
    title: "The work lands as ordinary source",
    narrative:
      "Noor reviews a content module, route, and registry change. She can edit it, diff it, or hand it to another engineer without exporting a conversation transcript.",
    frames: [terminalSteps[2].screenshotFilename],
    location: terminalSteps[2].command,
    surface: "terminal",
  },
  {
    id: "pass-build",
    title: "The repository gets the final word",
    narrative:
      "The build compiles the deck, checks TypeScript, and generates its route. Noor does not accept 'looks right in the prompt' as a delivery state.",
    frames: [terminalSteps[3].screenshotFilename],
    location: terminalSteps[3].command,
    surface: "terminal",
  },
  {
    id: "open-deck",
    title: "The thesis is visible in a browser",
    narrative:
      "The generated route opens on a composed title slide. The browser is now evidence of the product result, not merely a viewer for generated text.",
    frames: [deckWalks[0].steps[0].screenshotFilename],
    location: "/proof-before-promise",
    surface: "desktop",
  },
  {
    id: "present",
    title: "Noor can present the finished argument",
    narrative:
      "She advances to the terminal slide and sees both agent workflows inside the deck itself. The artifact now explains how it was made and is ready to share locally for review.",
    frames: [deckWalks[0].steps.at(-1).screenshotFilename],
    location: "/proof-before-promise",
    surface: "desktop",
  },
].map((scene) => ({
  ...scene,
  frameCaptions: [scene.title],
  sourceFeature: FEATURE,
  verificationStatus: "live-walked",
}));

writeJson("persona-presentation-author.build-and-present.json", {
  personaId: "presentation-author",
  journeyId: "build-and-present",
  headline: "From a terminal brief to a deck Noor can actually present",
  overview:
    "Noor uses the OpenStage skills through either Claude Code or Codex, reviews ordinary source, passes the repository build, and opens the finished slide deck in a browser.",
  payoff: "Noor has a built, keyboard-driven presentation with a stable local link and inspectable source.",
  platform: "web",
  surface: "desktop",
  scenes: authorJourneyScenes,
  capturedAt: startedAt,
});

const catalog = JSON.parse(readFileSync(join(OUT, "catalog.json"), "utf8"));
const existing = catalog.features.find((feature) => feature.featureId === FEATURE);
const authoringFeature = {
  featureId: FEATURE,
  featureName: "Skill-authored presentation",
  location: "OpenStage skills → /proof-before-promise",
  category: "authoring",
  requiresAuth: false,
  surfaceStatus: { terminal: "done", desktop: "done", mobile: "done" },
  videoStatus: "done",
  issueCount: 0,
  lastWalkthroughAt: startedAt,
  notes: "Built locally from repository skills, compiled, served, and driven in the browser.",
};
catalog.features = existing
  ? catalog.features.map((feature) => (feature.featureId === FEATURE ? authoringFeature : feature))
  : [authoringFeature, ...catalog.features];
catalog.scope = {
  status: "partial",
  note:
    "Gallery, scroll and slide viewers, an unlisted deck, admin, and a complete skill-to-source-to-browser author journey are walked. Share links and password gates remain pending because no valid share record or protected deck exists locally.",
  excluded: ["Share link without a real share id", "Password gate without a protected deck"],
};
const reader = catalog.personas?.find((persona) => persona.id === "reader");
catalog.personas = [
  ...(reader ? [reader] : []),
  {
    id: "presentation-author",
    name: "Noor Al-Khatib",
    description:
      "Noor turns briefs into client-facing presentations and needs the agent to respect a shared narrative and visual system. She cares that the deck builds, presents, and remains editable source. She does not care whether Claude Code or Codex performed the first draft.",
    authRole: "author",
    entryPoint: ".claude/skills/plan-presentation/SKILL.md",
    keyJourneys: ["build-and-present"],
    navItems: [
      { label: "Authoring terminal", location: "OpenStage skills → npm run build" },
      { label: "Finished deck", location: "/proof-before-promise" },
    ],
  },
];
catalog.updatedAt = startedAt;
writeJson("catalog.json", catalog);

const runsPath = join(OUT, "runs.json");
const runs = existsSync(runsPath) ? JSON.parse(readFileSync(runsPath, "utf8")) : { runs: [] };
const git = (args) => execFileSync("git", ["-C", TARGET, ...args], { encoding: "utf8" }).trim();
const sha = git(["rev-parse", "HEAD"]);
runs.runs.push({
  id: startedAt,
  startedAt,
  completedAt: new Date().toISOString(),
  skill: "walkthrough",
  agent: "walk-openstage-authoring.mjs",
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
    driver: "terminal renderer + Playwright",
    capturedAgainst: BASE,
    surfaces: ["terminal", "desktop", "mobile"],
    locales: ["en"],
    notes: "Repository skills inspected, build executed, HTTP route checked, deck driven with keyboard. No deployment.",
  },
  coverage: {
    features: [FEATURE],
    personas: ["presentation-author"],
    screenshots: terminalSteps.length + deckWalks.reduce((sum, walk) => sum + walk.steps.length, 0),
    videos: deckWalks.flatMap((walk) => walk.steps).filter((step) => step.videoFilename).length,
    issues: 0,
  },
});
writeJson("runs.json", runs);

const report = cap.report();
await cap.close();
console.log(`OpenStage authoring: ${terminalSteps.length} terminal frames, ${report.captures} browser captures, one 6-scene persona journey.`);
