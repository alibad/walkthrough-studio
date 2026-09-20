/**
 * Playwright driver — the default capture backend.
 *
 * Measured on 2026-09-18 (docs/findings/capture-backends-2026-09-18.md) it is
 * the only backend that meets every invariant:
 *
 *   retina           1440x900 @ scale 2 -> a 2880x1800 PNG
 *   realMobile       dpr 3, iPhone UA, maxTouchPoints 1, pointer:coarse
 *   animationsFrozen two captures of a spinning page, 900ms apart, byte-identical
 *   freshContext     two contexts report different storage markers
 *   video            a 140KB webm of a two-page flow
 *   consoleNetwork   console errors plus 500s with their path
 *
 * Its one real cost is a 94.3 MiB browser download on a cold machine, which is
 * why a second driver exists at all.
 */

import { chromium, devices } from "playwright";
import { FREEZE_CSS } from "./invariants.mjs";

/** Named devices are preferred over hand-rolled viewports: they carry the UA,
 *  touch flags and scale factor as a matched set, and a hand-rolled one drifts. */
const DEVICE_ALIASES = {
  mobile: "iPhone 14 Pro",
  iphone: "iPhone 14 Pro",
  tablet: "iPad Pro 11",
};

export function playwrightDriver() {
  let browser = null;

  return {
    id: "playwright",
    label: "Playwright (launched Chromium)",
    declares: {
      retina: true,
      realMobile: true,
      video: true,
      consoleNetwork: true,
      freshContext: true,
      animationsFrozen: true,
      // Freezing CSS animation is not enough to make a capture deterministic.
      // A page with a `setInterval` clock, a relative timestamp ("3 minutes
      // ago") or a rAF counter produces byte-different captures of an
      // unchanged screen — which silently defeats the duplicate guard, since
      // two captures of the same state no longer collide. Pinning the clock
      // closes that hole and was measured to do so.
      timeFrozen: true,
    },

    async launch() {
      browser = await chromium.launch();
    },

    async newContext(surface, opts = {}) {
      const deviceName = DEVICE_ALIASES[surface.id];
      const device = surface.mobile && deviceName ? devices[deviceName] : null;

      const context = await browser.newContext({
        ...(device ?? {}),
        viewport: { width: surface.width, height: surface.height },
        deviceScaleFactor: surface.scale,
        isMobile: surface.mobile,
        hasTouch: surface.mobile,
        ...(surface.userAgent ? { userAgent: surface.userAgent } : {}),
        // `reducedMotion` is belt to the freeze-CSS braces: it stops animations
        // the app itself gates on the media query, which CSS injection cannot
        // undo once the app has branched on it in JS.
        reducedMotion: "reduce",
        locale: surface.locale ?? "en-GB",
        // Pinned: pages render timestamps, and an unpinned zone makes every
        // re-run differ from the last for reasons that are not the product.
        timezoneId: surface.timezone ?? "UTC",
        ...(opts.recordVideo ? { recordVideo: { dir: opts.recordVideo, size: { width: surface.width, height: surface.height } } } : {}),
        ...(opts.storageState ? { storageState: opts.storageState } : {}),
      });

      const page = await context.newPage();

      // Pin what the page *reads* from the clock, before the first navigation.
      //
      // `setFixedTime` and not `pauseAt`: pausing stops setTimeout/setInterval
      // from firing at all, which hangs any app whose loading path goes
      // through a timer — a debounce, a retry, a splash screen that dismisses
      // itself. Fixing the time leaves timers running while `Date.now()` and
      // `new Date()` return a constant, so a clock or a "3 minutes ago" label
      // re-renders to the same pixels.
      //
      // This matters more than it looks. Without it, any live timestamp on the
      // page makes two captures of an unchanged screen byte-different, which
      // silently disarms the duplicate guard: the check still runs, it just
      // can never fire. With it, the guard means what it claims on a live app
      // and not only on a static page.
      if (opts.pinClock !== false) {
        const at = new Date(opts.clockAt ?? "2026-01-01T09:00:00Z");
        await page.clock.install({ time: at }).catch(() => {});
        await page.clock.setFixedTime(at).catch(() => {});
      }

      const consoleLog = [];
      const networkLog = [];
      page.on("console", (m) => consoleLog.push({ type: m.type(), text: m.text() }));
      page.on("response", (r) =>
        networkLog.push({ status: r.status(), url: r.url(), method: r.request().method() }),
      );
      page.on("pageerror", (e) => consoleLog.push({ type: "pageerror", text: String(e.message ?? e) }));

      return {
        consoleLog,
        networkLog,
        _page: page, // escape hatch for walk scripts that need a Playwright-ism

        async goto(url) {
          await page.goto(url, { waitUntil: "domcontentloaded" });
        },
        async evaluate(expr) {
          // Playwright takes an expression string directly; the CDP driver
          // takes the same string, which is why the contract is a string and
          // not a function — functions do not serialise identically across
          // the two and the probe must be literally identical on both.
          return page.evaluate(expr);
        },
        async injectCss(css) {
          await page.addStyleTag({ content: css }).catch(() => {});
        },
        async click(selector) {
          const el = page.locator(selector).first();
          if (!(await el.count())) return false;
          await el.click({ timeout: 10_000 });
          return true;
        },
        /**
         * Click the element whose visible text matches — the portable way to
         * target a control that has no id, no test id and no stable class.
         * Text is what the user sees and what survives a refactor of the
         * markup, so it is usually the *more* honest selector, not the
         * weaker one.
         */
        async clickText(text, { role = "button" } = {}) {
          const byRole = page.getByRole(role, { name: text, exact: false }).first();
          if (await byRole.count()) {
            await byRole.click({ timeout: 10_000 });
            return true;
          }
          const byText = page.getByText(text, { exact: false }).first();
          if (!(await byText.count())) return false;
          await byText.click({ timeout: 10_000 });
          return true;
        },
        async fill(selector, value) {
          const el = page.locator(selector).first();
          if (!(await el.count())) return false;
          await el.fill(value);
          return true;
        },
        async press(key) {
          await page.keyboard.press(key);
        },
        async waitForSelector(selector, timeoutMs = 10_000) {
          return page
            .waitForSelector(selector, { timeout: timeoutMs })
            .then(() => true)
            .catch(() => false);
        },
        async scrollToSelector(selector, offsetPx = 80) {
          const el = page.locator(selector).first();
          if (!(await el.count())) return false;
          // NOT scrollIntoViewIfNeeded(): it no-ops when the element is already
          // visible, which silently produces a byte-duplicate capture. This
          // always scrolls, and offsets for a sticky header.
          await el.evaluate((node, offset) => {
            const top = node.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
          }, offsetPx);
          await page.waitForTimeout(350);
          return true;
        },
        async screenshot(absPath) {
          await page.screenshot({ path: absPath, animations: "disabled" });
        },
        async settle() {
          await page.waitForLoadState("networkidle").catch(() => {});
          // Fonts before pixels: a capture taken pre-font-swap shows fallback
          // metrics, so text wraps differently and every later diff is noise.
          await page.evaluate(() => document.fonts?.ready).catch(() => {});
          await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
          await page.waitForTimeout(250);
        },
        async finishVideo() {
          const video = page.video();
          if (!video) return null;
          await context.close();
          return video.path();
        },
        async close() {
          await context.close().catch(() => {});
        },
      };
    },

    async close() {
      await browser?.close().catch(() => {});
      browser = null;
    },
  };
}
