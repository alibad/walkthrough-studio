#!/usr/bin/env node
// Film a tour for an MP4, from the same script the player plays live. Each chapter is one take, filmed by the
// narrate-video skill's recorder (scripts/capture.mjs, take(): readiness checks, geometry checks, sharp H.264 at real
// speed) at 2x device pixels, with this engine performing the chapter's steps one after another, cursor and highlight
// included, each step taking as long as its narration. Then it writes the skill's edit plan for scripts/render.py:
// one scene per chapter, with
//   - the chapter's narration, its lines laid on one track at the moments their steps started;
//   - one caption per line, timed to its narration, in a real typeface (--font, or the system's UI font);
//   - camera keys: every chapter opens wide on its page, then the camera follows what each action is about (the
//     element it points at, clicks or types into), framed so it fills about 60% of the picture, eased in and out.
//     The capture's 2x pixels keep the text sharp when the camera pushes in, so the page stays readable on a phone.
//
// A step marked "film": false (a line only a live viewer needs, like "pause at any moment") must end its chapter; the
// film leaves it out.
//
//   node player/record.mjs --app http://localhost:5270 --tour ../my-app/walkthroughs/intro --work F:/work/intro \
//     [--lang en] [--narrate ~/.claude/skills/narrate-video] [--build "my-app abc1234"] [--chapters 1,3]
//     [--font <ttf>] [--max-zoom 1.6] [--scale 2] [--browser <chromium exe>] [--takes-only]
// Needs each step's narration first (voice.mjs): <work>/voice/<lang>/<nn>-<id>.wav and its duration in tour.json.
// --takes-only films without narration, to try the takes and the camera out, and writes no plan.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, access, rm, mkdir, copyFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { launchChromium } from './browser.mjs';
import { replayRoutes } from './replay.mjs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map((s) => {
  const [k, ...v] = s.trim().split(/\s+/);
  return [k, v.join(' ') || 'true'];
}));
if (!args.app || !args.tour || !args.work) { console.error('Usage: node player/record.mjs --app <url> --tour <tour folder> --work <production folder> [--lang xx] [--narrate <skill dir>] [--build <text>] [--chapters 1,3] [--font ttf] [--max-zoom 1.6] [--scale 2] [--browser exe] [--takes-only]'); process.exit(2); }
const engine = join(dirname(fileURLToPath(import.meta.url)), 'engine.js');
await import(pathToFileURL(engine).href); // defines globalThis.Playable
const { chapters, urlFor, pick, estimate } = globalThis.Playable;
const tourDir = resolve(args.tour), work = resolve(args.work);
const narrate = resolve(args.narrate || join(homedir(), '.claude', 'skills', 'narrate-video'));
const { take, frameBox } = await import(pathToFileURL(join(narrate, 'scripts', 'capture.mjs')).href);
const tour = JSON.parse((await readFile(join(tourDir, 'tour.json'), 'utf8')).replace(/^\uFEFF/, ''));
const lang = args.lang || tour.lang || 'en';
const vp = tour.viewport || { width: 1280, height: 720 };
const scale = Number(args.scale || 2); // 1280x720 CSS at 2x films 2560x1440, which the camera crops into
const film = { width: 1920, height: 1080 }; // what render.py makes of it
const maxZoom = Number(args['max-zoom'] || tour.film?.maxZoom || 1.6);
const only = args.chapters ? new Set(args.chapters.split(',').map(Number)) : null;
const takesOnly = Boolean(args['takes-only']);
const GAP = 0.4; // seconds between one line ending and the next step starting, as the live player pauses
const LEAD = 0.25; // the camera starts moving this long before the cursor does, so they arrive together
const nn = (k) => String(k + 1).padStart(2, '0');
const r3 = (v) => Math.round(v * 1000) / 1000;
const exists = (p) => access(p).then(() => true, () => false);
const build = args.build || 'unknown';
/** The encoded clip's length, which the renderer's trim must not pass (a take's wall-clock seconds run a frame long). */
const clipSeconds = (file) => Math.floor(Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout) * 1000) / 1000;
function run(cmd, argv) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8' });
  if (r.status !== 0) throw Error(`${cmd} failed (${r.status}): ${(r.stderr || r.stdout || '').trim().slice(-600)}`);
}

// Captions in a real typeface. render.py takes a font file inside the production folder.
const FONTS = ['C:/Windows/Fonts/seguisb.ttf', '/System/Library/Fonts/SFNS.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'];
async function captionFont() {
  if (takesOnly) return undefined;
  for (const f of [args.font, ...FONTS].filter(Boolean)) {
    if (!(await exists(f))) { if (f === args.font) throw Error(`No font at ${f}`); continue; }
    await mkdir(join(work, 'fonts'), { recursive: true });
    await copyFile(f, join(work, 'fonts', basename(f)));
    console.log(`captions: ${basename(f)}`);
    return `fonts/${basename(f)}`;
  }
  console.warn('captions: no font found, so Pillow draws its default; pass --font <ttf>');
  return undefined;
}

/** One track for a chapter: each line's WAV placed at the second its step started in the take. */
function mixChapter(wavs, delays, out) {
  const inputs = wavs.flatMap((w) => ['-i', w]);
  const legs = delays.map((d, j) => `[${j}:a]adelay=delays=${Math.round(d * 1000)}:all=1[a${j}]`).join(';');
  const graph = wavs.length === 1 ? `${legs.replace('[a0]', '[out]')}` : `${legs};${delays.map((_, j) => `[a${j}]`).join('')}amix=inputs=${wavs.length}:normalize=0:dropout_transition=0[out]`;
  run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]', '-c:a', 'pcm_s16le', out]);
}

/**
 * A line's captions as short cues a phone can read at a glance: one per sentence, a long sentence packed phrase by
 * phrase (commas, colons, dashes) up to `max` characters, each cue on screen for its share of the line's time.
 */
function cues(text, start, end, max = 56) {
  const pack = (pieces) => pieces.reduce((out, p) => {
    if (out.length && (out[out.length - 1] + ' ' + p).length <= max) out[out.length - 1] += ' ' + p; else out.push(p);
    return out;
  }, []);
  const halve = (c) => {
    if (c.length <= max) return [c];
    let k = -1;
    for (let i = 0; i < c.length; i++) if (c[i] === ' ' && (k < 0 || Math.abs(i - c.length / 2) < Math.abs(k - c.length / 2))) k = i;
    return k < 0 ? [c] : [...halve(c.slice(0, k)), ...halve(c.slice(k + 1))];
  };
  // A comma inside a number ("2,127") is no place to break a caption: hold it aside while splitting.
  const KEEP = '⁣';
  const sentences = text.trim().replace(/(\d),(?=\d)/g, `$1${KEEP}`).split(/(?<=[.!?؟…])\s+/).filter(Boolean);
  const parts = sentences.flatMap((s) => pack((s.match(/[^,;:—،؛]+[,;:—،؛]*/g) || [s]).map((p) => p.trim()).filter(Boolean))).flatMap(halve)
    .map((p) => p.replaceAll(KEEP, ','));
  const total = parts.reduce((a, c) => a + c.length, 0);
  let t = start;
  return parts.map((c, j) => {
    const e = j === parts.length - 1 ? end : r3(t + ((end - start) * c.length) / total);
    const cue = { start: r3(t), end: e, text: c };
    t = e;
    return cue;
  });
}

/**
 * What the camera frames, from what each action focused on. Focus moves in quick succession ("the cabinet, the
 * council and the courts") become one framing of everything they point at, held while the highlight moves within
 * it, rather than a pan per word.
 */
const CALM = 2; // seconds: focus moves closer together than this share one framing
function groupFocus(log) {
  const out = [];
  for (const f of log) {
    const g = out.at(-1);
    if (g && !f.wide && !g.wide && f.t - g.last < CALM && Math.abs((f.scroll ?? 0) - (g.scroll ?? 0)) < 2 && f.zoom == null && g.zoom == null) {
      const x = Math.min(g.rect.x, f.rect.x), y = Math.min(g.rect.y, f.rect.y);
      g.rect = { x, y, width: Math.max(g.rect.x + g.rect.width, f.rect.x + f.rect.width) - x, height: Math.max(g.rect.y + g.rect.height, f.rect.y + f.rect.height) - y };
      g.last = f.t;
    } else out.push({ ...f, last: f.t });
  }
  return out;
}

/** Camera keys for render.py: each framing shifted to lead the cursor, ascending, deduplicated. */
function cameraKeys(log, base, span) {
  const keys = [];
  for (const f of groupFocus(log)) {
    const t = r3(Math.min(span, Math.max(keys.at(-1)?.t ?? 0, base + f.t - LEAD)));
    const view = f.wide ? { cx: 0.5, cy: 0.5, z: 1 } : frameBox(f.rect, vp.width, vp.height, { zoom: f.zoom, maxZoom });
    // Frame the target a little above the middle of the picture, clear of the caption card at the bottom.
    if (!f.wide) view.cy = r3(Math.min(1, view.cy + 0.08 / view.z));
    const last = keys.at(-1);
    if (last && Math.abs(last.cx - view.cx) < 0.01 && Math.abs(last.cy - view.cy) < 0.01 && Math.abs(last.z - view.z) < 0.02) continue;
    if (!last && view.z === 1) continue; // every scene already opens wide
    keys.push({ t, ...view });
  }
  return keys.slice(0, 40);
}

const font = await captionFont();
const browser = await launchChromium(chromium, { executablePath: args.browser || process.env.PLAYABLE_BROWSER,
  args: [`--force-device-scale-factor=${scale}`, `--window-size=${vp.width},${vp.height}`] });
const scenes = [];
let from = null;
try {
  for (const [c, ch] of chapters(tour).entries()) {
    if (only && !only.has(c + 1)) continue;
    const filmed = ch.steps.filter((k) => tour.steps[k].film !== false);
    if (filmed.some((k, j) => k !== ch.steps[j])) throw Error(`Chapter ${c + 1}: a step with "film": false must end its chapter`);
    if (!filmed.length) continue;
    const steps = filmed.map((k) => tour.steps[k]);
    const durations = steps.map((s) => pick(s.duration, lang) || estimate(s.say, lang));
    const wavs = filmed.map((k) => join(work, 'voice', lang, `${nn(k)}-${tour.steps[k].id}.wav`));
    if (!takesOnly) for (const [j, s] of steps.entries()) {
      if (!pick(s.duration, lang) || !(await exists(wavs[j]))) throw Error(`Step ${filmed[j] + 1} (${s.id}) has no ${lang} narration yet: run voice.mjs first`);
    }

    const first = tour.steps[ch.first];
    const context = await browser.newContext({ viewport: null, locale: lang });
    // The recorder waits until every image on the page has decoded, and a lazy image below the fold never loads,
    // so a film loads them all, including those a step adds (a panel of photos), as the page makes them.
    await context.addInitScript(() => {
      const eager = (n) => {
        if (n.tagName === 'IMG' && n.loading === 'lazy') n.loading = 'eager';
        if (n.querySelectorAll) n.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
      };
      new MutationObserver((ms) => ms.forEach((m) => (m.type === 'attributes' ? eager(m.target) : m.addedNodes.forEach((n) => n.nodeType === 1 && eager(n)))))
        .observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['loading'] });
      // A film is the tour already playing: the page's floating "Take the tour" button has no place in it.
      const hide = () => {
        const s = document.createElement('style');
        s.textContent = '.playable-launch, button[data-playable-tour][style*="position: fixed"], button[data-playable-tour][style*="position:fixed"] { display: none !important; }';
        (document.head || document.documentElement).appendChild(s);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hide); else hide();
    });
    const replayed = await replayRoutes(context, tour, tourDir, lang); // recorded answers, named in the evidence
    const page = await context.newPage();
    const dir = join(work, 'captures', lang, `c${nn(c)}-${first.id}`);
    let result;
    try {
      await page.goto(new URL(urlFor(first, lang), args.app).href, { waitUntil: 'load' });
      if (first.ready) await page.waitForSelector(first.ready, { timeout: 15000 });
      const broken = await page.evaluate(async () => {
        const pending = [...document.images].filter((i) => !i.complete);
        await Promise.race([Promise.all(pending.map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))),
          new Promise((r) => setTimeout(r, 20000))]);
        return [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.currentSrc || i.src);
      });
      if (broken.length) throw Error(`Chapter ${c + 1}: ${broken.length} image(s) on ${page.url()} didn't load, so the page can't be filmed: ${broken.slice(0, 3).join(', ')}`);
      await page.addScriptTag({ path: engine });
      // Targets stay out of the bottom 30% of the page, where the film's captions sit.
      const margins = { top: 72, bottom: Math.round(vp.height * 0.3) };
      await page.evaluate(({ from, lang, margins }) => {
        window.__engine = window.Playable.createEngine(window, { lang, cursorSize: 22, margins, ...(from ? { from } : {}),
          onFocus: (f) => window.__playableFocus && window.__playableFocus(f) });
        window.__engine.setIdle(false);
      }, { from, lang, margins });
      // The chapter, played as the live player plays it: each step as long as its narration, then a short breath.
      const perform = async (_page, studio) => {
        studio.wide(); // marks the clip time the chapter starts at, which captions and narration are laid from
        result = await page.evaluate(async ({ steps, durations, gap }) => {
          const t0 = performance.now(), log = [], starts = [];
          const now = () => (performance.now() - t0) / 1000;
          window.__playableFocus = (f) => log.push(Object.assign({ t: now() }, f));
          for (let j = 0; j < steps.length; j++) {
            // A step that waits for something (an answer, results) starts when it shows, as the live player does.
            for (let t = 0; j > 0 && steps[j].ready && !document.querySelector(steps[j].ready); t += 100) {
              if (t > 25000) throw new Error(`Step ${steps[j].id}: the page never showed ${steps[j].ready}`);
              await new Promise((r) => setTimeout(r, 100));
            }
            starts.push(now());
            await Promise.all([window.__engine.runStep(steps[j], { duration: durations[j] }), new Promise((r) => setTimeout(r, durations[j] * 1000))]);
            if (j + 1 < steps.length) await new Promise((r) => setTimeout(r, gap * 1000));
          }
          return { starts, log, end: now(), from: window.__engine.position() };
        }, { steps, durations, gap: GAP });
        from = result.from;
      };
      if (await exists(dir)) await rm(dir, { recursive: true });
      const frame = tour.frame || first.ready;
      const receipt = await take(page, dir, {
        sharp: true, viewport: vp, selectors: [frame], afterSelectors: [steps.at(-1).after || frame],
        holdBefore: 500, holdAfter: 900, label: 'observed', build, action: perform,
        // A page that moves on its own (a turning 3D scene) says so in its chapter's "motion": the recorder then
        // waits for a settled layout instead of still pixels, and keeps the reason.
        ...(first.motion ? { readiness: { stability: 'layout', reason: first.motion } } : {}),
      });
      console.log(`filmed chapter ${c + 1} (${steps.map((s) => s.id).join(', ')}): ${receipt.sharp?.seconds ?? '?'} s, ${receipt.sharp?.width}x${receipt.sharp?.height}, ${result.log.length} focus moves`);
    } finally { await context.close(); }
    if (takesOnly) continue;

    const capture = JSON.parse(await readFile(join(dir, 'capture.json'), 'utf8'));
    const base = capture.camera[0]?.t ?? 0.5; // the clip second the chapter's first step started
    const clipEnd = clipSeconds(join(dir, capture.clip));
    const starts = result.starts.map((s) => r3(base + s));
    const mix = join(work, 'mix', lang, `c${nn(c)}.wav`);
    await mkdir(dirname(mix), { recursive: true });
    mixChapter(wavs, starts, mix);
    const captions = steps.flatMap((s, j) => cues(pick(s.say, lang), starts[j], r3(Math.min(starts[j] + durations[j], (starts[j + 1] ?? Infinity) - 0.05))));
    const camera = cameraKeys(result.log, base, clipEnd);
    scenes.push({
      kind: 'clip', status: 'observed', title: pick(ch.title, lang),
      visual: relative(work, join(dir, capture.clip)).replaceAll('\\', '/'),
      clipStart: 0, clipEnd,
      audio: relative(work, mix).replaceAll('\\', '/'),
      say: steps.map((s) => pick(s.say, lang)).join(' '),
      captions,
      ...(camera.length ? { camera } : {}),
      evidence: {
        capturedAt: capture.started, surface: `web, ${vp.width}x${vp.height} CSS px at ${scale}x, headless Chromium`,
        target: new URL(urlFor(first, lang), args.app).href,
        action: steps.map((s) => (s.do || []).map((a) => `${a.do} ${a.target || ''}${a.value ? ` "${pick(a.value, lang)}"` : ''}`.trim()).join('; ')).join(' | '),
        build,
        // Requests answered from a recording instead of the live service, and why (tour "replay").
        ...(replayed.some((r) => r.hits) ? { replayed: replayed.filter((r) => r.hits).map(({ url, file, why }) => ({ url, file, why })) } : {}),
      },
    });
  }
} finally { await browser.close(); }
if (takesOnly) { console.log(`Filmed the takes into ${join(work, 'captures', lang)}; no plan without narration.`); process.exit(0); }

// A tour's "finish" carries narrate-video's finishing options (header, captionSize, transition, fade...) into the plan.
const plan = { version: 1, ...film, fps: 30, captionStyle: 'lowerThird', ...(font ? { font } : {}), ...(tour.finish || {}),
  voice: tour.voice?.plan?.[lang] || tour.voice?.plan, scenes };
const out = join(work, `plan.${lang}.json`);
await writeFile(out, JSON.stringify(plan, null, 2));
console.log(`Wrote ${out} with ${scenes.length} scenes. Next: python ${join(narrate, 'scripts', 'render.py')} ${out} --check`);
