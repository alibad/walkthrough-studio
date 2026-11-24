// Recorded answers for a service a headless browser can't reach, for films and checks only; the live player always
// asks the real service. A tour lists them under "replay":
//
//   "replay": [{
//     "url": "cloudfunctions\\.net/ask",                       // a regular expression for the request
//     "body": { "en": "replay/ask-en.ndjson", "ar": "replay/ask-ar.ndjson" },   // files in the tour folder
//     "contentType": "application/x-ndjson",
//     "delay": 2500,                                           // ms before it answers, as the real one takes time
//     "why": "Ask is behind Firebase App Check, which a headless browser fails; this answer was recorded in a real browser"
//   }]
//
// Record the body from the real service in a real browser, and say where and when in "why": a film's evidence
// names every replayed request.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const pick = (v, lang) => (v == null || typeof v !== 'object' ? v : v[lang] ?? v.en ?? Object.values(v)[0]);

export async function replayRoutes(context, tour, tourDir, lang) {
  const used = [];
  for (const r of tour.replay || []) {
    const file = pick(r.body, lang);
    const body = await readFile(join(tourDir, file), 'utf8');
    const entry = { url: r.url, file, why: r.why || '', hits: 0 };
    await context.route(new RegExp(r.url), async (route) => {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      entry.hits++;
      await new Promise((res) => setTimeout(res, r.delay ?? 0));
      return route.fulfill({ status: 200, contentType: r.contentType || 'application/json', headers: cors, body });
    });
    used.push(entry);
  }
  return used; // each entry counts its hits, so a film can say which of its requests were replayed
}
