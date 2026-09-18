/**
 * The capture session — where the quality invariants are enforced, once, for
 * every backend.
 *
 * A walk script talks to this. It never talks to a driver directly, and it
 * cannot opt out of a check: `shot()` settles the page, writes the PNG,
 * measures the PNG, and hashes it against every capture already taken in the
 * walk before it will hand back a path to put in JSON. If any of that fails
 * you get an exception instead of a filename, which is the point — the system
 * refuses to publish rather than publish something misleading.
 *
 * ── Why the checks measure instead of trusting ────────────────────────────
 *
 * Every backend claims things. One of them claimed a successful resize to
 * 393x852 and left the page at 1512px wide. So a surface is not "set" until
 * the page agrees it is set, and a capture is not "Retina" until the file has
 * the pixels. See docs/findings/capture-backends-2026-09-18.md.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONTENT_THRESHOLDS, diffCells, measureContent } from "./pixels.mjs";
import {
  DEV_OVERLAY_CSS,
  DistinctnessLedger,
  InvariantViolation,
  PROBE_SCRIPT,
  assertFreshContext,
  assertRetina,
  assertSurface,
} from "./invariants.mjs";

/**
 * @param {object} opts
 * @param {import("./driver-contract.mjs").CaptureDriver} opts.driver
 * @param {string} opts.outDir   absolute path to public/walkthroughs/{slug}
 */
export async function createCaptureSession({ driver, outDir, videoDir = null, suppressCss = DEV_OVERLAY_CSS, suppressNote = "dev-server error overlays (Next.js / Vite) hidden; the console errors behind them are still collected and reported" }) {
  await driver.launch();

  const ledger = new DistinctnessLedger();
  const markers = [];
  /** Everything the run manifest should be able to say about how this run was captured. */
  const report = {
    driver: driver.id,
    driverLabel: driver.label,
    declares: { ...driver.declares },
    verified: {},
    skipped: [],
    surfaces: [],
    warnings: [],
    /** Horizontal-overflow findings — product defects, for issues.json. */
    overflows: [],
    /** What was hidden from captures, so the manifest can say so. */
    suppressed: suppressCss ? [suppressNote] : [],
    /** Captures refused for being empty or for not advancing. */
    rejected: [],
    captures: 0,
  };

  async function feature(featureId, surface, opts = {}) {
    const wantsVideo = !!opts.video && driver.declares.video && videoDir;
    if (opts.video && !driver.declares.video) {
      // Recorded rather than silently dropped: a reader of runs.json can see
      // that this backend produced no clips and why.
      const note = `${driver.id} cannot record video; steps that wanted a clip were captured as stills`;
      if (!report.warnings.includes(note)) report.warnings.push(note);
    }

    const ctx = await driver.newContext(surface, {
      ...(wantsVideo ? { recordVideo: videoDir } : {}),
      ...opts,
    });

    // ── Verify the surface actually took ────────────────────────────────
    // Done against `about:blank`-then-target rather than assumed, because the
    // page is the only authority on what it received.
    if (opts.url) await ctx.goto(opts.url);
    await ctx.settle();
    // Wait for the app to finish painting before anything is measured or
    // captured. Without this the first capture of a client-rendered app is a
    // spinner, and every check above would happily pass it.
    const ready = await waitForReady(ctx, { timeoutMs: opts.readyTimeoutMs ?? 15_000 });
    if (!ready.ready) {
      report.warnings.push(
        `feature "${featureId}" on ${surface.id}: ${ready.reason} after ${ready.waitedMs}ms — captures may show a loading state`,
      );
    }

    const env = await ctx.evaluate(PROBE_SCRIPT);
    const { widthDrift } = assertSurface(env, surface);
    report.verified.retina = true;
    if (surface.mobile) report.verified.realMobile = true;

    // A layout viewport wider than the surface has two very different causes,
    // and saying which one it is turns a vague warning into something
    // actionable. Both were seen for real on the first run of this layer:
    //
    //   the page overflows   a `flex shrink-0` row 2940px wide forced a deck's
    //                        layout viewport to 560px on a 393px phone, so the
    //                        page renders zoomed out and scrolls sideways.
    //                        That is a product defect and belongs in issues.json.
    //   the backend lied     a pane scaled its own viewport, so CSS media
    //                        queries resolved correctly while innerWidth
    //                        reported the host's width. That is a capture
    //                        fidelity problem and belongs in the run manifest.
    //
    // `scrollWidth` tells them apart: when it matches the inflated innerWidth,
    // the content is what widened the viewport.
    if (widthDrift) {
      const scrollWidth = await ctx
        .evaluate("document.documentElement.scrollWidth")
        .catch(() => null);
      const overflowing = scrollWidth != null && scrollWidth > surface.width + 2;
      const note = overflowing
        ? `surface "${surface.id}": the page overflows horizontally — content is ${scrollWidth}px wide on a ${surface.width}px surface, ` +
          `so the layout viewport expanded to ${widthDrift}px and a real phone renders this zoomed out with a sideways scroll`
        : `surface "${surface.id}": CSS media queries resolve correctly but window.innerWidth reports ${widthDrift} ` +
          `instead of ${surface.width} — the backend did not deliver the layout width, so JS-driven responsive code sees the wrong size`;
      if (!report.warnings.includes(note)) report.warnings.push(note);
      if (overflowing) {
        // Keyed by feature as well as surface: two different pages
        // overflowing is two findings, not one repeated. The first run of this
        // check emitted two issues with the same id for exactly that reason.
        report.overflows.push({
          featureId,
          location: opts.url ?? null,
          surface: surface.id,
          contentWidth: scrollWidth,
          surfaceWidth: surface.width,
        });
      }
    }

    // ── Verify the page is actually still ───────────────────────────────
    //
    // Declaring "animations frozen" is cheap; proving it costs one expression.
    if (hasDomBridge(driver)) await freezeAnimations(ctx);

    const running = hasDomBridge(driver) ? await ctx
      .evaluate("document.getAnimations ? document.getAnimations().filter(a => a.playState === 'running').length : -1")
      .catch(() => -1) : -1;
    if (running === 0) {
      report.verified.animationsFrozen = true;
    } else if (running > 0) {
      report.warnings.push(
        `surface "${surface.id}": ${running} animation(s) still running after settle — captures of this feature may catch a mid-animation frame`,
      );
    }

    // Two reads of the clock, a real pause apart. Only meaningful when the
    // driver can actually evaluate script in the page — a simulator pins its
    // clock through the platform's status-bar override instead, which this
    // check cannot see and must not contradict.
    // If the two reads agree, the page's notion of time is pinned and a live
    // timestamp cannot silently disarm the duplicate guard.
    const hasDom = hasDomBridge(driver);
    const t1 = hasDom ? await ctx.evaluate("Date.now()").catch(() => null) : null;
    if (hasDom) await new Promise((r) => setTimeout(r, 120));
    const t2 = hasDom ? await ctx.evaluate("Date.now()").catch(() => null) : null;
    if (!hasDom) {
      report.skipped.push("timeFrozen / animationsFrozen checks (backend has no DOM bridge)");
    }
    if (typeof t1 === "number" && typeof t2 === "number") {
      if (t1 === t2) {
        report.verified.timeFrozen = true;
      } else if (driver.declares.timeFrozen) {
        report.warnings.push(
          `surface "${surface.id}": the clock advanced ${t2 - t1}ms despite the backend declaring timeFrozen`,
        );
      }
    }

    // ── Verify context isolation ────────────────────────────────────────
    // The marker is written by the probe on first evaluation in a context. If
    // this context reports a marker we have already seen, storage leaked.
    if (env.marker) {
      if (markers.includes(env.marker)) {
        assertFreshContext(env.marker, env.marker); // throws with the right message
      }
      markers.push(env.marker);
      if (markers.length > 1) report.verified.freshContext = true;
    } else {
      report.skipped.push("freshContext (storage unavailable — isolation could not be proven)");
    }

    if (!report.surfaces.includes(surface.id)) report.surfaces.push(surface.id);

    const scope = `${featureId}:${surface.id}`;

    /**
     * Capture one step.
     *
     * @param {string} file       e.g. "step-03-results.png"
     * @param {object} [o]
     * @param {boolean} [o.optional]  a duplicate skips the step instead of
     *                                failing the walk — right for one of
     *                                several tab views, wrong for a step whose
     *                                whole point is that something changed.
     * @returns {Promise<string|null>} path relative to the project dir, for JSON
     */
    /** The last capture taken in this walk, for the progress comparison. */
    let previousCapture = null;

    /**
     * Capture one step.
     *
     * @param {string} file       e.g. "step-03-results.png"
     * @param {object} [o]
     * @param {boolean} [o.optional]  a rejected capture skips the step instead
     *                                of failing the walk — right for one of
     *                                several tab views, wrong for a step whose
     *                                whole point is that something changed.
     * @param {boolean} [o.sparse]    this screen really is nearly empty (a
     *                                confirmation, an empty state, a splash).
     *                                Declaring it means you looked; it is
     *                                recorded on the step.
     * @param {boolean} [o.firstOfScreen] skip the progress check — this is a
     *                                new screen, not an advance on the last one.
     * @returns {Promise<string|null>} path relative to the project dir
     */
    async function shot(file, o = {}) {
      await ctx.settle();
      await waitForReady(ctx);
      // Before every capture, not once per feature: scroll-triggered and
      // interaction-triggered animations are created after setup, so a freeze
      // applied only at the start leaves every later step exposed.
      await freezeAnimations(ctx);
      if (suppressCss) await ctx.injectCss(suppressCss);

      const rel = `${featureId}/${surface.id}/${file}`;
      const abs = join(outDir, rel);
      mkdirSync(dirname(abs), { recursive: true });

      // ── Capture, and retry while the screen is still empty ───────────
      //
      // `waitForReady` watches text, loading indicators and images. It cannot
      // see a <canvas>: a WebGL hero reports a settled DOM while it is still
      // painting black, so the gate passes and the capture is of nothing. That
      // is exactly how a persona journey shipped three empty scenes.
      //
      // Retrying rather than rejecting is the honest response, because it is
      // what a person would do — look, see nothing, wait a beat, look again.
      // Only a screen that is *still* empty after several tries is a real
      // finding, and then it is reported as one.
      let content = null;
      let attempt = 0;
      const maxAttempts = o.sparse ? 1 : 3;
      while (attempt < maxAttempts) {
        attempt++;
        await ctx.screenshot(abs);
        assertRetina(abs, surface);
        try {
          content = measureContent(abs);
        } catch {
          report.skipped.push("content check (unsupported PNG variant)");
          break;
        }
        if (o.sparse || content.occupiedCells >= CONTENT_THRESHOLDS.minOccupiedCells) break;
        if (attempt < maxAttempts) {
          console.log(
            `    · ${file} still empty (${Math.round(content.occupiedCells * 100)}%), waiting for it to paint…`,
          );
          await new Promise((r) => setTimeout(r, 1200));
          await freezeAnimations(ctx);
        }
      }

      if (content && !o.sparse && content.occupiedCells < CONTENT_THRESHOLDS.minOccupiedCells) {
        const detail =
          `${rel} looks empty after ${attempt} attempts — content in only ` +
          `${Math.round(content.occupiedCells * 100)}% of the frame ` +
          `(threshold ${Math.round(CONTENT_THRESHOLDS.minOccupiedCells * 100)}%). ` +
          `Either the screen never rendered, or the interaction did not land. ` +
          `If it really is this sparse, pass { sparse: true } to say so deliberately.`;
        report.rejected.push({ file: rel, reason: "empty", occupiedCells: content.occupiedCells });
        if (o.optional) {
          console.log(`    · skipped ${file} — nothing rendered after ${attempt} attempts`);
          return null;
        }
        throw new InvariantViolation("contentful", detail);
      }

      // ── Did anything actually change? ────────────────────────────────
      //
      // Byte-inequality is too weak: two captures of the same screen differ
      // if a single anti-aliased pixel moved. A reader's "different screen"
      // is a meaningful share of the frame.
      if (previousCapture && !o.firstOfScreen) {
        // Two ways to be a new state, and a step only needs one:
        //   a broad change  — the whole frame shifted a little (a theme swap)
        //   a local change  — one region shifted a lot (a filtered table)
        // Requiring only the broad signal rejected three real openstage steps,
        // because filtering a four-row table moves 1.6% of a 1440x900 frame
        // and almost all of the content in it.
        //
        // Safe to be generous here only because the emptiness check above has
        // already run: a near-duplicate of two blank screens scores high on
        // the local signal, and never reaches this point.
        let d = { frameFraction: 1, contentFraction: 1 };
        try {
          d = diffCells(previousCapture.abs, abs);
        } catch {
          /* fall through — the byte guard below still applies */
        }
        const broad = d.frameFraction >= CONTENT_THRESHOLDS.minProgressFraction;
        const local = d.contentFraction >= CONTENT_THRESHOLDS.minProgressContentFraction;
        if (!broad && !local) {
          const detail =
            `${rel} changed ${(d.frameFraction * 100).toFixed(1)}% of the frame and ` +
            `${(d.contentFraction * 100).toFixed(0)}% of the content area versus ${previousCapture.rel} — ` +
            `not enough to call it a new state. The bytes differ, so the MD5 guard would have passed it; ` +
            `a reader would see the same screen twice.`;
          report.rejected.push({ file: rel, reason: "no-progress", ...d });
          if (o.optional) {
            console.log(`    · skipped ${file} — ${(d.frameFraction * 100).toFixed(1)}% of frame / ${(d.contentFraction * 100).toFixed(0)}% of content changed`);
            return null;
          }
          throw new InvariantViolation("distinctCaptures", detail);
        }
      }

      const { clash } = ledger.record(scope, abs, rel);
      if (clash) {
        if (o.optional) {
          console.log(`    · skipped ${file} — byte-identical to ${clash}`);
          return null;
        }
        throw new InvariantViolation(
          "distinctCaptures",
          `${rel} is byte-identical to ${clash}. The interaction before it did not change the screen.`,
        );
      }

      previousCapture = { abs, rel };
      report.captures += 1;
      if (content) report.verified.contentful = true;
      if (ctx.consoleLog.length || ctx.networkLog.length) report.verified.consoleNetwork = true;
      return rel;
    }

    return {
      ctx,
      shot,
      env,
      /** Failed requests seen in this context, for issues.json. */
      failures() {
        return ctx.networkLog
          .filter((n) => n.status >= 400)
          .map((n) => ({ status: n.status, path: safePath(n.url) }));
      },
      /** Console errors seen in this context. */
      consoleErrors() {
        return ctx.consoleLog.filter((c) => c.type === "error" || c.type === "pageerror").map((c) => c.text);
      },
      async finish() {
        const video = wantsVideo ? await ctx.finishVideo() : null;
        if (video) report.verified.video = true;
        await ctx.close();
        return { video };
      },
    };
  }

  return {
    feature,
    report: () => ({
      ...report,
      // Anything declared true and never exercised is reported as unverified
      // rather than assumed — the manifest should describe this run, not the
      // backend's brochure.
      unverified: Object.keys(driver.declares).filter(
        (k) => driver.declares[k] && !report.verified[k],
      ),
    }),
    async close() {
      await driver.close();
    },
  };
}

/** A path without the origin, and never a query string — those carry tokens. */
function safePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "(unparseable url)";
  }
}

/**
 * Bring every running animation to rest.
 *
 * The injected freeze CSS removes CSS animations and transitions. It does NOT
 * touch animations created through the Web Animations API, which is how
 * framer-motion, GSAP and most React animation libraries actually run — the
 * first real walk on this layer reported "4 animations still running after
 * settle" on a framer-motion deck, meaning the freeze was working and was
 * freezing the wrong half.
 *
 * `finish()` rather than `pause()`: pausing captures a frame mid-flight, which
 * is the exact thing the invariant forbids. Finishing jumps to the end state —
 * the state the screen settles into, and the one a reader would actually see.
 */
async function freezeAnimations(ctx) {
  return ctx
    .evaluate(`(() => {
      if (!document.getAnimations) return 0;
      let n = 0;
      for (const a of document.getAnimations()) {
        try { a.finish(); n++; } catch (e) { try { a.cancel(); n++; } catch (e2) {} }
      }
      return n;
    })()`)
    .catch(() => 0);
}

/**
 * Wait until the page has actually finished painting.
 *
 * ── Why a settle is not enough ────────────────────────────────────────────
 *
 * `networkidle` plus a fonts-ready promise says the *transport* is quiet. It
 * says nothing about whether the app has rendered: a client-rendered page
 * fetches, resolves, and then spends another beat building its DOM. Capturing
 * in that gap yields a spinner — which is exactly what shipped in the first
 * openstage persona journey.
 *
 * Three signals, all cheap, all in the page:
 *
 *  1. No visible loading indicator. Covers the common idioms — `[aria-busy]`,
 *     role="progressbar", and the spinner/skeleton/shimmer class names that
 *     every component library converges on.
 *  2. The rendered text has stopped growing. Two consecutive equal readings
 *     mean the DOM has stopped filling in.
 *  3. Images above the fold have decoded. A half-loaded hero is a capture of
 *     a state the user sees for 200ms and never thinks about.
 *
 * Returns rather than throws: a page that never settles is a finding about the
 * app worth recording, not a reason to abandon the walk.
 */
async function waitForReady(ctx, { timeoutMs = 10_000, quietMs = 220 } = {}) {
  const started = Date.now();
  let lastLen = -1;
  let stableCount = 0;
  let lastReason = "did not settle";

  while (Date.now() - started < timeoutMs) {
    const state = await ctx
      .evaluate(`(() => {
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > 0.05;
        };
        const busy = [...document.querySelectorAll(
          '[aria-busy="true"],[role="progressbar"],[class*="spinner" i],[class*="loading" i],[class*="skeleton" i],[class*="shimmer" i]'
        )].filter(vis).length;
        const imgs = [...document.querySelectorAll('img')].filter((i) => {
          const r = i.getBoundingClientRect();
          return r.top < innerHeight && r.bottom > 0 && r.width > 0;
        });
        return {
          busy,
          textLen: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length,
          imgsPending: imgs.filter((i) => !i.complete || i.naturalWidth === 0).length,
        };
      })()`)
      .catch(() => null);

    if (!state) return { ready: false, reason: "could not read page state", waitedMs: Date.now() - started };

    if (state.busy > 0) {
      lastReason = `${state.busy} loading indicator(s) still visible`;
      stableCount = 0;
    } else if (state.imgsPending > 0) {
      lastReason = `${state.imgsPending} above-the-fold image(s) not decoded`;
      stableCount = 0;
    } else if (state.textLen === lastLen) {
      stableCount++;
      if (stableCount >= 2) {
        return { ready: true, reason: "settled", waitedMs: Date.now() - started, textLen: state.textLen };
      }
    } else {
      lastReason = "content still arriving";
      stableCount = 0;
    }
    lastLen = state.textLen;
    await new Promise((r) => setTimeout(r, quietMs));
  }
  return { ready: false, reason: lastReason, waitedMs: Date.now() - started };
}

/** Can this backend evaluate script in the page? */
function hasDomBridge(driver) {
  return driver.declares.domBridge !== false;
}
