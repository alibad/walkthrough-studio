// Playable engine: performs a walkthrough step on a real page the way a person would, with a visible cursor, a
// highlight on what is being talked about, real clicks and real typing. One engine serves three uses:
// the player plays a tour live inside an iframe (play.js), the recorder films it for an MP4 (record.mjs), and the
// checker runs it headless to prove the tour still matches the app (check.mjs).
//
// Actions run against a clock. Live, the clock is the narration's audio, so pausing the voice pauses the actions
// and they can never run ahead of what is being said. Filmed or checked, the clock is elapsed time.
//
// An action's moment is either `at` (seconds into the narration) or `cue` (a phrase from the step's `say`). A cue
// becomes a time from where the phrase falls in the sentence, scaled to the narration's measured duration, so a
// re-recorded voice moves the actions with it and nobody retimes anything by hand.
(function (root) {
  'use strict';

  const ARROW = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 2.5v17.2l4.6-4.4 2.9 6.6 2.9-1.3-2.9-6.5h6.4z" fill="#141414" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const ACCENT = '#e4572e';
  const LEAD = 0.45; // start moving this long before the cue word, so the cursor lands as the word is said

  function abortError() { const e = new Error('Step stopped'); e.name = 'AbortError'; return e; }
  class MissingTarget extends Error { constructor(m) { super(m); this.name = 'MissingTarget'; } }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(abortError());
      const stop = () => { clearTimeout(t); reject(abortError()); };
      const t = setTimeout(() => { if (signal) signal.removeEventListener('abort', stop); resolve(); }, Math.max(0, ms));
      if (signal) signal.addEventListener('abort', stop, { once: true });
    });
  }

  /** A tour field that is either one value or one per language ({ "en": ..., "ar": ... }), for `lang`. */
  const pick = (v, lang) => (v == null || typeof v !== 'object' || Array.isArray(v) ? v : v[lang] != null ? v[lang] : v.en != null ? v.en : Object.values(v)[0]);
  const words = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length;
  /** Seconds a line takes to say, for a step with no recorded narration yet. */
  const estimate = (say, lang) => Math.max(2.5, words(pick(say, lang)) / 2.5 + 0.8);

  /**
   * The step's actions with every `cue` turned into an `at`, for a narration in `lang` lasting `duration` seconds.
   * A cue is found in that language's line; failing that (an English cue on an Arabic line), its place in the
   * English line stands in, since a phrase sits at about the same point of a sentence in either language.
   */
  function schedule(step, duration, lang) {
    const say = pick(step.say, lang) || '', base = pick(step.say, 'en') || say;
    return (step.do || []).map((a) => {
      if (a.at != null || !a.cue) return a;
      const find = (line, cue) => (cue == null ? -1 : line.toLowerCase().indexOf(String(cue).toLowerCase()));
      let k = find(say, pick(a.cue, lang)), len = say.length;
      if (k < 0) { k = find(base, pick(a.cue, 'en')); len = base.length; }
      if (k < 0) throw new Error(`Step "${step.id}": the cue "${pick(a.cue, lang)}" isn't in what the step says`);
      return Object.assign({}, a, { at: Math.max(0, Math.round((duration * k / len - LEAD) * 100) / 100) });
    });
  }

  const describe = (a) => (a.text ? `${a.target} containing "${a.text}"` : a.target);

  function createEngine(win, options) {
    options = options || {};
    const doc = win.document;
    const lang = options.lang || 'en';
    const speed = options.speed || 1; // above 1 compresses moves, waits and cue times, for checks
    let pos = options.from || { x: Math.round(win.innerWidth * 0.62), y: Math.round(win.innerHeight * 0.55) };
    let layer, cursor, ring, anchor = null, raf = 0;

    function mount() {
      if (layer && layer.isConnected) return;
      layer = doc.createElement('div');
      layer.setAttribute('data-playable', '');
      layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
      ring = doc.createElement('div');
      ring.style.cssText = `position:fixed;left:0;top:0;width:0;height:0;box-sizing:border-box;border:2.5px solid ${ACCENT};border-radius:12px;box-shadow:0 0 0 5px rgba(228,87,46,.16);opacity:0;transition:opacity .3s ease`;
      cursor = doc.createElement('div');
      cursor.innerHTML = ARROW;
      cursor.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-3px 0 0 -4px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));transition:opacity .3s ease;will-change:transform';
      cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      layer.append(ring, cursor);
      doc.body.append(layer);
      cancelAnimationFrame(raf);
      const follow = () => {
        if (anchor && anchor.isConnected) {
          const r = anchor.getBoundingClientRect(), p = 6;
          ring.style.left = `${r.left - p}px`; ring.style.top = `${r.top - p}px`;
          ring.style.width = `${r.width + 2 * p}px`; ring.style.height = `${r.height + 2 * p}px`;
        } else if (anchor) { anchor = null; ring.style.opacity = '0'; }
        raf = win.requestAnimationFrame(follow);
      };
      raf = win.requestAnimationFrame(follow);
    }

    function find(a) {
      const all = Array.from(doc.querySelectorAll(a.target));
      const hits = a.text ? all.filter((e) => (e.innerText || e.textContent || '').includes(a.text)) : all;
      const el = hits.find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || hits[0];
      if (!el) throw new MissingTarget(`Can't find ${describe(a)}`);
      return el;
    }

    async function settle(signal) {
      let last = NaN, still = 0;
      for (let k = 0; k < 80 && still < 4; k++) {
        await sleep(40, signal);
        const y = win.scrollY;
        still = y === last ? still + 1 : 0;
        last = y;
      }
    }

    async function reveal(el, block, signal) {
      const r = el.getBoundingClientRect();
      if (r.top >= 64 && r.bottom <= win.innerHeight - 24) return;
      el.scrollIntoView({ behavior: speed > 1 ? 'auto' : 'smooth', block: block || 'center' });
      await settle(signal);
    }

    /**
     * Where the cursor goes on an element: near the top of something taller than half the screen, the middle of
     * something mid-sized, and the lower right of a small control or label, so the arrow doesn't cover its words.
     */
    function aim(el) {
      const r = el.getBoundingClientRect();
      const tall = r.height > win.innerHeight * 0.5, small = r.height < 64;
      const x = tall ? r.left + Math.min(r.width / 2, 140) : r.left + r.width * (small ? 0.78 : 0.5);
      const y = tall ? r.top + 32 : r.top + r.height * (small ? 0.82 : 0.5);
      return { x: Math.round(Math.min(Math.max(x, 24), win.innerWidth - 24)), y: Math.round(Math.min(Math.max(y, 24), win.innerHeight - 24)) };
    }

    async function move(to, signal) {
      mount();
      const d = Math.hypot(to.x - pos.x, to.y - pos.y);
      const ms = Math.round(Math.min(1000, Math.max(320, 280 + d * 0.55)) / speed);
      cursor.style.transition = `transform ${ms}ms cubic-bezier(.25,.75,.25,1), opacity .3s ease`;
      cursor.style.transform = `translate(${to.x}px, ${to.y}px)`;
      pos = to;
      await sleep(ms + 40, signal);
    }

    function highlight(el) { mount(); anchor = el; ring.style.opacity = '1'; }
    function clear() { anchor = null; if (ring) ring.style.opacity = '0'; }

    async function press(signal) {
      const dot = doc.createElement('div');
      dot.style.cssText = `position:fixed;left:${pos.x - 18}px;top:${pos.y - 18}px;width:36px;height:36px;border-radius:50%;background:rgba(228,87,46,.38);transform:scale(.3);transition:transform .45s ease-out,opacity .45s ease-out`;
      layer.append(dot);
      win.requestAnimationFrame(() => win.requestAnimationFrame(() => { dot.style.transform = 'scale(1.5)'; dot.style.opacity = '0'; }));
      setTimeout(() => dot.remove(), 700);
      await sleep(160 / speed, signal);
    }

    async function type(el, value, signal) {
      el.focus();
      const proto = el instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
      const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
      // The native setter plus an input event is what a framework-controlled field listens for.
      for (let k = 0; k <= value.length; k++) {
        set.call(el, value.slice(0, k));
        el.dispatchEvent(new win.Event('input', { bubbles: true }));
        if (k < value.length) await sleep(95 / speed, signal);
      }
    }

    async function act(a, signal) {
      switch (a.do) {
        case 'wait': return sleep((a.ms == null ? 500 : a.ms) / speed, signal);
        case 'clear': return clear();
        case 'scroll': {
          const el = find(a);
          el.scrollIntoView({ behavior: speed > 1 ? 'auto' : 'smooth', block: a.block || 'start' });
          return settle(signal);
        }
        case 'point': case 'click': case 'type': {
          const el = find(a);
          await reveal(el, a.block, signal);
          if (a.do === 'click') clear();
          await move(aim(el), signal);
          if (a.do === 'point') { highlight(el); return a.hold ? sleep(a.hold / speed, signal) : undefined; }
          await press(signal);
          if (a.do === 'click') { el.click(); return sleep(250 / speed, signal); }
          highlight(el);
          return type(el, String(pick(a.value, lang) == null ? '' : pick(a.value, lang)), signal);
        }
        default: throw new Error(`Unknown action "${a.do}"`);
      }
    }

    /**
     * Play one step's actions. `clock()` returns seconds into the narration (the audio's time, live); `gate()`
     * resolves when the player isn't paused; `duration` is the narration's length, which places the cues.
     */
    async function runStep(step, opts) {
      opts = opts || {};
      const signal = opts.signal, gate = opts.gate || (() => Promise.resolve());
      const duration = opts.duration || pick(step.duration, lang) || estimate(step.say, lang);
      const t0 = performance.now();
      const clock = opts.clock || (() => ((performance.now() - t0) / 1000) * speed);
      mount();
      for (const a of schedule(step, duration, lang)) {
        if (a.at != null) while (clock() < a.at) { await gate(); await sleep(40, signal); }
        await gate();
        if (signal && signal.aborted) throw abortError();
        await act(a, signal);
      }
    }

    function setIdle(idle) { mount(); cursor.style.opacity = idle ? '0.35' : '1'; }
    function destroy() { cancelAnimationFrame(raf); if (layer) layer.remove(); }

    return { win, doc, runStep, act, find, setIdle, clear, destroy, position: () => Object.assign({}, pos) };
  }

  /**
   * A tour's chapters: a step with a `chapter` title (and a `url`) starts one, and the steps after it without a
   * title continue it on the same page. Seeking, and starting over after the viewer changed the page, go to a
   * chapter's first step, so only those need to be able to start from a fresh page.
   */
  function chapters(tour) {
    const out = [];
    tour.steps.forEach((s, k) => {
      if (k === 0 || s.chapter != null) {
        if (!s.url) throw new Error(`Step "${s.id}" starts a chapter, so it needs a url`);
        out.push({ title: s.chapter != null ? s.chapter : s.title, first: k, steps: [] });
      }
      out[out.length - 1].steps.push(k);
    });
    return out;
  }
  /** A step's address in `lang`: "{lang}" in the url becomes the language code. */
  const urlFor = (step, lang) => step.url && String(step.url).split('{lang}').join(lang);

  root.Playable = { createEngine, schedule, estimate, pick, chapters, urlFor, MissingTarget, version: 1 };
})(typeof window !== 'undefined' ? window : globalThis);
