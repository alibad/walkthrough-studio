#!/usr/bin/env node
// Copy the player into a site, as static files it serves from its own origin (the player must share the app's
// origin to drive it): play.html, play.js, play.css, engine.js and launch.js, plus playable.json naming the
// Walkthrough Studio commit they came from. The site's pages then start a tour with launch.js (see README).
//
//   node player/bundle.mjs --out ../my-app/public/playable
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map((s) => {
  const [k, ...v] = s.trim().split(/\s+/);
  return [k, v.join(' ') || 'true'];
}));
if (!args.out) { console.error('Usage: node player/bundle.mjs --out <folder the site serves, e.g. public/playable>'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(args.out);
const FILES = ['play.html', 'play.js', 'play.css', 'engine.js', 'launch.js'];
await mkdir(out, { recursive: true });
for (const f of FILES) await copyFile(join(here, f), join(out, f));
const git = (a) => spawnSync('git', a, { cwd: here, encoding: 'utf8' }).stdout.trim();
const commit = git(['rev-parse', '--short', 'HEAD']), dirty = git(['status', '--porcelain', '--', '.']) !== '';
await writeFile(join(out, 'playable.json'), JSON.stringify({ from: 'github.com/alibad/walkthrough-studio player/', commit: commit + (dirty ? '+changes' : ''), files: FILES }, null, 2) + '\n');
console.log(`Copied the player (${commit}${dirty ? ', with uncommitted changes' : ''}) into ${out}`);
