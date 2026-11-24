#!/usr/bin/env node
// Film a tour for an MP4, from the same script the player plays live. Each step is one bounded take, filmed by the
// narrate-video skill's recorder (scripts/capture.mjs, take(): readiness checks, geometry checks, sharp H.264 at
// real speed), with this engine performing the step's actions, cursor and highlight included. A chapter's steps
// are filmed one after another on the same page, as a viewer sees them. Then it writes the skill's edit plan,
// pairing each take with that step's narration, for scripts/render.py to assemble.
//
// Every scene is timed by its own narration (the renderer holds a take's last frame while the voice finishes), so
// voice and picture can't drift apart across scenes. A step marked "film": false (a line only a live viewer needs,
// like "pause at any moment") still runs, unfilmed, so the steps after it see the same page.
//
//   node player/record.mjs --app http://localhost:5270 --tour ../my-app/walkthroughs/intro --work F:/work/intro \
//     [--lang en] [--narrate ~/.claude/skills/narrate-video] [--build "my-app abc1234"] [--only id1,id2]
//     [--browser <chromium exe>] [--takes-only]
// Needs each step's narration first (voice.mjs): <work>/voice/<lang>/<nn>-<id>.wav and its duration in tour.json.
// --takes-only films without narration, to try the takes out, and writes no plan.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, access, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map((s) => {
  const [k, ...v] = s.trim().split(/\s+/);
  return [k, v.join(' ') || 'true'];
}));
if (!args.app || !args.tour || !args.work) { console.error('Usage: node player/record.mjs --app <url> --tour <tour folder> --work <production folder> [--lang xx] [--narrate <skill dir>] [--build <text>] [--only ids] [--browser exe] [--takes-only]'); process.exit(2); }
const engine = join(dirname(fileURLToPath(import.meta.url)), 'engine.js');
await import(pathToFileURL(engine).href); // defines globalThis.Playable
const { chapters, urlFor, pick, estimate } = globalThis.Playable;
const tourDir = resolve(args.tour), work = resolve(args.work);
const narrate = resolve(args.narrate || join(homedir(), '.claude', 'skills', 'narrate-video'));
const { take } = await import(pathToFileURL(join(narrate, 'scripts', 'capture.mjs')).href);
const tour = JSON.parse((await readFile(join(tourDir, 'tour.json'), 'utf8')).replace(/^\uFEFF/, ''));
const lang = args.lang || tour.lang || 'en';
const vp = tour.viewport || { width: 1280, height: 720 };
const scale = Number(args.scale || 1.5); // 1280x720 CSS at 1.5x films 1920x1080
const only = args.only ? new Set(args.only.split(',')) : null;
const takesOnly = Boolean(args['takes-only']);
const nn = (k) => String(k + 1).padStart(2, '0');
const exists = (p) => access(p).then(() => true, () => false);
const build = args.build || 'unknown';
/** The encoded clip's length, which the renderer's trim must not pass (a take's wall-clock seconds run a frame long). */
const clipSeconds = (file) => Math.floor(Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout) * 1000) / 1000;

// --browser (or PLAYABLE_BROWSER) names an installed Chromium when Playwright's own revision isn't downloaded.
const executablePath = args.browser || process.env.PLAYABLE_BROWSER;
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: [`--force-device-scale-factor=${scale}`, `--window-size=${vp.width},${vp.height}`] });
const scenes = [];
let from = null;
try {
  for (const ch of chapters(tour)) {
    const first = tour.steps[ch.first];
    const context = await browser.newContext({ viewport: null, locale: lang });
    const page = await context.newPage();
    try {
      await page.goto(new URL(urlFor(first, lang), args.app).href, { waitUntil: 'load' });
      if (first.ready) await page.waitForSelector(first.ready, { timeout: 15000 });
      await page.addScriptTag({ path: engine });
      await page.evaluate(({ from, lang }) => { window.__engine = window.Playable.createEngine(window, { lang, ...(from ? { from } : {}) }); window.__engine.setIdle(false); }, { from, lang });
      const perform = async () => { from = await page.evaluate(async ({ step, duration }) => { await window.__engine.runStep(step, { duration }); return window.__engine.position(); }, { step: currentStep, duration: currentDuration }); };
      let currentStep, currentDuration;
      for (const k of ch.steps) {
        const step = tour.steps[k];
        currentStep = step;
        currentDuration = pick(step.duration, lang) || estimate(step.say, lang);
        const filmed = step.film !== false && (!only || only.has(step.id));
        const wav = join(work, 'voice', lang, `${nn(k)}-${step.id}.wav`);
        if (step.film !== false && !takesOnly && (!pick(step.duration, lang) || !(await exists(wav)))) throw Error(`Step ${k + 1} (${step.id}) has no ${lang} narration yet: run voice.mjs first`);
        if (step.ready) await page.waitForSelector(step.ready, { timeout: 15000 });
        const dir = join(work, 'captures', lang, `${nn(k)}-${step.id}`);
        if (!filmed) { await perform(); }
        else {
          if (await exists(dir)) await rm(dir, { recursive: true });
          const frame = tour.frame || step.ready;
          const receipt = await take(page, dir, {
            sharp: true, viewport: vp, selectors: [frame], afterSelectors: [step.after || frame],
            holdBefore: 300, holdAfter: 500, label: 'observed', build, action: perform,
          });
          console.log(`filmed ${k + 1}. ${step.id}: ${receipt.sharp?.seconds ?? '?'} s, ${receipt.sharp?.width}x${receipt.sharp?.height}`);
        }
        if (step.film === false || takesOnly) continue;
        const capture = JSON.parse(await readFile(join(dir, 'capture.json'), 'utf8'));
        const say = pick(step.say, lang);
        scenes.push({
          kind: 'clip', status: 'observed', title: pick(step.title || ch.title, lang),
          visual: relative(work, join(dir, capture.clip)).replaceAll('\\', '/'),
          clipStart: 0, clipEnd: clipSeconds(join(dir, capture.clip)),
          audio: relative(work, wav).replaceAll('\\', '/'),
          say,
          captions: [{ start: 0, end: Math.round(currentDuration * 100) / 100, text: say }],
          evidence: {
            capturedAt: capture.started, surface: `web, ${vp.width}x${vp.height} CSS px at ${scale}x, headless Chromium`,
            target: page.url(),
            action: (step.do || []).map((a) => `${a.do} ${a.target || ''}${a.value ? ` "${pick(a.value, lang)}"` : ''}`.trim()).join('; '),
            build,
          },
        });
      }
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
if (takesOnly) { console.log(`Filmed the takes into ${join(work, 'captures', lang)}; no plan without narration.`); process.exit(0); }

// A tour's "finish" carries narrate-video's finishing options (header, captionSize, transition, fade...) into the plan.
const plan = { version: 1, width: Math.round(vp.width * scale), height: Math.round(vp.height * scale), fps: 30, ...(tour.finish || {}), voice: tour.voice?.plan?.[lang] || tour.voice?.plan, scenes };
const out = join(work, `plan.${lang}.json`);
await writeFile(out, JSON.stringify(plan, null, 2));
console.log(`Wrote ${out} with ${scenes.length} scenes. Next: python ${join(narrate, 'scripts', 'render.py')} ${out} --check`);
