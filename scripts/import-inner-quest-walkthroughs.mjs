#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TARGET = resolve(ROOT, "..", "inner_quest");
const SOURCE = join(TARGET, "public/walkthroughs");
const OUT = join(ROOT, "apps/hub/public/walkthroughs/inner-quest");
const startedAt = new Date().toISOString();

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, file), `${JSON.stringify(value, null, 2)}\n`);
}

function titleFromId(id) {
  return id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function transform(source, id, surface) {
  const featureName = source.featureName || source.toolName || titleFromId(id);
  const location = source.location || source.route || "/";
  const seen = new Set();
  const steps = [];
  for (const step of source.steps || []) {
    const relative = step.screenshotFilename;
    const sourceCapture = relative ? join(SOURCE, relative) : null;
    if (!sourceCapture || !existsSync(sourceCapture)) continue;
    const hash = createHash("md5").update(readFileSync(sourceCapture)).digest("hex");
    if (seen.has(hash)) continue;
    seen.add(hash);
    const destination = join(OUT, relative);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(sourceCapture, destination);
    steps.push(step);
  }
  return {
    featureId: id,
    featureName,
    type: "feature",
    location,
    category: source.category || "personal-os",
    surface,
    platform: "web",
    locale: "en",
    headline: source.headline || `${featureName}, from entry to detail`,
    overview: source.overview || `The app-owned walkthrough for ${featureName}.`,
    targetAudience: source.targetAudience || "People using Inner Quest as a private Personal OS",
    steps: steps.map((step, index) => ({
      ...step,
      stepNumber: index + 1,
      action:
        step.action ||
        (index === 0
          ? `Opened ${location}.`
          : /below|scroll/i.test(step.title || "")
            ? "Scrolled to the next captured section."
            : "Advanced to the next state preserved by the app-owned walkthrough."),
      location: step.location || location,
      verificationStatus: step.verificationStatus || "live-walked",
    })),
    keyFeatures: source.keyFeatures || [],
    tips: source.tips || [],
    note:
      "Imported from Inner Quest's app-owned walkthrough library. The captures are real product evidence, but their original run manifest and detailed interaction log predate Walkthrough Studio, so freshness is not claimed.",
    generatedAt: source.generatedAt || startedAt,
    capturedAt: source.capturedAt || source.generatedAt || startedAt,
    synthetic: false,
  };
}

mkdirSync(OUT, { recursive: true });

const desktopFiles = readdirSync(SOURCE)
  .filter((name) => name.endsWith(".json") && !name.endsWith(".mobile.json"))
  .filter((name) => statSync(join(SOURCE, name)).isFile());

const features = [];
let walkthroughFiles = 0;
let screenshots = 0;

for (const name of desktopFiles) {
  const id = basename(name, ".json");
  const desktop = readJson(join(SOURCE, name));
  const mobilePath = join(SOURCE, `${id}.mobile.json`);
  const surfaceStatus = {};

  for (const [surface, source] of [["desktop", desktop]]) {
    if (!source) continue;
    const transformed = transform(source, id, surface);
    writeJson(`${id}.${surface}.json`, transformed);
    surfaceStatus[surface] = "done";
    walkthroughFiles += 1;
    screenshots += transformed.steps.length;
  }
  if (existsSync(mobilePath)) surfaceStatus.mobile = "pending";

  features.push({
    featureId: id,
    featureName: desktop.featureName || desktop.toolName || titleFromId(id),
    location: desktop.location || desktop.route || "/",
    category: desktop.category || "personal-os",
    requiresAuth: !["signup", "login"].includes(id),
    authRole: !["signup", "login"].includes(id) ? "owner" : undefined,
    surfaceStatus,
    videoStatus: "pending",
    issueCount: 0,
    lastWalkthroughAt: desktop.capturedAt || desktop.generatedAt || null,
    notes:
      "Imported app-owned desktop capture; freshness is unknown until re-walked. The legacy 1x mobile captures were rejected by the evidence verifier and remain pending.",
  });
}

const previousCatalogPath = join(OUT, "catalog.json");
const previous = existsSync(previousCatalogPath) ? readJson(previousCatalogPath) : null;
const repaired = previous?.features?.find((feature) => feature.featureId === "repaired-write-path");
if (repaired && !features.some((feature) => feature.featureId === repaired.featureId)) features.push(repaired);

const journeyFeatureIds = [
  "signup",
  "character",
  "values-wheel",
  "my-relationships",
  "career-dashboard",
  "holistic-health",
  "action-items",
];
const journeyCopy = [
  ["A private front door", "Samira arrives at a Personal OS that asks her to create a private account before it asks her to quantify herself. She is not here for another social profile and does not want this material published."],
  ["The system starts with character", "Inside the Character hub, Samira sees the tools as parts of one self-understanding practice rather than a wall of unrelated assessments."],
  ["Values become a usable map", "The Values Wheel turns an abstract question into a concrete place to inspect alignment. Samira can see where her stated priorities and her lived week diverge."],
  ["Relationships stay in context", "My Relationships keeps people, notes, and growth work attached to the actual relationship. Samira does not have to rebuild that context in a separate journal."],
  ["Career becomes one chapter", "The Career Dashboard synthesizes strengths, values, fit, and next actions without pretending that work is the whole person."],
  ["Wellbeing joins the same story", "Holistic Health brings physical, emotional, and environmental signals into the same private system, where patterns can cross pillars without crossing users."],
  ["Reflection ends in action", "My Action Items is the payoff: the exploration becomes a short set of concrete next steps. Samira leaves with work she chose, not a score she was told to admire."],
];

const scenes = journeyFeatureIds.map((featureId, index) => {
  const featureFile = readJson(join(OUT, `${featureId}.desktop.json`));
  return {
    id: featureId,
    title: journeyCopy[index][0],
    narrative: journeyCopy[index][1],
    frames: [featureFile.steps[0].screenshotFilename],
    frameCaptions: [featureFile.steps[0].screenshotAlt || featureFile.steps[0].title],
    location: featureFile.location,
    surface: "desktop",
    sourceFeature: featureId,
    verificationStatus: "live-walked",
    note: "Frame imported from the app-owned legacy walkthrough library; current-state re-walk remains due.",
  };
});

const journeyFile = "persona-personal-os-owner.find-a-next-step.json";
const previousJourney = existsSync(join(OUT, journeyFile)) ? readJson(join(OUT, journeyFile)) : {};
writeJson(journeyFile, {
  ...(previousJourney.storyVideo ? { storyVideo: previousJourney.storyVideo } : {}),
  ...(previousJourney.moments ? { moments: previousJourney.moments } : {}),
  personaId: "personal-os-owner",
  journeyId: "find-a-next-step",
  headline: "From private reflection across life to one next action",
  overview:
    "Samira uses Inner Quest as a private system of record across character, relationships, career, and wellbeing. The journey follows her from account entry to a next step she can actually take.",
  payoff: "Samira turns cross-pillar reflection into a concrete action without moving her private context into another tool.",
  platform: "web",
  surface: "desktop",
  scenes,
  capturedAt: startedAt,
});

writeJson("catalog.json", {
  schemaVersion: 2,
  projectName: "Inner Quest",
  platform: "web",
  driver: "app-owned legacy captures + Playwright MCP proof",
  capturedAgainst: "Inner Quest capture library + authenticated MCP product proof",
  discoveredAt: previous?.discoveredAt || startedAt,
  updatedAt: startedAt,
  brand: previous?.brand,
  scope: {
    status: "partial",
    note:
      `${features.length - (repaired ? 1 : 0)} app-owned product features are represented by ${walkthroughFiles} deduplicated desktop walkthrough files and ${screenshots} captured states. Legacy 1x mobile captures were rejected rather than promoted as completed coverage. The product tree has changed since these captures and the primary checkout contains concurrent work, so this is broad historical desktop coverage plus one fresh MCP product proof, not a current comprehensive re-walk.`,
    excluded: ["Fresh authenticated re-walk of every private feature", "Retina mobile re-walk", "Concurrent uncommitted feature work"],
  },
  features,
  personas: [
    {
      id: "personal-os-owner",
      name: "Samira Haddad",
      description:
        "Samira is trying to connect what she learns about her character, relationships, work, and wellbeing without spreading private notes across five apps. She wants one next action, not another personality label, public profile, or diagnostic claim.",
      authRole: "owner",
      entryPoint: "/signup",
      keyJourneys: ["find-a-next-step"],
      portrait: "personas/personal-os-owner.png",
      scene: "personas/personal-os-owner-scene.png",
      navItems: journeyFeatureIds.map((id) => {
        const feature = features.find((item) => item.featureId === id);
        return { label: feature?.featureName || titleFromId(id), location: feature?.location || "/" };
      }),
    },
  ],
  synthetic: false,
});

const runsPath = join(OUT, "runs.json");
const runs = existsSync(runsPath) ? readJson(runsPath) : { runs: [] };
const git = (args) => execFileSync("git", ["-C", TARGET, ...args], { encoding: "utf8" }).trim();
const sha = git(["rev-parse", "HEAD"]);
runs.runs.push({
  id: startedAt,
  startedAt,
  completedAt: new Date().toISOString(),
  skill: "walkthrough",
  agent: "import-inner-quest-walkthroughs.mjs",
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
    driver: "app-owned capture import",
    capturedAgainst: "inner_quest/public/walkthroughs",
    surfaces: ["desktop"],
    locales: ["en"],
    notes:
      "Legacy captures imported without claiming freshness. No production account data was read or written during import.",
  },
  coverage: {
    features: features.map((feature) => feature.featureId),
    personas: ["personal-os-owner"],
    screenshots,
    videos: 0,
    issues: 0,
  },
});
writeJson("runs.json", runs);

console.log(`Inner Quest: ${features.length} features, ${walkthroughFiles} walkthrough files, ${screenshots} captured states, one 7-scene persona journey.`);
