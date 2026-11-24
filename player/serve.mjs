#!/usr/bin/env node
// Serve a playable walkthrough locally: the player at /__play/, the tour at /__play/tour/, and everything else
// proxied to the running app, so the player and the app share one origin (the player has to reach into the app's
// iframe to move the cursor and click). WebSocket upgrades are proxied too, so a dev server's hot reload keeps
// working instead of polling and reloading the page under the tour.
//
//   node player/serve.mjs --app http://localhost:5270 --tour ../my-app/tours/intro --port 5390 [--inject]
//   open http://localhost:5390/__play/
// --inject adds the launcher (launch.js) to every page of the app it proxies, with a floating "Take the tour"
// button where the page has no button of its own, so a tour can be started from the page itself before the app
// ships the launcher.
import http from 'node:http';
import net from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map((s) => {
  const [k, ...v] = s.trim().split(/\s+/);
  return [k, v.join(' ') || 'true'];
}));
if (!args.app || !args.tour) {
  console.error('Usage: node player/serve.mjs --app <http://host:port of the running app> --tour <tour folder> [--port 5390]');
  process.exit(2);
}
const app = new URL(args.app);
const port = Number(args.port || 5390);
const playerDir = dirname(fileURLToPath(import.meta.url));
const tourDir = resolve(args.tour);
const PLAYER_FILES = new Set(['play.html', 'play.js', 'play.css', 'engine.js', 'launch.js']);
const inject = Boolean(args.inject);
const LAUNCHER = '<script src="/__play/launch.js" data-tour="/__play/tour/tour.json" defer></script>';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function sendFile(res, file, root) {
  const full = resolve(root, file);
  if (full !== root && !full.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    if (!(await stat(full)).isFile()) throw Error('not a file');
    res.writeHead(200, { 'content-type': TYPES[extname(full).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(full));
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); }
}

function proxy(req, res) {
  const page = inject && req.method === 'GET' && /text\/html/.test(req.headers.accept || '');
  const headers = { ...req.headers, host: app.host, ...(page ? { 'accept-encoding': 'identity' } : {}) };
  const out = http.request({ hostname: app.hostname, port: app.port || 80, method: req.method, path: req.url, headers }, (r) => {
    if (!page || !/text\/html/.test(r.headers['content-type'] || '') || r.headers['content-encoding']) { res.writeHead(r.statusCode, r.headers); r.pipe(res); return; }
    const chunks = [];
    r.on('data', (c) => chunks.push(c));
    r.on('end', () => {
      const html = Buffer.concat(chunks).toString('utf8');
      const h = { ...r.headers };
      delete h['content-length'];
      res.writeHead(r.statusCode, h);
      res.end(html.includes('</body>') ? html.replace('</body>', `${LAUNCHER}</body>`) : html + LAUNCHER);
    });
  });
  out.on('error', (e) => { if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' }); res.end(`The app at ${app.origin} didn't answer: ${e.message}`); });
  req.pipe(out);
}

const server = http.createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/__play') { res.writeHead(302, { location: '/__play/' }).end(); return; }
  if (path.startsWith('/__play/tour/')) return sendFile(res, path.slice('/__play/tour/'.length), tourDir);
  if (path.startsWith('/__play/')) {
    const name = path.slice('/__play/'.length) || 'play.html';
    if (!PLAYER_FILES.has(name)) { res.writeHead(404).end(); return; }
    return sendFile(res, name, playerDir);
  }
  proxy(req, res);
});

server.on('upgrade', (req, socket, head) => {
  const up = net.connect({ host: app.hostname, port: Number(app.port || 80), autoSelectFamily: true }, () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let k = 0; k < req.rawHeaders.length; k += 2) lines.push(`${req.rawHeaders[k]}: ${/^host$/i.test(req.rawHeaders[k]) ? app.host : req.rawHeaders[k + 1]}`);
    up.write(lines.join('\r\n') + '\r\n\r\n');
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  const close = () => { socket.destroy(); up.destroy(); };
  up.on('error', close); socket.on('error', close);
});

server.listen(port, 'localhost', () => {
  console.log(`Playable walkthrough: http://localhost:${port}/__play/`);
  console.log(`  app  ${app.origin} (proxied)`);
  console.log(`  tour ${join(tourDir, 'tour.json')}`);
  if (inject) console.log(`  launcher on every app page: open http://localhost:${port}${'/'} and press "Take the tour"`);
});
