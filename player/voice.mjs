#!/usr/bin/env node
// Narrate a tour in the user's own voice: one take per step, made by the narrate-video skill's voice studio
// (scripts/studio_speech.py, which uses the saved, accepted voice profile and never falls back to another voice).
// Writes the WAV master into the production folder, an MP3 next to the tour for the player, and each take's
// measured duration into tour.json, which is what places every action's cue against the voice.
//
//   node player/voice.mjs --tour ../my-app/walkthroughs/intro --work F:/work/intro --python <python 3.12+> \
//     [--lang en] [--narrate ~/.claude/skills/narrate-video] [--revision "k2-fsa/OmniVoice c5fdb5c"] [--only id1,id2] [--force]
// The studio must be running with the profile ready for that language (studio_speech.py status --language <lang>).
// A step's take is reused while its line is unchanged; --force, or a changed line, records it again.
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map((s) => {
  const [k, ...v] = s.trim().split(/\s+/);
  return [k, v.join(' ') || 'true'];
}));
if (!args.tour || !args.work) { console.error('Usage: node player/voice.mjs --tour <tour folder> --work <production folder> [--python <exe>] [--lang xx] [--narrate <skill dir>] [--revision <text>] [--only ids] [--force]'); process.exit(2); }
await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'engine.js')).href);
const { pick } = globalThis.Playable;
const tourDir = resolve(args.tour), work = resolve(args.work);
const narrate = resolve(args.narrate || join(homedir(), '.claude', 'skills', 'narrate-video'));
const python = args.python || 'python';
const file = join(tourDir, 'tour.json');
const tour = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const lang = args.lang || tour.lang || 'en';
const only = args.only ? new Set(args.only.split(',')) : null;
const nn = (k) => String(k + 1).padStart(2, '0');
const exists = (p) => access(p).then(() => true, () => false);
// Per-language fields stay per-language: a tour whose lines are { en, ar } keeps { en, ar } audio and durations.
const assign = (step, key, value) => {
  if (typeof step.say === 'object') step[key] = { ...(typeof step[key] === 'object' ? step[key] : {}), [lang]: value };
  else step[key] = value;
};

function run(cmd, argv) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (r.status !== 0) throw Error(`${cmd} ${argv.join(' ')} failed (${r.status}): ${(r.stderr || r.stdout || '').trim().slice(-600)}`);
  return r.stdout.trim();
}

await mkdir(join(work, 'voice', lang), { recursive: true });
await mkdir(join(tourDir, 'voice', lang), { recursive: true });
for (const [k, step] of tour.steps.entries()) {
  if (only && !only.has(step.id)) continue;
  const say = pick(step.say, lang);
  if (!say) throw Error(`Step ${k + 1} (${step.id}) has no ${lang} line`);
  const base = `${nn(k)}-${step.id}`;
  const wav = join(work, 'voice', lang, `${base}.wav`), txt = join(work, 'voice', lang, `${base}.txt`);
  const mp3 = join(tourDir, 'voice', lang, `${base}.mp3`);
  if (args.force || !(await exists(wav)) || (await readFile(txt, 'utf8').catch(() => '')) !== say) {
    // The studio never overwrites a take or its identity receipt, so the old pair moves aside, kept for comparison.
    const stamp = Date.now();
    for (const ext of ['wav', 'identity.json']) {
      const old = join(work, 'voice', lang, `${base}.${ext}`);
      if (await exists(old)) await rename(old, join(work, 'voice', lang, `${base}.replaced-${stamp}.${ext}`));
    }
    await writeFile(txt, say);
    run(python, [join(narrate, 'scripts', 'studio_speech.py'), txt, wav, '--language', lang]);
  }
  const seconds = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]));
  run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-ac', '1', '-ar', '44100', '-b:a', '96k', mp3]);
  assign(step, 'audio', `voice/${lang}/${base}.mp3`);
  assign(step, 'duration', Math.round(seconds * 100) / 100);
  console.log(`voiced ${k + 1}. ${step.id} (${lang}): ${Math.round(seconds * 100) / 100} s`);
}
const plan = { provider: 'local voice studio (narrate-video)', model: 'OmniVoice', revision: args.revision || 'unknown', name: "the author's saved voice profile", language: lang };
tour.voice = {
  credit: tour.voice?.credit || { en: "narrated in the author's own voice", ar: 'بصوت المؤلف نفسه' },
  plan: { ...(tour.voice?.plan && !tour.voice.plan.model ? tour.voice.plan : {}), [lang]: plan },
};
await writeFile(file, JSON.stringify(tour, null, 2) + '\n');
console.log(`Updated ${file}`);
