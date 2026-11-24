#!/usr/bin/env node
// Check that a tour still matches its app: play every chapter headless and fast, from a fresh page (the way a viewer
// who jumps to that chapter gets it), in every language the tour speaks, and report each step that can no longer
// find what it points at. A tour that fails here would stop mid-sentence for a viewer: this is its own test.
//
//   node player/check.mjs --app http://localhost:5270 --tour ../my-app/walkthroughs/intro [--lang en] [--speed 4]
//     [--out check.json] [--browser <chromium exe>]
import { chromium } from 'playwright';
import { launchChromium } from './browser.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map((s) => {
  const [k, ...v] = s.trim().split(/\s+/);
  return [k, v.join(' ') || 'true'];
}));
if (!args.app || !args.tour) { console.error('Usage: node player/check.mjs --app <url> --tour <tour folder> [--lang xx] [--speed 4] [--out file] [--browser exe]'); process.exit(2); }
const engine = join(dirname(fileURLToPath(import.meta.url)), 'engine.js');
await import(pathToFileURL(engine).href); // defines globalThis.Playable, for chapters() and urlFor()
const { chapters, urlFor } = globalThis.Playable;
const tourDir = resolve(args.tour);
const tour = JSON.parse((await readFile(join(tourDir, 'tour.json'), 'utf8')).replace(/^﻿/, ''));
const speed = Number(args.speed || 4);
const langs = args.lang ? [args.lang] : tour.langs || [tour.lang || 'en'];

// --browser (or PLAYABLE_BROWSER) names a Chromium; otherwise Playwright's own, then the installed Edge or Chrome.
const browser = await launchChromium(chromium, { executablePath: args.browser || process.env.PLAYABLE_BROWSER });
const results = [];
try {
  for (const lang of langs) {
    for (const [c, ch] of chapters(tour).entries()) {
      const context = await browser.newContext({ viewport: tour.viewport || { width: 1280, height: 720 }, locale: lang });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message)));
      let failed = false;
      try {
        await page.goto(new URL(urlFor(tour.steps[ch.first], lang), args.app).href, { waitUntil: 'load' });
        await page.addScriptTag({ path: engine });
        await page.evaluate(({ speed, lang }) => { window.__engine = window.Playable.createEngine(window, { speed, lang }); }, { speed, lang });
        for (const k of ch.steps) {
          const step = tour.steps[k], t0 = Date.now();
          if (failed) { results.push({ lang, chapter: c + 1, step: k + 1, id: step.id, ok: false, error: 'not reached: an earlier step in this chapter failed' }); continue; }
          try {
            if (step.ready) await page.waitForSelector(step.ready, { timeout: 15000 });
            await page.evaluate((step) => window.__engine.runStep(step), step);
            if (step.after) await page.waitForSelector(step.after, { state: 'visible', timeout: 5000 });
            results.push({ lang, chapter: c + 1, step: k + 1, id: step.id, ok: true, ms: Date.now() - t0 });
          } catch (e) {
            failed = true;
            results.push({ lang, chapter: c + 1, step: k + 1, id: step.id, ok: false, error: String(e.message).replace(/^page\.\w+: (Error: )?/, '').split('\n')[0] });
          }
        }
      } catch (e) {
        for (const k of ch.steps) results.push({ lang, chapter: c + 1, step: k + 1, id: tour.steps[k].id, ok: false, error: `chapter didn't open: ${String(e.message).split('\n')[0]}` });
      } finally {
        if (errors.length) results.filter((r) => r.lang === lang && r.chapter === c + 1).forEach((r) => (r.pageErrors = errors));
        await context.close();
      }
    }
  }
} finally { await browser.close(); }

const ok = results.every((r) => r.ok);
const report = { tour: tour.id, app: args.app, checkedAt: new Date().toISOString(), ok, steps: results };
if (args.out) await writeFile(resolve(args.out), JSON.stringify(report, null, 2));
for (const lang of langs) {
  const mine = results.filter((r) => r.lang === lang);
  console.log(`${lang}: ${mine.map((r) => `${r.ok ? 'ok' : 'FAIL'} ${r.step}.${r.id}`).join('  ')}`);
  for (const r of mine.filter((r) => !r.ok)) console.log(`  ${r.step}. ${r.id}: ${r.error}`);
}
console.log(ok ? `All ${results.length} step runs match the app.` : `${results.filter((r) => !r.ok).length} of ${results.length} step runs no longer match the app.`);
process.exit(ok ? 0 : 1);
