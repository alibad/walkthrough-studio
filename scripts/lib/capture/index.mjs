/**
 * Capture layer — public entry point.
 *
 *   import { openCapture, SURFACES } from "./lib/capture/index.mjs";
 *
 *   const cap = await openCapture({ outDir, driver: "auto" });
 *   const walk = await cap.feature("search", SURFACES.desktop, { url: BASE });
 *   const shot1 = await walk.shot("step-01-arrive.png");
 *   await walk.ctx.click("#search");
 *   const shot2 = await walk.shot("step-02-typed.png");
 *   await walk.finish();
 *   await cap.close();
 *
 * `driver: "auto"` prefers Playwright and falls back to an attached Chrome
 * over raw CDP when Playwright's browser is not installed. The fallback is
 * announced rather than silent, because the two do not have identical
 * capabilities — CDP records no video — and a reader of the run manifest
 * needs to know which one produced the artifacts.
 */

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createCaptureSession } from "./session.mjs";
import { playwrightDriver } from "./driver-playwright.mjs";
import { cdpDriver } from "./driver-cdp.mjs";

export { INVARIANTS, InvariantViolation, pngSize, md5 } from "./invariants.mjs";

/**
 * Standard surfaces. Dimensions are real devices, not round numbers: a
 * 393x852 iPhone 14 Pro at scale 3 is a device people hold, and 400x800 at
 * scale 2 is a device that does not exist.
 */
export const SURFACES = {
  desktop: { id: "desktop", width: 1440, height: 900, scale: 2, mobile: false },
  mobile: {
    id: "mobile",
    width: 393,
    height: 852,
    scale: 3,
    mobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
};

/** Is a Playwright browser actually on this machine? */
export function playwrightBrowserInstalled() {
  const cache = join(homedir(), "Library", "Caches", "ms-playwright");
  const linux = join(homedir(), ".cache", "ms-playwright");
  for (const dir of [cache, linux]) {
    if (!existsSync(dir)) continue;
    if (readdirSync(dir).some((d) => /^chromium/.test(d))) return true;
  }
  return false;
}

export async function openCapture({ outDir, videoDir = null, driver = "auto", cdpEndpoint } = {}) {
  const chosen = await pickDriver(driver, cdpEndpoint);
  console.log(`  capture backend: ${chosen.label}`);
  const missing = Object.entries(chosen.declares)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) console.log(`  not provided by this backend: ${missing.join(", ")}`);
  return createCaptureSession({ driver: chosen, outDir, videoDir });
}

async function pickDriver(which, cdpEndpoint) {
  if (which === "playwright") return playwrightDriver();
  if (which === "cdp") return cdpDriver({ endpoint: cdpEndpoint });
  if (which && typeof which === "object") return which; // a caller-supplied driver

  if (playwrightBrowserInstalled()) return playwrightDriver();
  console.log("  Playwright's Chromium is not installed — trying an attached Chrome over CDP.");
  console.log("  (`npx playwright install chromium` restores the default backend, which also records video.)");
  return cdpDriver({ endpoint: cdpEndpoint });
}
