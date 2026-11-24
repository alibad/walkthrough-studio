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

  const ARROW = (px) => `<svg viewBox="0 0 24 24" width="${px}" height="${px}" aria-hidden="true" style="display:block;transform-origin:4px 3px;transition:transform .12s ease"><path d="M4 2.5v17.2l4.6-4.4 2.9 6.6 2.9-1.3-2.9-6.5h6.4z" fill="#161616" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  const ACCENT = '228, 87, 46';
  const LEAD = 0.55; // start moving this long before the cue word, so the cursor lands as the word is said
  const GLIDE = 460; // ms the highlight takes to glide from one thing to the next
  // Ease in and out: calm starts and calm landings, for the cursor and the highlight alike.
  const EASE = 'cubic-bezier(.45,.05,.25,1)';
  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

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

  const describe = (a) => (a.text ? `${a.target} containing "${typeof a.text === 'object' ? Object.values(a.text)[0] : a.text}"` : a.target);

  /**
   * options: lang; speed (above 1 compresses moves, waits and cue times, for checks); from (where the cursor starts);
   * cursorSize (px, default 24); margins ({ top, bottom } px a target must clear, or the page scrolls it into view);
   * onFocus(focus), called as each action turns to what it's about, for a film's camera: { rect, zoom, viewport }
   * frames a box, { wide: true } shows the whole page.
   */
  function createEngine(win, options) {
    options = options || {};
    const doc = win.document;
    const lang = options.lang || 'en';
    const speed = options.speed || 1;
    const size = options.cursorSize || 24;
    let pos = options.from || { x: Math.round(win.innerWidth * 0.62), y: Math.round(win.innerHeight * 0.55) };
    let layer, cursor, ring, anchor = null, raf = 0, glide = null;

    const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

    function mount() {
      if (layer && layer.isConnected) return;
      layer = doc.createElement('div');
      layer.setAttribute('data-playable', '');
      layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
      ring = doc.createElement('div');
      ring.style.cssText = `position:fixed;left:0;top:0;width:0;height:0;box-sizing:border-box;border:2px solid rgba(${ACCENT},.92);border-radius:12px;box-shadow:0 0 0 4px rgba(${ACCENT},.13),0 6px 22px rgba(${ACCENT},.10);opacity:0;transform:scale(1);transition:opacity .38s ease,transform .38s ${EASE}`;
      cursor = doc.createElement('div');
      cursor.innerHTML = ARROW(size);
      cursor.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;margin:${-size / 8}px 0 0 ${-size / 6}px;filter:drop-shadow(0 1.5px 2.5px rgba(0,0,0,.3));transition:opacity .35s ease;will-change:transform`;
      cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      layer.append(ring, cursor);
      doc.body.append(layer);
      cancelAnimationFrame(raf);
      // The highlight follows its element as the page scrolls, and glides (eased) from the last element to the next,
      // both ends measured live, so a glide during a scroll still lands on the element and not where it was.
      const follow = () => {
        if (anchor && anchor.isConnected) {
          let r = rectOf(anchor);
          if (glide) {
            const p = Math.min(1, (performance.now() - glide.at) / (GLIDE / speed)), e = easeInOut(p);
            const f = glide.el && glide.el.isConnected ? rectOf(glide.el) : glide.r;
            r = { x: f.x + (r.x - f.x) * e, y: f.y + (r.y - f.y) * e, w: f.w + (r.w - f.w) * e, h: f.h + (r.h - f.h) * e };
            if (p >= 1) glide = null;
          }
          const p = 6;
          ring.style.left = `${r.x - p}px`; ring.style.top = `${r.y - p}px`;
          ring.style.width = `${r.w + 2 * p}px`; ring.style.height = `${r.h + 2 * p}px`;
        } else if (anchor) { anchor = null; glide = null; ring.style.opacity = '0'; }
        raf = win.requestAnimationFrame(follow);
      };
      raf = win.requestAnimationFrame(follow);
    }

    /** Tell a film's camera what this action is about: the action's own element, a `camera.frame` element, or the whole page. */
    function focus(a, el) {
      if (!options.onFocus) return;
      const c = a.camera;
      if (c === 'hold') return;
      if (c === 'wide' || (!el && c == null)) { options.onFocus({ wide: true }); return; }
      const target = c && c.frame ? find({ target: c.frame, text: c.text }) : el;
      if (!target) { options.onFocus({ wide: true }); return; }
      const r = target.getBoundingClientRect();
      options.onFocus({ rect: { x: r.left, y: r.top, width: r.width, height: r.height }, scroll: win.scrollY,
        zoom: typeof c === 'number' ? c : c && c.zoom, viewport: { width: win.innerWidth, height: win.innerHeight } });
    }

    function find(a) {
      const all = Array.from(doc.querySelectorAll(a.target));
      const text = pick(a.text, lang); // one string, or one per language ({ "en": "Play", "ar": "تشغيل" })
      const hits = text ? all.filter((e) => (e.innerText || e.textContent || '').includes(text)) : all;
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

    // What counts as on screen: a film keeps targets out of the bottom of the page, where its captions sit.
    const margins = Object.assign({ top: 64, bottom: 24 }, options.margins);
    async function reveal(el, block, signal) {
      const r = el.getBoundingClientRect();
      if (r.top >= margins.top && r.bottom <= win.innerHeight - margins.bottom) return;
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
      if (d < 2) return;
      // Unhurried: about half a second for a short hop, never more than 1.1 s across the screen.
      const ms = Math.round(Math.min(1100, Math.max(480, 380 + d * 0.6)) / speed);
      cursor.style.transition = `transform ${ms}ms ${EASE}, opacity .35s ease`;
      cursor.style.transform = `translate(${to.x}px, ${to.y}px)`;
      pos = to;
      await sleep(ms + 60, signal);
    }

    function highlight(el) {
      mount();
      if (anchor === el) return;
      const shown = anchor && anchor.isConnected && ring.style.opacity === '1';
      if (shown) glide = { el: anchor, r: rectOf(anchor), at: performance.now() };
      else {
        // Appearing: a soft settle from slightly larger, not a pop.
        glide = null;
        ring.style.transition = 'none'; ring.style.transform = 'scale(1.035)';
        void ring.offsetWidth;
        ring.style.transition = `opacity .38s ease,transform .38s ${EASE}`; ring.style.transform = 'scale(1)';
      }
      anchor = el; ring.style.opacity = '1';
    }
    function clear() { anchor = null; glide = null; if (ring) ring.style.opacity = '0'; }

    /** A click: the arrow dips, and a thin ring spreads and fades where it landed. */
    async function press(signal) {
      const arrow = cursor.firstElementChild;
      arrow.style.transform = 'scale(.86)';
      const dot = doc.createElement('div');
      dot.style.cssText = `position:fixed;left:${pos.x - 16}px;top:${pos.y - 16}px;width:32px;height:32px;border-radius:50%;border:2px solid rgba(${ACCENT},.6);background:rgba(${ACCENT},.10);transform:scale(.35);opacity:1;transition:transform .55s ${EASE},opacity .55s ease-out`;
      layer.append(dot);
      win.requestAnimationFrame(() => win.requestAnimationFrame(() => { dot.style.transform = 'scale(1.35)'; dot.style.opacity = '0'; }));
      setTimeout(() => dot.remove(), 800);
      await sleep(140 / speed, signal);
      arrow.style.transform = 'scale(1)';
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

    /** "optional": true skips an action whose target isn't on the page (a "New chat" button only some visitors see). */
    async function act(a, signal) {
      if (a.optional && a.target) { try { find(a); } catch (e) { if (e.name === 'MissingTarget') return undefined; throw e; } }
      switch (a.do) {
        case 'wait': {
          // "for": a selector to wait for (an answer, search results), for up to "ms" (default 20 s); else a pause.
          if (!a.for) return sleep((a.ms == null ? 500 : a.ms) / speed, signal);
          for (let t = 0; ; t += 100) {
            try { find({ target: a.for, text: a.text }); return undefined; } catch (e) { if (e.name !== 'MissingTarget') throw e; }
            if (t > (a.ms || 20000)) throw new MissingTarget(`${describe({ target: a.for, text: a.text })} never appeared`);
            await sleep(100, signal);
          }
        }
        case 'clear': return clear();
        case 'scroll': {
          const el = find(a);
          el.scrollIntoView({ behavior: speed > 1 ? 'auto' : 'smooth', block: a.block || 'start' });
          await settle(signal);
          return focus(a, null);
        }
        case 'point': case 'click': case 'type': {
          const el = find(a);
          await reveal(el, a.block, signal);
          focus(a, el);
          if (a.do === 'click') clear();
          await move(aim(el), signal);
          if (a.do === 'point') { highlight(el); return a.hold ? sleep(a.hold / speed, signal) : undefined; }
          await press(signal);
          if (a.do === 'click') { el.click(); return sleep(250 / speed, signal); }
          highlight(el);
          await type(el, String(pick(a.value, lang) == null ? '' : pick(a.value, lang)), signal);
          // "submit": true sends the field's form, as pressing Enter would (a search box that answers on submit).
          if (a.submit && el.form) { await sleep(250 / speed, signal); el.form.requestSubmit(); }
          return undefined;
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
