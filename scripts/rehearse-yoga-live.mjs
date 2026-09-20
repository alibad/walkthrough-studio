#!/usr/bin/env node
/**
 * Time the exact public Yoga Quest interaction used in the event segment.
 *
 * Unlike the showcase writer, this rehearsal never mutates hub evidence or
 * run history. It writes disposable proof to an explicit output directory so
 * the same bounded interaction can be measured more than once honestly.
 *
 *   node scripts/rehearse-yoga-live.mjs --out=/tmp/yoga-rehearsal-1
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { openCapture, SURFACES } from "./lib/capture/index.mjs";

const argv = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
if (!argv.out) throw new Error("--out is required; rehearsals must not overwrite published evidence");

const outDir = resolve(argv.out);
mkdirSync(outDir, { recursive: true });
const marks = [];
const startedAt = new Date().toISOString();
const started = performance.now();
const mark = (label) => marks.push({ label, elapsedMs: Math.round(performance.now() - started) });

const capture = await openCapture({ outDir, videoDir: outDir, driver: "playwright" });
let walk;
let result;
try {
  walk = await capture.feature("yoga-live", SURFACES.desktop, {
    url: "https://yogaquest.app/classes",
    video: true,
  });
  mark("production page ready");

  if (!(await walk.ctx.scrollToSelector('button[role="tab"]', 110))) throw new Error("Class tabs were not present");
  await walk.ctx.settle();
  await walk.shot("01-library.png");
  mark("library captured");

  if (!(await walk.ctx.click('button[role="tab"]:has-text("Programs")'))) throw new Error("Programs tab was not present");
  await walk.ctx.settle();
  await walk.shot("02-programs.png");
  mark("programs captured");

  if (!(await walk.ctx.clickText("Build a balance practice"))) throw new Error("Balance program card was not present");
  await walk.ctx.waitForSelector('[role="dialog"]');
  await walk.ctx.settle();
  await walk.shot("03-program-detail.png");
  mark("program detail captured");

  const { video } = await walk.finish();
  walk = null;
  mark("video finalized");
  result = {
    status: "passed",
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
    interaction: "Yoga Quest public class library -> Programs -> Build a balance practice",
    surface: "desktop",
    states: 3,
    video: video ? video.split("/").pop() : null,
    marks,
    report: capture.report(),
  };
} catch (error) {
  if (walk) await walk.finish().catch(() => {});
  result = {
    status: "failed",
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
    error: error.message,
    marks,
    report: capture.report(),
  };
  process.exitCode = 1;
} finally {
  await capture.close();
}

writeFileSync(resolve(outDir, "measurement.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
