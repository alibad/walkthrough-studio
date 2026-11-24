// The player: a tour played live in the real app (the iframe above the bar), with the narration's audio as the
// clock. Pause and the page is the viewer's to click around in; play again and it picks up where it stopped. If the
// viewer changed something while paused (clicked, typed, followed a link), play starts the current chapter over
// from its own address, so the narration never describes a screen the viewer isn't looking at.
//
// The app must be served from this page's origin: the player reaches into the iframe to move the cursor and click.
// Locally, serve.mjs puts both on one origin; on a live site this page sits in the site's own folder.
//
//   play.html?tour=<url of tour.json>&lang=ar&chapter=3
//   &autoplay=1 starts without the cover (the cover comes back if the browser won't play sound yet);
//   &embed=1 is the player opened over a page by launch.js: a close button, and Escape closes.
const { createEngine, estimate, pick, chapters, urlFor } = window.Playable;
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const tourUrl = new URL(qs.get('tour') || 'tour/tour.json', location.href);
const frame = $('app');
const embedded = qs.get('embed') === '1' && window.parent !== window;

const STRINGS = {
  en: {
    eyebrow: 'Playable walkthrough', play: 'Play', pause: 'Pause', open: 'Open this page', close: 'Close the tour',
    fine: (n, t) => `${n} chapters · ${t} · pause any time and the page is yours to try`,
    where: (c, n, title, k, m) => `Chapter ${c} of ${n} · ${title}${m > 1 ? ` · line ${k} of ${m}` : ''}`,
    loading: () => 'Loading the page',
    playing: () => 'Pause any time to try it yourself · ← → move a line',
    going: (title) => `Going to ${title}…`,
    prev: 'Previous line', next: 'Next line', timeline: 'Tour timeline: click or drag to any line',
    pausedTouched: 'Paused · you changed the page, so play starts this line over',
    paused: 'Paused · the page is yours to try · play picks up here',
    ended: "That's the tour · the page is yours to explore",
    failed: (e) => `This step no longer matches the app: ${e}`,
    silent: 'Silent preview, no narration recorded yet · ',
  },
  ar: {
    eyebrow: 'جولة تفاعلية', play: 'تشغيل', pause: 'إيقاف مؤقت', open: 'افتح هذه الصفحة', close: 'أغلق الجولة',
    fine: (n, t) => `${n} فصول · ${t} · أوقف العرض متى شئت، فالصفحة بين يديك`,
    where: (c, n, title, k, m) => `الفصل ${c} من ${n} · ${title}${m > 1 ? ` · الجملة ${k} من ${m}` : ''}`,
    loading: () => 'جارٍ تحميل الصفحة',
    playing: () => 'أوقف العرض متى شئت وجرّب بنفسك · ← → للتنقل بين الجمل',
    going: (title) => `الانتقال إلى ${title}…`,
    prev: 'الجملة السابقة', next: 'الجملة التالية', timeline: 'مسار الجولة: انقر أو اسحب إلى أي جملة',
    pausedTouched: 'متوقف · غيّرت الصفحة، فستبدأ هذه الجملة من جديد',
    paused: 'متوقف · الصفحة بين يديك · يستأنف التشغيل من هنا',
    ended: 'انتهت الجولة · الصفحة بين يديك',
    failed: (e) => `هذه الخطوة لم تعد تطابق الصفحة: ${e}`,
    silent: 'معاينة صامتة، لم يُسجَّل التعليق بعد · ',
  },
};

let tour, steps, chaps, chapterOf = [], lengths = [], offsets = [], total = 0, lang = 'en', S = STRINGS.en;
let i = 0, mode = 'idle', ctl = null, track = null, engine = null, lastPos = null;
let touched = false, expectLoad = false, error = null, silent = false, pendingPause = false;
const broken = new Set();

let paused = false, waiters = [];
const gate = () => (paused ? new Promise((r) => waiters.push(r)) : Promise.resolve());
const release = () => { paused = false; waiters.splice(0).forEach((r) => r()); };

const abortError = () => Object.assign(new Error('stopped'), { name: 'AbortError' });
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); }, { once: true });
});
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The narration for a step: its recorded audio, or a timer standing in for it in a silent preview. */
function makeTrack(step, length) {
  const src = pick(step.audio, lang);
  if (src) {
    const audio = new Audio(new URL(src, tourUrl).href);
    audio.preload = 'auto';
    const ended = new Promise((resolve, reject) => {
      audio.addEventListener('ended', resolve, { once: true });
      audio.addEventListener('error', () => reject(new Error(`The narration ${src} won't play`)), { once: true });
    });
    ended.catch(() => {});
    return {
      time: () => (audio.ended ? Infinity : audio.currentTime),
      position: () => (audio.ended ? length : audio.currentTime),
      play: () => (audio.ended ? Promise.resolve() : audio.play()),
      pause: () => audio.pause(),
      stop: () => { audio.pause(); audio.removeAttribute('src'); audio.load(); },
      ended,
    };
  }
  let acc = 0, since = null, timer, done;
  const ended = new Promise((r) => (done = r));
  const now = () => acc + (since == null ? 0 : (performance.now() - since) / 1000);
  return {
    time: now,
    position: () => Math.min(now(), length),
    play: () => { if (since == null) { since = performance.now(); timer = setTimeout(done, (length - acc) * 1000); } return Promise.resolve(); },
    pause: () => { if (since != null) { acc = now(); since = null; clearTimeout(timer); } },
    stop: () => clearTimeout(timer),
    ended,
  };
}

function here() { try { const l = frame.contentWindow.location; return l.pathname + l.search + l.hash; } catch { return null; } }
function samePage(url) { try { const l = frame.contentWindow.location; return l.origin === url.origin && l.pathname + l.search === url.pathname + url.search; } catch { return false; } }

/**
 * Load a page into the app frame. The frame fades out first and back in once the step's page is ready (arrive).
 * A single-page app's views differ by their #route: going to another route of the same page is a hash change (no
 * load event), and a fresh start of a route reloads it.
 */
async function load(url, signal, fresh = true) {
  if (!frame.classList.contains('fading') && frame.src) { frame.classList.add('fading'); await sleep(220, signal); }
  if (url.hash && samePage(url) && !fresh) {
    frame.contentWindow.location.hash = url.hash;
    await sleep(450, signal);
    return;
  }
  return new Promise((resolve, reject) => {
    const done = () => { frame.removeEventListener('load', done); resolve(); };
    signal.addEventListener('abort', () => { frame.removeEventListener('load', done); reject(abortError()); }, { once: true });
    expectLoad = true;
    frame.classList.add('fading');
    frame.addEventListener('load', done);
    // Setting the same address with a #route is only a hash change; reload it so a fresh start is fresh.
    if (url.hash && samePage(url)) { frame.contentWindow.location.hash = url.hash; frame.contentWindow.location.reload(); }
    else frame.src = url.href;
  });
}

/** Bring the iframe to the step's address if it has one (reloading for a clean start when asked) and wait until it's ready. */
async function arrive(step, fresh, signal) {
  const address = urlFor(step, lang);
  if (address) {
    const url = new URL(address, location.origin);
    if (fresh || here() !== url.pathname + url.search + url.hash) await load(url, signal, fresh);
  }
  const win = frame.contentWindow, doc = win.document;
  const sel = step.ready || (step.do || []).find((a) => a.target)?.target;
  for (let waited = 0; sel && !doc.querySelector(sel); waited += 100) {
    if (waited > 25000) throw new Error(`The page never showed ${sel}`);
    await sleep(100, signal);
  }
  await doc.fonts?.ready;
  if (address) await sleep(300, signal);
  frame.classList.remove('fading');
  if (!engine || engine.doc !== doc) engine = createEngine(win, { from: lastPos || undefined, lang });
  return engine;
}

async function start(n, { fresh = false } = {}) {
  ctl?.abort();
  track?.stop();
  release();
  ctl = new AbortController();
  const { signal } = ctl;
  i = n; touched = false; error = null; pendingPause = false; mode = 'loading'; render();
  const step = steps[n];
  try {
    // Seeking to a line in the middle of a chapter: open the chapter fresh and replay its earlier lines quickly,
    // silently and behind a veil, so the page is exactly where this line expects it.
    const first = chapterStart(n);
    if (fresh && n !== first) {
      veil(S.going(pick(chaps[chapterOf[n]].title, lang)));
      let ff = await arrive(steps[first], true, signal);
      for (let k = first; k < n; k++) {
        if (k > first) ff = await arrive(steps[k], false, signal);
        ff.setSpeed(12);
        try { await ff.runStep(steps[k], { signal, duration: lengths[k] }); } finally { ff.setSpeed(1); }
      }
      fresh = false;
    }
    const eng = await arrive(step, fresh, signal);
    veil(null);
    eng.setIdle(false);
    track = makeTrack(step, lengths[n]);
    mode = 'playing';
    // Pause pressed while the page was loading: arrive, then wait at the start of the step.
    if (pendingPause) { pendingPause = false; paused = true; mode = 'paused'; eng.setIdle(true); }
    render();
    await gate();
    try { await track.play(); } catch (e) {
      // The browser won't play sound before a click on this page (autoplay, or Safari in an overlay): the cover asks.
      if (e.name !== 'NotAllowedError') throw e;
      track.stop(); mode = 'idle'; $('cover').hidden = false; $('bar').hidden = true; $('cover-play').focus(); render();
      return;
    }
    await Promise.all([eng.runStep(step, { clock: track.time, gate, signal, duration: lengths[n] }), track.ended]);
    lastPos = eng.position();
    await sleep(chapterOf[n + 1] !== chapterOf[n] ? 650 : 250, signal);
    await gate();
    if (signal.aborted) return;
    if (n + 1 < steps.length) return start(n + 1);
    mode = 'ended'; eng.setIdle(true); eng.clear(); render();
  } catch (e) {
    if (signal.aborted || e.name === 'AbortError') return;
    frame.classList.remove('fading'); veil(null);
    if (e.name === 'MissingTarget') broken.add(chapterOf[n]);
    track?.stop();
    error = e.message; mode = 'failed'; render();
  }
}

const chapterStart = (n) => chaps[chapterOf[n]].first;

/** A veil over the page while the player gets it ready (a seek replays earlier lines behind it); null lifts it. */
function veil(text) {
  $('veil').hidden = !text;
  if (text) $('veil-text').textContent = text;
}

function pause() {
  if (mode !== 'playing') return;
  paused = true; track?.pause(); engine?.setIdle(true); mode = 'paused'; render();
}

function play() {
  $('cover').hidden = true; $('bar').hidden = false;
  if (mode === 'paused') {
    if (touched) return start(i, { fresh: true });
    engine?.setIdle(false); mode = 'playing'; release(); track?.play(); render();
    return;
  }
  if (mode === 'ended') return start(0, { fresh: true });
  if (mode === 'idle') return start(i);
  if (mode === 'failed') return start(chapterStart(i), { fresh: true });
}

function toggle() {
  if (mode === 'loading') { pendingPause = !pendingPause; render(); return; }
  if (mode === 'playing') pause(); else play();
}

/** Go to any line: its chapter opens fresh and the lines before it in that chapter are replayed out of sight. */
function seekTo(n) { $('cover').hidden = true; $('bar').hidden = false; start(Math.max(0, Math.min(steps.length - 1, n)), { fresh: true }); }
function seek(c) { seekTo(chaps[c].first); }
/** Back a line, or to the start of this one when it has been playing a while. */
function prevLine() { seekTo(track && track.position() > 1.5 ? i : i - 1); }
function nextLine() { if (i + 1 < steps.length) seekTo(i + 1); }

/** The line at a point on the timeline: each chapter's segment is as wide as its narration, its lines in order. */
function lineAt(clientX) {
  for (const [c, el] of [...$('track').children].entries()) {
    const r = el.getBoundingClientRect();
    if (clientX < r.left - 2 || clientX > r.right + 2) continue;
    let f = (clientX - r.left) / r.width;
    if (document.documentElement.dir === 'rtl') f = 1 - f;
    const ks = chaps[c].steps, len = ks.reduce((a, k) => a + lengths[k], 0);
    let t = Math.max(0, Math.min(0.999, f)) * len;
    for (const k of ks) { if (t < lengths[k]) return k; t -= lengths[k]; }
    return ks[ks.length - 1];
  }
  return null;
}

// The viewer taking over: a real click or key press inside the app pauses the tour and marks the page as changed.
// A load nobody asked for (the viewer followed a link) counts the same way.
function watch() {
  let doc;
  try { doc = frame.contentWindow.document; } catch { return; }
  const took = (e) => { if (!e.isTrusted) return; touched = true; if (mode === 'playing') pause(); render(); };
  doc.addEventListener('pointerdown', took, true);
  doc.addEventListener('keydown', took, true);
}
frame.addEventListener('load', () => {
  if (frame.contentWindow.location.href === 'about:blank') return;
  if (expectLoad) expectLoad = false;
  else { touched = true; if (mode === 'playing') pause(); }
  watch();
  $('open').href = frame.contentWindow.location.href;
  if (steps) render();
});

function stateText() {
  const c = chapterOf[i] + 1, n = chaps.length;
  switch (mode) {
    case 'loading': return S.loading(c, n);
    case 'playing': return S.playing(c, n);
    case 'paused': return touched ? S.pausedTouched : S.paused;
    case 'ended': return S.ended;
    case 'failed': return S.failed(error);
    default: return '';
  }
}

function render() {
  const going = mode === 'playing' || (mode === 'loading' && !pendingPause);
  document.body.classList.toggle('playing', going);
  $('toggle').setAttribute('aria-label', going ? S.pause : S.play);
  const ch = chaps[chapterOf[i]];
  $('where').textContent = S.where(chapterOf[i] + 1, chaps.length, pick(ch.title, lang), ch.steps.indexOf(i) + 1, ch.steps.length);
  $('caption').textContent = pick(steps[i].say, lang);
  const s = $('state');
  s.textContent = (silent ? S.silent : '') + stateText();
  s.classList.toggle('warn', mode === 'failed' || silent);
  [...$('track').children].forEach((el, c) => { el.classList.toggle('on', c === chapterOf[i]); el.classList.toggle('broken', broken.has(c)); });
}

function tick() {
  const pos = mode === 'ended' ? total : offsets[i] + Math.min(track && (mode === 'playing' || mode === 'paused') ? track.position() : 0, lengths[i]);
  $('time').textContent = `${fmt(pos)} / ${fmt(total)}`;
  [...$('track').children].forEach((el, c) => {
    const a = offsets[chaps[c].first], b = chaps[c].steps.reduce((sum, k) => sum + lengths[k], 0);
    el.firstChild.style.width = `${(Math.max(0, Math.min(1, (pos - a) / b)) * 100).toFixed(2)}%`;
  });
  requestAnimationFrame(tick);
}

async function boot() {
  tour = await fetch(tourUrl).then((r) => { if (!r.ok) throw new Error(`No tour at ${tourUrl}`); return r.json(); });
  steps = tour.steps;
  const langs = tour.langs || [tour.lang || 'en'];
  lang = langs.includes(qs.get('lang')) ? qs.get('lang') : tour.lang || langs[0];
  S = STRINGS[lang] || STRINGS.en;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  chaps = chapters(tour);
  chaps.forEach((c, k) => c.steps.forEach((s) => (chapterOf[s] = k)));
  silent = steps.some((s) => !pick(s.audio, lang));
  lengths = steps.map((s) => pick(s.duration, lang) || estimate(s.say, lang));
  offsets = lengths.map((_, k) => lengths.slice(0, k).reduce((a, b) => a + b, 0));
  total = lengths.reduce((a, b) => a + b, 0);
  const title = pick(tour.title, lang);
  document.title = `${title} · ${S.eyebrow}`;
  document.querySelector('.eyebrow').textContent = S.eyebrow;
  document.querySelector('#cover-play span').textContent = S.play;
  $('open').firstChild.textContent = `${S.open} `;
  $('cover-title').textContent = title;
  $('cover-lede').textContent = pick(tour.lede, lang) || '';
  const credit = pick(tour.voice?.credit, lang);
  $('cover-fine').textContent = S.fine(chaps.length, fmt(total)) + (credit ? ` · ${credit}` : '') + (silent ? ` · ${S.silent.replace(/ · $/, '')}` : '');
  chaps.forEach((c, k) => {
    const b = document.createElement('button');
    const name = `${k + 1}. ${pick(c.title, lang)}`;
    const len = c.steps.reduce((sum, s) => sum + lengths[s], 0);
    b.type = 'button'; b.className = 'seg'; b.tabIndex = -1;
    b.style.flexGrow = String(len);
    b.append(document.createElement('i'));
    // A mark where each of the chapter's later lines starts.
    let at = 0;
    c.steps.slice(0, -1).forEach((s) => { at += lengths[s]; const m = document.createElement('b'); m.style.insetInlineStart = `${(at / len) * 100}%`; b.append(m); });
    const label = document.createElement('span'); label.textContent = name; b.append(label);
    $('track').append(b);
  });
  // The timeline: click or drag anywhere to go to that line; hovering shows which line it is.
  const trackEl = $('track'), tip = $('tip');
  let dragging = false, hover = null;
  const show = (x) => {
    const k = lineAt(x);
    if (k == null) { tip.hidden = true; return null; }
    const r = trackEl.getBoundingClientRect();
    tip.textContent = `${chapterOf[k] + 1}. ${pick(chaps[chapterOf[k]].title, lang)} — ${pick(steps[k].say, lang)}`;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(r.width - w, x - r.left - w / 2))}px`;
    return k;
  };
  trackEl.addEventListener('pointermove', (e) => { hover = show(e.clientX); });
  trackEl.addEventListener('pointerleave', () => { if (!dragging) tip.hidden = true; });
  trackEl.addEventListener('pointerdown', (e) => { dragging = true; try { trackEl.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ } hover = show(e.clientX); });
  trackEl.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false; tip.hidden = true;
    const k = lineAt(e.clientX);
    if (k != null) seekTo(k);
  });
  trackEl.setAttribute('aria-label', S.timeline);
  $('prev').setAttribute('aria-label', S.prev); $('prev').title = S.prev;
  $('next').setAttribute('aria-label', S.next); $('next').title = S.next;
  $('prev').addEventListener('click', prevLine);
  $('next').addEventListener('click', nextLine);
  const c0 = Math.min(Math.max(0, Number(qs.get('chapter') || 1) - 1), chaps.length - 1);
  i = chaps[c0].first;
  render();
  const close = () => window.parent.postMessage({ type: 'playable:close' }, location.origin);
  if (embedded) {
    document.body.classList.add('embed');
    $('close').hidden = false;
    $('close').setAttribute('aria-label', S.close); $('close').title = S.close;
    $('close').addEventListener('click', close);
  }
  $('cover').hidden = qs.get('autoplay') === '1';
  $('cover-play').addEventListener('click', play);
  $('toggle').addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && embedded) { close(); return; }
    if (e.target.closest?.('a, input') || (e.key === ' ' && e.target.closest?.('button'))) return;
    // Arrows move a line; with Shift, a chapter (mirrored for right-to-left).
    const c = chapterOf[i], next = lang === 'ar' ? 'ArrowLeft' : 'ArrowRight', prev = lang === 'ar' ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === next) { e.preventDefault(); if (e.shiftKey) { if (c + 1 < chaps.length) seek(c + 1); } else nextLine(); }
    else if (e.key === prev) { e.preventDefault(); if (e.shiftKey) seek(c > 0 && i === chaps[c].first ? c - 1 : c); else prevLine(); }
  });
  if (qs.get('autoplay') === '1') play();
  else await load(new URL(urlFor(steps[i], lang), location.origin), new AbortController().signal).then(() => frame.classList.remove('fading'));
  requestAnimationFrame(tick);
}

boot().catch((e) => { document.body.textContent = `The walkthrough couldn't start: ${e.message}`; });
