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
    await freezeAnimations(ctx);

    const running = await ctx
      .evaluate("document.getAnimations ? document.getAnimations().filter(a => a.playState === 'running').length : -1")
      .catch(() => -1);
    if (running === 0) {
      report.verified.animationsFrozen = true;
    } else if (running > 0) {
      report.warnings.push(
        `surface "${surface.id}": ${running} animation(s) still running after settle — captures of this feature may catch a mid-animation frame`,
      );
    }

    // Two reads of the clock, a real pause apart. If they agree, the page's
    // notion of time is pinned and a live timestamp cannot silently disarm
    // the duplicate guard.
    const t1 = await ctx.evaluate("Date.now()").catch(() => null);
    await new Promise((r) => setTimeout(r, 120));
    const t2 = await ctx.evaluate("Date.now()").catch(() => null);
    if (t1 != null && t2 != null) {
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
    async function shot(file, o = {}) {
      await ctx.settle();
      if (suppressCss) await ctx.injectCss(suppressCss);
      // Before every capture, not once per feature: scroll-triggered and
      // interaction-triggered animations are created after setup, so a freeze
      // applied only at the start leaves every later step exposed.
      await freezeAnimations(ctx);
      const rel = `${featureId}/${surface.id}/${file}`;
      const abs = join(outDir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      await ctx.screenshot(abs);

      // Measure the file, don't trust the flag.
      assertRetina(abs, surface);

      const { clash } = ledger.record(scope, abs, rel);
      if (clash) {
        if (o.optional) {
          console.log(`    · skipped ${file} — byte-identical to ${clash}, nothing changed on screen`);
          return null;
        }
        throw new InvariantViolation(
          "distinctCaptures",
          `${rel} is byte-identical to ${clash}. The interaction before it did not change the screen — ` +
            `fix the action, mark the step optional, or drop it. Two claimed states with one real state behind them ` +
            `is exactly what this system exists not to publish.`,
        );
      }
      report.captures += 1;
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
