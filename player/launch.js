// Playable walkthrough launcher: a "Take the tour" button on a page opens the player over that page, in place, and
// closing it leaves the page as it was. One script tag and one attribute:
//
//   <button type="button" data-playable-tour="/walkthroughs/government/tour.json">Take the 1-minute tour</button>
//   <script src="/playable/launch.js" defer></script>
//
// On the button (all optional): data-playable-lang="ar" (default: the page's <html lang>, when the tour speaks it),
// data-playable-chapter="2" (start at that chapter).
// The page opened with #tour in its address (or #tour=2 for a chapter) opens the player at once, on its cover, so
// a link can say "play this". While the player is open the address carries #tour; closing removes it.
// With no button on the page, <script ... data-tour="<tour.json url>"> adds a floating one (serve.mjs uses this to
// try a tour on a page before the page has a button of its own). window.PlayableLaunch.open({ tour, lang, chapter })
// opens it from script. The player (play.html and its files) sits next to this script.
(function () {
  'use strict';
  // Inside the player, the app runs in an iframe named "app": the launcher stays out of the way there.
  try { if (window.frameElement && window.frameElement.id === 'app' && window.parent.Playable) return; } catch (e) { /* cross-origin parent */ }
  var script = document.currentScript;
  var base = new URL('.', script.src);
  var LABEL = { en: 'Take the {n}-minute tour', ar: 'خذ جولة في {n} دقيقة' };
  var overlay = null, opener = null, hashWas = '';

  // The page's language: its ?lang= when it has one (an app may set <html lang> only once its data has loaded),
  // otherwise <html lang>.
  function pageLang() {
    var q = new URLSearchParams(location.search).get('lang');
    return (q || document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  }

  function open(opts) {
    if (overlay) return;
    opts = opts || {};
    var tour = new URL(opts.tour || script.dataset.tour, location.href);
    var q = new URLSearchParams({ tour: tour.pathname + tour.search, embed: '1' });
    q.set('lang', opts.lang || pageLang());
    if (opts.chapter) q.set('chapter', String(opts.chapter));
    if (opts.autoplay !== false) q.set('autoplay', '1');
    opener = document.activeElement;
    overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', opts.title || 'Walkthrough');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(18,16,14,.55);opacity:0;transition:opacity .28s ease';
    var frame = document.createElement('iframe');
    frame.src = new URL('play.html?' + q, base).href;
    frame.title = opts.title || 'Walkthrough';
    frame.allow = 'autoplay; fullscreen';
    frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent';
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    document.documentElement.style.setProperty('overflow', 'hidden');
    requestAnimationFrame(function () { overlay.style.opacity = '1'; });
    frame.addEventListener('load', function () { try { frame.contentWindow.focus(); } catch (e) { /* */ } });
    hashWas = location.hash;
    if (!/^#tour\b/.test(location.hash)) history.replaceState(history.state, '', '#tour' + (opts.chapter ? '=' + opts.chapter : ''));
  }

  function close() {
    if (!overlay) return;
    var o = overlay;
    overlay = null;
    o.style.opacity = '0';
    setTimeout(function () { o.remove(); }, 300);
    document.documentElement.style.removeProperty('overflow');
    if (/^#tour\b/.test(location.hash)) history.replaceState(history.state, '', location.pathname + location.search + (/^#tour\b/.test(hashWas) ? '' : hashWas));
    if (opener && opener.focus) opener.focus();
  }

  // The player asks to close (its close button, or Escape inside it).
  window.addEventListener('message', function (e) {
    if (e.origin === location.origin && e.data && e.data.type === 'playable:close') close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay) close(); });

  function fromButton(b) {
    return { tour: b.getAttribute('data-playable-tour'), lang: b.getAttribute('data-playable-lang') || undefined,
      chapter: b.getAttribute('data-playable-chapter') || undefined, title: b.textContent.trim() };
  }

  /** A floating button, for a page that has none of its own (labelled with the tour's length in the page's language). */
  function floating(tourUrl) {
    var b = document.createElement('button'), tour = null;
    b.type = 'button';
    b.setAttribute('data-playable-tour', tourUrl);
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg><span></span>';
    // Labelled (and placed: bottom left for a right-to-left page) in the page's language, again if the page changes it.
    var label = function () {
      var lang = pageLang(), minutes = 1;
      if (tour) {
        var l = (tour.langs || [tour.lang || 'en']).indexOf(lang) >= 0 ? lang : tour.lang || 'en';
        var s = tour.steps.reduce(function (a, st) { var d = st.duration; return a + ((d && typeof d === 'object' ? d[l] : d) || 4); }, 0);
        minutes = Math.max(1, Math.round(s / 60));
      }
      b.lastChild.textContent = (LABEL[lang] || LABEL.en).replace('{n}', String(minutes));
      b.style.cssText = 'position:fixed;bottom:20px;' + (document.documentElement.dir === 'rtl' ? 'left' : 'right') + ':20px;z-index:2147482000;display:inline-flex;align-items:center;gap:8px;padding:11px 18px 11px 14px;border:0;border-radius:999px;background:#e4572e;color:#fff;font:600 15px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);cursor:pointer';
    };
    label();
    document.body.appendChild(b);
    new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
    fetch(new URL(tourUrl, location.href)).then(function (r) { return r.json(); }).then(function (t) { tour = t; label(); }).catch(function () { /* keep the plain label */ });
  }

  // A click on any tour button, now or added later by the app, opens it; the page's language is read at that moment.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-playable-tour]');
    if (!b) return;
    e.preventDefault();
    open(fromButton(b));
  });
  // The rest waits for the page to finish loading: an app sets its language and renders its buttons as it starts.
  function boot() {
    setTimeout(function () {
      if (!document.querySelector('[data-playable-tour]') && script.dataset.tour) floating(script.dataset.tour);
      var m = /^#tour(?:=(\d+))?$/.exec(location.hash);
      var first = document.querySelector('[data-playable-tour]');
      if (m && first) { var o = fromButton(first); o.chapter = m[1] || o.chapter; o.autoplay = false; open(o); }
    }, 300);
  }
  window.PlayableLaunch = { open: open, close: close };
  if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);
})();
