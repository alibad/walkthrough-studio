#!/usr/bin/env node
/**
 * Verify the evidence contract on disk.
 *
 * The hub is deliberately tolerant at runtime so a half-finished walk can be
 * viewed. Release verification must be stricter: malformed JSON, a `done`
 * claim with no walkthrough, a missing frame, duplicate evidence, or declared
 * media that is absent all fail this command.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pngSize } from "./lib/capture/invariants.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HUB = join(ROOT, "apps", "hub");
const STORAGE = join(HUB, "public", "walkthroughs");
const VALID_STATUSES = new Set(["done", "pending", "blocked", "skipped"]);
const VALID_VERIFICATION = new Set([undefined, "live-walked", "synthetic", "gated-write"]);
const VALID_PLATFORMS = new Set(["web", "ios", "android", "desktop", "cli"]);

const errors = [];
const warnings = [];
let projectCount = 0;
let walkthroughCount = 0;
let captureCount = 0;
let videoCount = 0;

function fail(where, detail) {
  errors.push(`${where}: ${detail}`);
}

function warn(where, detail) {
  warnings.push(`${where}: ${detail}`);
}

function readJson(file, label = file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(label, `cannot parse JSON (${error.message})`);
    return null;
  }
}

function safeRelative(rel) {
  if (typeof rel !== "string" || !rel) return false;
  const clean = normalize(rel).replaceAll("\\", "/");
  return !isAbsolute(rel) && clean !== ".." && !clean.startsWith("../");
}

function asset(projectDir, rel, where, kind = "asset") {
  if (!safeRelative(rel)) {
    fail(where, `${kind} path must stay inside the project directory (${String(rel)})`);
    return null;
  }
  const abs = join(projectDir, rel);
  if (!existsSync(abs)) {
    fail(where, `${kind} is declared but missing (${rel})`);
    return null;
  }
  return abs;
}

function hash(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function verifyWalkthrough(project, catalog, feature, surface, file) {
  const label = `${project.slug}/${feature.featureId}.${surface}`;
  const walk = readJson(file, label);
  if (!walk) return;
  walkthroughCount += 1;

  if (walk.videoFilename) {
    fail(label, "root-level videoFilename is not part of the contract; attach it to a step or use video.file");
  }

  if (walk.featureId !== feature.featureId) fail(label, `featureId is ${walk.featureId}`);
  if (walk.surface !== surface) fail(label, `surface is ${walk.surface}`);
  // `catalog.platform` is the project's primary target, not an exhaustive
  // platform claim. A web/mobile product can have CLI evidence for its MCP
  // path, and the hub deliberately derives the documented platform union from
  // the walkthroughs on disk. Validate the value without erasing that truth.
  if (walk.platform && !VALID_PLATFORMS.has(walk.platform)) {
    fail(label, `unknown platform ${walk.platform}`);
  }
  if (!Array.isArray(walk.steps) || walk.steps.length === 0) {
    fail(label, "walkthrough has no steps");
    return;
  }

  const seen = new Map();
  let previous = 0;
  for (const [index, step] of walk.steps.entries()) {
    const at = `${label} step ${step.stepNumber ?? index + 1}`;
    if (!Number.isInteger(step.stepNumber) || step.stepNumber <= previous) {
      fail(at, "stepNumber must be a strictly increasing integer");
    }
    previous = step.stepNumber;
    if (index > 0 && !String(step.action ?? "").trim()) fail(at, "action is required after step 1");
    if (!VALID_VERIFICATION.has(step.verificationStatus)) {
      fail(at, `unknown verificationStatus ${step.verificationStatus}`);
    }

    const frames = [step.screenshotFilename, ...(step.screenshotFrames ?? [])].filter(Boolean);
    if (frames.length === 0 && !step.videoFilename) fail(at, "step has no image or video evidence");
    for (const rel of frames) {
      const abs = asset(dirname(file), rel, at, "capture");
      if (!abs) continue;
      try {
        const size = pngSize(abs);
        if (size.width < 600 || size.height < 600) fail(at, `${rel} is unexpectedly small (${size.width}x${size.height})`);
      } catch (error) {
        fail(at, error.message);
        continue;
      }
      const digest = hash(abs);
      if (seen.has(digest)) fail(at, `${rel} is byte-identical to ${seen.get(digest)}`);
      else seen.set(digest, rel);
      captureCount += 1;
    }
    if (step.videoFilename && asset(dirname(file), step.videoFilename, at, "video")) videoCount += 1;
  }

  if (walk.video?.file && asset(dirname(file), walk.video.file, label, "feature video")) videoCount += 1;
}

function verifyJourney(projectDir, catalog, name) {
  const file = join(projectDir, name);
  const label = `${catalog.projectName}/${name}`;
  const journey = readJson(file, label);
  if (!journey) return;
  if (journey.platform && !VALID_PLATFORMS.has(journey.platform)) {
    fail(label, `unknown platform ${journey.platform}`);
  }
  const persona = (catalog.personas ?? []).find((p) => p.id === journey.personaId);
  if (!persona) fail(label, `persona ${journey.personaId} is not declared in catalog.json`);
  if (!Array.isArray(journey.scenes) || journey.scenes.length === 0) fail(label, "journey has no scenes");
  if ((journey.scenes?.length ?? 0) < 5) warn(label, "journey has fewer than five scenes");

  for (const [index, scene] of (journey.scenes ?? []).entries()) {
    const at = `${label} scene ${index + 1}`;
    if (!VALID_VERIFICATION.has(scene.verificationStatus)) {
      fail(at, `unknown verificationStatus ${scene.verificationStatus}`);
    }
    const frames = scene.frames ?? [];
    if (frames.length === 0 && !scene.video && !scene.note) fail(at, "scene has no evidence or explicit gap note");
    for (const rel of frames) if (asset(projectDir, rel, at, "scene frame")) captureCount += 1;
    if (scene.video && asset(projectDir, scene.video, at, "scene video")) videoCount += 1;
  }
  for (const moment of journey.moments ?? []) asset(projectDir, moment.image, label, "illustration");
  if (journey.storyVideo && asset(projectDir, journey.storyVideo, label, "story video")) videoCount += 1;
}

const registry = readJson(join(HUB, "projects.json"), "projects.json");
for (const project of registry?.projects ?? []) {
  projectCount += 1;
  if (project.codebase?.local && isAbsolute(project.codebase.local)) {
    fail(project.slug, "codebase.local must be relative so a public registry never exposes a home directory");
  }
  const projectDir = join(STORAGE, project.slug);
  const catalogFile = join(projectDir, "catalog.json");
  if (!existsSync(catalogFile)) {
    fail(project.slug, "registered project has no catalog.json");
    continue;
  }
  const catalog = readJson(catalogFile, `${project.slug}/catalog.json`);
  if (!catalog) continue;
  if (catalog.schemaVersion !== 2) fail(project.slug, `catalog schemaVersion is ${catalog.schemaVersion ?? "absent"}, expected 2`);
  if (catalog.platform !== project.target?.platform) {
    fail(project.slug, `catalog platform ${catalog.platform} disagrees with registry ${project.target?.platform}`);
  }
  if (catalog.scope?.status === "bounded" && !String(catalog.scope.note ?? "").trim()) {
    fail(project.slug, "a bounded catalog must explain what is outside its scope");
  }
  for (const persona of catalog.personas ?? []) {
    if (persona.portrait) {
      asset(projectDir, persona.portrait, `${project.slug}/persona ${persona.id}`, "portrait");
    }
    if (persona.scene) {
      asset(projectDir, persona.scene, `${project.slug}/persona ${persona.id}`, "scene illustration");
    }
  }

  for (const feature of catalog.features ?? []) {
    for (const [surface, status] of Object.entries(feature.surfaceStatus ?? {})) {
      const at = `${project.slug}/${feature.featureId}.${surface}`;
      if (!VALID_STATUSES.has(status)) fail(at, `unknown surface status ${status}`);
      const file = join(projectDir, `${feature.featureId}.${surface}.json`);
      if (status === "done" && !existsSync(file)) fail(at, "catalog says done but no walkthrough exists");
      if (existsSync(file)) {
        if (status !== "done") fail(at, `walkthrough exists but catalog status is ${status}`);
        verifyWalkthrough(project, catalog, feature, surface, file);
      }
    }
  }

  // A superseded walkthrough left on disk is still published at a stable URL
  // and looks authoritative even though the catalog no longer names it.
  // Detect feature JSON by shape rather than by a fixed surface suffix.
  const catalogFeatureIds = new Set((catalog.features ?? []).map((feature) => feature.featureId));
  for (const name of readdirSync(projectDir).filter((entry) => entry.endsWith(".json"))) {
    if (["catalog.json", "issues.json", "runs.json", "fixes.json"].includes(name) || name.startsWith("persona-")) continue;
    const candidate = readJson(join(projectDir, name), `${project.slug}/${name}`);
    if (candidate?.type !== "feature") continue;
    if (!catalogFeatureIds.has(candidate.featureId)) {
      fail(`${project.slug}/${name}`, `orphan walkthrough for uncataloged feature ${candidate.featureId}`);
    }
  }

  for (const name of readdirSync(projectDir).filter((entry) => /^persona-.*\.json$/.test(entry))) {
    verifyJourney(projectDir, catalog, name);
  }

  const runsFile = join(projectDir, "runs.json");
  if (!existsSync(runsFile)) {
    fail(project.slug, "runs.json is missing");
    continue;
  }
  const runs = readJson(runsFile, `${project.slug}/runs.json`)?.runs ?? [];
  const ids = new Set();
  let prior = "";
  for (const [index, run] of runs.entries()) {
    const at = `${project.slug}/runs.json run ${index + 1}`;
    if (!run.id || ids.has(run.id)) fail(at, "run id is missing or duplicated");
    ids.add(run.id);
    if (prior && run.id < prior) fail(at, "runs must remain append-only in chronological order");
    prior = run.id;
    if (!Number.isFinite(Date.parse(run.startedAt)) || !Number.isFinite(Date.parse(run.completedAt))) {
      fail(at, "startedAt and completedAt must be ISO dates");
    } else if (Date.parse(run.completedAt) < Date.parse(run.startedAt)) {
      fail(at, "completedAt precedes startedAt");
    }
    if (!Array.isArray(run.config?.surfaces)) fail(at, "config.surfaces is missing");
    if (!Number.isInteger(run.coverage?.screenshots) || run.coverage.screenshots < 0) {
      fail(at, "coverage.screenshots must be a non-negative integer");
    }
  }
}

console.log(`Walkthrough Studio · evidence verification`);
console.log(`${projectCount} projects · ${walkthroughCount} walkthroughs · ${captureCount} referenced frames · ${videoCount} videos`);
for (const item of warnings) console.log(`  ! ${item}`);
for (const item of errors) console.error(`  ✗ ${item}`);
if (errors.length > 0) {
  console.error(`\n${errors.length} evidence contract failure${errors.length === 1 ? "" : "s"}`);
  process.exitCode = 1;
} else {
  console.log("\n✓ catalogs, claims, captures, media, and run history agree");
}
