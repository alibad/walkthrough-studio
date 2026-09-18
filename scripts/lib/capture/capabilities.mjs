/**
 * What can this machine actually do?
 *
 * ── Why detection, rather than a configured default ───────────────────────
 *
 * The same walk gets run on a MacBook with Xcode, a Linux CI container, and
 * somebody else's laptop that has never installed Playwright. Hard-coding one
 * backend means it silently degrades on two of those, and "silently" is the
 * problem: a run that quietly fell back to a weaker backend produces artifacts
 * that look identical and mean less.
 *
 * So the machine is probed, the best available backend for the job is chosen,
 * and **the choice and its reasoning are printed and recorded in the run
 * manifest**. A reader can always see which backend produced which artifact,
 * and why it was not the better one.
 *
 * ── The ranking, and what it is ranked on ─────────────────────────────────
 *
 * Not "most powerful" in the abstract. Three questions in order, because a
 * perfect capture of an app you cannot reach is worth nothing:
 *
 *   1. Can it reach the app at all?        (native app? human-only auth gate?)
 *   2. Can it get past the front door?
 *   3. How good is the artifact?
 *
 * Getting that order wrong is what made the first version of this system
 * recommend Playwright for everything, including mobile web — where a real
 * Safari is measurably more faithful
 * (docs/findings/capture-backends-2026-09-18.md, Addendum 4).
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function quiet(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** Probe once; every decision below reads from this. */
export function detectCapabilities() {
  const isMac = process.platform === "darwin";

  const playwrightBrowsers = (() => {
    for (const dir of [
      join(homedir(), "Library", "Caches", "ms-playwright"),
      join(homedir(), ".cache", "ms-playwright"),
    ]) {
      if (!existsSync(dir)) continue;
      const entries = readdirSync(dir);
      return {
        chromium: entries.some((d) => /^chromium/.test(d)),
        webkit: entries.some((d) => /^webkit/.test(d)),
      };
    }
    return { chromium: false, webkit: false };
  })();

  const xcode = isMac ? quiet("xcrun simctl help >/dev/null 2>&1 && echo yes") : null;
  const bootedSims = xcode
    ? (() => {
        const out = quiet("xcrun simctl list devices booted --json");
        if (!out) return [];
        try {
          const json = JSON.parse(out);
          return Object.values(json.devices ?? {}).flat().map((d) => d.name);
        } catch {
          return [];
        }
      })()
    : [];

  // safaridriver is the Apple-supported path to real Safari, and — with
  // `platformName: "iOS"` and `safari:deviceUDID` — to a tethered iPhone. Its
  // presence is a fact about the machine; whether it has been enabled
  // (`safaridriver --enable`, which needs an admin password) is not something
  // this probe can or should discover by trying.
  const safaridriver = isMac ? quiet("which safaridriver") : null;

  const androidSdk = existsSync(join(homedir(), "Library", "Android", "sdk"))
    || existsSync(join(homedir(), "Android", "Sdk"));
  const adbDevices = androidSdk
    ? (quiet("adb devices") ?? "").split("\n").slice(1).filter((l) => /\tdevice$/.test(l)).length
    : 0;

  const chromeCdp = (() => {
    // A Chrome already listening on the DevTools port — the route to a browser
    // a human has signed into, which is the only way past an SSO or MFA gate.
    const v = quiet("curl -s --max-time 1 http://127.0.0.1:9222/json/version");
    return Boolean(v && v.includes("webSocketDebuggerUrl"));
  })();

  return {
    platform: process.platform,
    isMac,
    playwright: playwrightBrowsers,
    xcode: Boolean(xcode),
    bootedSimulators: bootedSims,
    safaridriver: Boolean(safaridriver),
    androidSdk,
    androidDevices: adbDevices,
    chromeCdp,
  };
}

/**
 * Pick a backend for a job, and say why.
 *
 * @param {object} job
 * @param {"web"|"ios"|"android"} [job.platform]
 * @param {boolean} [job.mobile]        capturing a hand-held surface
 * @param {boolean} [job.needsVideo]
 * @param {boolean} [job.needsSelectors] the walk drives by CSS selector
 * @param {boolean} [job.needsExistingSession] must reuse a human's logged-in browser
 */
export function chooseDriver(job = {}, caps = detectCapabilities()) {
  const reasons = [];

  // 1. Reach. A native app is not negotiable: nothing else can even see it.
  if (job.platform === "ios") {
    if (caps.bootedSimulators.length > 0 || caps.xcode) {
      return pick("ios-simulator", "iOS is only reachable through a simulator or a tethered device", caps, reasons);
    }
    return pick(null, "iOS capture needs macOS with Xcode, which this machine does not have", caps, reasons);
  }
  if (job.platform === "android") {
    if (caps.androidDevices > 0 || caps.androidSdk) {
      return pick("android-adb", "Android is only reachable through adb", caps, reasons);
    }
    return pick(null, "Android capture needs the platform-tools, which are not installed", caps, reasons);
  }

  // 2. The front door. An already-authenticated browser beats a better one.
  if (job.needsExistingSession) {
    if (caps.chromeCdp) {
      return pick("cdp", "reusing the Chrome session you are already signed into", caps, reasons);
    }
    reasons.push("no Chrome on :9222 to attach to — start one with --remote-debugging-port=9222");
  }

  // 3. Fidelity. Mobile web is where the backends genuinely diverge.
  if (job.mobile) {
    // Measured: Playwright collapses svh/lvh into one number and reports
    // platform MacIntel with maxTouchPoints 0. Real Safari does not.
    if (caps.bootedSimulators.length > 0 && !job.needsSelectors && !job.needsVideo) {
      return pick(
        "ios-simulator",
        `real Safari on ${caps.bootedSimulators[0]} — Playwright's WebKit cannot express the URL-bar viewport band (lvh−svh = 0 there, 40px on a device)`,
        caps,
        reasons,
      );
    }
    if (caps.bootedSimulators.length > 0 && job.needsSelectors) {
      reasons.push("a simulator is booted, but this walk drives by CSS selector and simctl has no DOM bridge");
    }
    if (caps.bootedSimulators.length > 0 && job.needsVideo) {
      reasons.push("a simulator is booted, but its video is 4:2:0 and variable-frame-rate — poor evidence for UI text");
    }
  }

  if (caps.playwright.chromium) {
    return pick("playwright", "the only backend that does video and a pinned clock", caps, reasons);
  }
  if (caps.chromeCdp) {
    return pick("cdp", "Playwright's browsers are not installed; attaching to the running Chrome instead", caps, reasons);
  }
  return pick(null, "no usable capture backend — run `npx playwright install chromium`", caps, reasons);
}

function pick(driver, why, caps, reasons) {
  return { driver, why, alsoConsidered: reasons, capabilities: caps };
}

/** One-screen summary, for a human deciding whether the choice was sane. */
export function describeCapabilities(caps = detectCapabilities()) {
  const yes = (v) => (v ? "yes" : "no");
  return [
    `platform            ${caps.platform}`,
    `playwright chromium ${yes(caps.playwright.chromium)}`,
    `playwright webkit   ${yes(caps.playwright.webkit)}`,
    `xcode / simctl      ${yes(caps.xcode)}`,
    `booted simulators   ${caps.bootedSimulators.length ? caps.bootedSimulators.join(", ") : "none"}`,
    `safaridriver        ${yes(caps.safaridriver)}`,
    `android sdk         ${yes(caps.androidSdk)}  (devices: ${caps.androidDevices})`,
    `chrome on :9222     ${yes(caps.chromeCdp)}`,
  ].join("\n");
}
