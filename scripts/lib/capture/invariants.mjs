/**
 * The quality invariants, in one place, enforced identically for every backend.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * The invariants used to live inside `walk-wikipedia.mjs`, which meant they
 * were properties of *one script* rather than of the system. Any second walk
 * script re-implemented them from memory, and a second capture backend would
 * have re-implemented them differently or not at all.
 *
 * ── The rule that shaped the design: VERIFY, DON'T TRUST ──────────────────
 *
 * Every assertion here measures the *result* rather than trusting the option
 * that was passed. That is not paranoia, it is a measured finding
 * (docs/findings/capture-backends-2026-09-18.md): one backend's
 * `resize_window(393, 852)` returned "Successfully resized window containing
 * tab 1345119719 to 393x852 pixels" and the page still reported 1512px wide,
 * dpr 1, zero touch points, two seconds later. A configuration flag is a
 * request. Only a measurement is evidence.
 *
 * So: after configuring a surface we ask the *page* what it got, and after
 * writing a PNG we ask the *file* how many pixels it has. A backend that
 * cannot satisfy an invariant fails loudly at capture time, which is the
 * cheap moment — the expensive moment is a reader trusting a blurry artifact.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Every invariant the system promises, with the reason it exists. */
export const INVARIANTS = {
  retina: {
    id: "retina",
    label: "Retina capture",
    why: "A 1x capture of a text-dense UI is unreadable when a reader zooms in, and it is indistinguishable from a 2x one in a file listing.",
  },
  animationsFrozen: {
    id: "animationsFrozen",
    label: "Animations frozen",
    why: "A mid-animation frame is a state the product never actually rests in, and it makes every later visual comparison noise.",
  },
  freshContext: {
    id: "freshContext",
    label: "Fresh context per feature",
    why: "State leaking between features produces captures of a session that no real user ever had — and, on a shared browser profile, captures carrying the operator's own identity.",
  },
  realMobile: {
    id: "realMobile",
    label: "Real mobile emulation",
    why: "A narrow desktop window is not a phone. Sites pick their skin from the user agent and their affordances from touch capability, so a narrow viewport documents a layout no user sees.",
  },
  video: {
    id: "video",
    label: "Video recording",
    why: "Some claims are only legible in motion — a transition, a streaming response, a drag.",
  },
  consoleNetwork: {
    id: "consoleNetwork",
    label: "Console + network capture",
    why: "An empty list because the backend was down looks exactly like an empty list because the feature has an empty state. The network log is the only thing that tells them apart.",
  },
  distinctCaptures: {
    id: "distinctCaptures",
    label: "No byte-duplicate steps",
    why: "Identical bytes mean nothing happened between two claimed states. Two claims, one reality.",
  },
};

export class InvariantViolation extends Error {
  constructor(invariant, detail) {
    super(`[${invariant}] ${detail}`);
    this.name = "InvariantViolation";
    this.invariant = invariant;
  }
}

// ── PNG measurement, without an image dependency ───────────────────────────

/**
 * Read a PNG's pixel dimensions straight out of its IHDR chunk.
 *
 * We measure the file rather than trusting the deviceScaleFactor we asked
 * for, because "I set dpr 2" and "this file has twice as many pixels as CSS
 * pixels" are different claims and only the second one is the artifact.
 */
export function pngSize(file) {
  const buf = readFileSync(file);
  const sig = buf.subarray(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a") {
    throw new InvariantViolation(
      "retina",
      `${file} is not a PNG (magic ${sig}). Lossy formats are refused: JPEG re-encoding softens UI text and makes byte-comparison meaningless.`,
    );
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function md5(file) {
  return createHash("md5").update(readFileSync(file)).digest("hex");
}

// ── Assertions ─────────────────────────────────────────────────────────────

/**
 * The PNG must carry `scale` times as many pixels as the CSS viewport.
 *
 * Height is compared with a tolerance because a full-page capture is taller
 * than the viewport by design; width is exact because nothing legitimately
 * changes it.
 */
export function assertRetina(file, surface) {
  const { width, height } = pngSize(file);
  const wantW = Math.round(surface.width * surface.scale);
  if (width !== wantW) {
    throw new InvariantViolation(
      "retina",
      `${file} is ${width}x${height}. A ${surface.width}px surface at scale ${surface.scale} must be ${wantW}px wide. ` +
        `The backend accepted the deviceScaleFactor and did not apply it — the capture would ship at the wrong density.`,
    );
  }
  return { width, height };
}

/**
 * What the *page* reports about itself, checked against what we asked for.
 * `env` is the object returned by `PROBE_SCRIPT` evaluated in the page.
 */
export function assertSurface(env, surface) {
  const problems = [];
  if (env.dpr !== surface.scale) {
    problems.push(`devicePixelRatio is ${env.dpr}, asked for ${surface.scale}`);
  }
  if (surface.mobile) {
    // Each of these is a separate way to get a fake phone. A site can key its
    // layout off any one of them, so all three have to hold.
    if (!/iPhone|Android|Mobile/i.test(env.ua)) problems.push(`user agent is not a mobile one (${env.ua.slice(0, 50)}…)`);
    if (!env.touch) problems.push("maxTouchPoints is 0 — the page sees a mouse, not a finger");
    if (!env.coarse) problems.push("pointer:coarse is false — hover affordances will render as on desktop");
  }
  // innerWidth is checked last and reported as a warning-grade detail: some
  // backends scale the pane, so CSS media queries resolve correctly while
  // window.innerWidth reports the host size. That breaks JS-driven responsive
  // code only, so it is worth recording without failing the capture.
  const widthDrift = Math.abs(env.innerWidth - surface.width) > 2 ? env.innerWidth : null;
  if (problems.length) {
    throw new InvariantViolation(
      surface.mobile ? "realMobile" : "retina",
      `surface "${surface.id}" was configured but not delivered: ${problems.join("; ")}.`,
    );
  }
  return { widthDrift };
}

/** Two contexts must not share storage. Proven by a marker the probe writes. */
export function assertFreshContext(markerA, markerB) {
  if (!markerA || !markerB) {
    throw new InvariantViolation("freshContext", "the isolation probe returned no marker — storage is blocked or the probe did not run.");
  }
  if (markerA === markerB) {
    throw new InvariantViolation(
      "freshContext",
      `both contexts report storage marker "${markerA}". State from the previous feature is visible in this one, so any capture here documents a session no user had.`,
    );
  }
}

/**
 * Hash a capture against EVERY capture already taken in this walk.
 *
 * A one-step lookback is weaker than the hub's own check, which compares all
 * pairs: a tab click that returns you to an earlier view produces a capture
 * identical to step 1 but different from step 2, and slips straight through.
 */
export class DistinctnessLedger {
  constructor() {
    /** @type {Map<string, Map<string, string>>} scope -> hash -> file */
    this.seen = new Map();
  }

  /** @returns {{hash: string, clash: string|null}} */
  record(scope, file, relPath) {
    const hash = md5(file);
    const scoped = this.seen.get(scope) ?? new Map();
    const clash = scoped.get(hash) ?? null;
    if (!clash) {
      scoped.set(hash, relPath);
      this.seen.set(scope, scoped);
    }
    return { hash, clash };
  }

  count() {
    let n = 0;
    for (const scoped of this.seen.values()) n += scoped.size;
    return n;
  }
}

/**
 * The script every driver evaluates in the page to report what it actually
 * got. Kept here rather than in each driver so all backends are interrogated
 * with identical questions — otherwise "verified" means something different
 * per backend, which is the problem this layer exists to solve.
 */
export const PROBE_SCRIPT = `(() => {
  let mark = null;
  try {
    mark = localStorage.getItem('__wt_ctx');
    if (!mark) { mark = 'ctx-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('__wt_ctx', mark); }
  } catch (e) { mark = null; }
  return {
    dpr: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    ua: navigator.userAgent,
    touch: navigator.maxTouchPoints,
    coarse: matchMedia('(pointer: coarse)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    marker: mark,
    dir: document.documentElement.dir || 'ltr',
    title: document.title,
    href: location.href,
  };
})()`;

/**
 * Injected before every capture. `animations: "disabled"` is a Playwright
 * flag; this is the portable equivalent, and it was measured to turn two
 * differing captures of a spinning page into byte-identical ones on a backend
 * that has no such flag.
 *
 * The caret rule is not cosmetic: a focused input photographed mid-blink is a
 * coin flip that defeats byte-comparison.
 */
export const FREEZE_CSS = `
  *, *::before, *::after {
    animation-play-state: paused !important;
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
  * { caret-color: transparent !important; }
`;

/**
 * Chrome that belongs to the toolchain, not to the product.
 *
 * A dev-server error overlay is not a feature. Left in, a capture shows the
 * reader a floating "1 issue" badge from Next.js and invites them to conclude
 * something about the app that is true only of the machine it was walked on.
 *
 * Hiding it is legitimate; hiding it silently is not. Whatever is suppressed
 * is recorded in the run manifest under `config.suppressed`, the same way the
 * Wikipedia walk records that it hides fundraising banners. The reader can
 * always see what was taken out.
 *
 * Note what is NOT suppressed: the underlying console error still reaches
 * `consoleLog` and still becomes an issue. Hiding the badge removes the
 * toolchain's UI from the picture, not the finding from the record.
 */
export const DEV_OVERLAY_CSS = `
  nextjs-portal,
  [data-nextjs-toast],
  #__next-build-watcher,
  vite-error-overlay,
  #vite-error-overlay,
  .Toastify__toast-container--dev { display: none !important; }
`;
