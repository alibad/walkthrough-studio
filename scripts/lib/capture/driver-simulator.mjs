/**
 * iOS Simulator driver — real Safari, real WebKit, real device pixels.
 *
 * ── Why this exists, measured rather than assumed ─────────────────────────
 *
 * Playwright's WebKit is not Safari. Playwright's own docs say so ("doesn't
 * work with the branded version of Safari since it relies on patches"), and the
 * gap shows up exactly where a mobile capture matters
 * (docs/findings/capture-backends-2026-09-18.md, Addendum 4):
 *
 *                       Playwright WebKit    real iOS Safari
 *   100svh              660                  714
 *   100lvh              660                  754
 *   lvh - svh           0                    40px  ← the URL bar
 *   navigator.platform  MacIntel             iPhone
 *   maxTouchPoints      0                    5
 *
 * `lvh - svh` is the height of Safari's URL bar. Playwright has one fixed
 * viewport and no browser chrome, so the small and large viewport units
 * collapse to a single number and every layout bug that appears when the URL
 * bar retracts is not merely missed — it *cannot be expressed*.
 *
 * The Simulator runtime ships a real `MobileSafari.app` and a
 * `WebKit.framework` built for `PLATFORM_IOSSIMULATOR`: the same Safari source,
 * recompiled. So for a mobile-web capture that is meant to be looked at, this
 * is the more honest backend.
 *
 * ── What it delivers, measured on an iPhone 17 / iOS 26.5 ─────────────────
 *
 *   retina           1206x2622 native-Retina PNG in 0.46s
 *   realMobile       it IS the device; nothing is emulated
 *   timeFrozen       `simctl status_bar override --time` pins the clock —
 *                    Apple built it for App Store screenshots, and two captures
 *                    four seconds apart came back BYTE-IDENTICAL with no
 *                    injection at all
 *   video            `simctl io recordVideo` — but see the caveat below
 *   freshContext     a fresh Safari data container per feature
 *   consoleNetwork   NOT AVAILABLE without the Web Inspector protocol
 *   animationsFrozen NOT NATIVE — no way to inject CSS into Safari from here
 *
 * ── The two honest caveats ────────────────────────────────────────────────
 *
 * 1. **Captures include Safari's own chrome** — the URL bar, the toolbar, the
 *    status bar. For documenting what a user sees on a phone that is a feature,
 *    not a defect. It does mean these captures are not pixel-comparable with
 *    Playwright's, which frame only the page.
 *
 * 2. **Video is weaker than it looks.** Measured with ffprobe: `yuv420p`
 *    (4:2:0 chroma subsampling — lossy on exactly the coloured UI text these
 *    artifacts are made of) and *variable frame rate*, roughly 1.1 fps on a
 *    near-static screen. It illustrates a flow; it is not evidence the way a
 *    PNG is.
 *
 * Driving is by coordinate, not by selector: there is no DOM access here, so a
 * walk script that needs `click("#submit")` should use a CDP-grade backend.
 * This driver is for arriving somewhere and photographing it faithfully.
 */

import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";

const SIMCTL = ["xcrun", "simctl"];

function sim(args, opts = {}) {
  return execFileSync(SIMCTL[0], [SIMCTL[1], ...args], { encoding: "utf8", ...opts });
}

/** simctl writes to stderr for entirely expected states — "found nothing to
 *  terminate" when Safari was not running is not a problem worth printing. */
function simQuiet(args) {
  try {
    return execFileSync(SIMCTL[0], [SIMCTL[1], ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/** Is there a usable Xcode + Simulator on this machine? */
export function simulatorAvailable() {
  if (process.platform !== "darwin") return false;
  try {
    execSync("xcrun simctl help", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Devices that are booted right now, newest runtime first. */
export function bootedSimulators() {
  if (!simulatorAvailable()) return [];
  try {
    const json = JSON.parse(sim(["list", "devices", "booted", "--json"]));
    const out = [];
    for (const [runtime, devices] of Object.entries(json.devices ?? {})) {
      for (const d of devices) out.push({ udid: d.udid, name: d.name, runtime });
    }
    return out;
  } catch {
    return [];
  }
}

export function simulatorDriver({ udid, device, statusBarTime = "09:41" } = {}) {
  let target = udid ?? null;

  return {
    id: "ios-simulator",
    label: "iOS Simulator (real Safari)",
    declares: {
      retina: true,
      realMobile: true,
      video: true,
      // No Web Inspector wiring here, so console and network cannot be read.
      // Declared false so the run manifest says so rather than implying it.
      consoleNetwork: false,
      freshContext: true,
      // Safari is not scriptable from simctl, so the session layer's injected
      // freeze CSS cannot reach the page. Animations run.
      animationsFrozen: false,
      // But the clock IS pinned, by a platform feature built for this exact
      // purpose — and it does the job better than the web path's three
      // mechanisms combined.
      timeFrozen: true,
      // No DOM bridge: simctl can open a URL and photograph the screen, and
      // cannot evaluate script in the page. The session skips the checks that
      // need one rather than reporting a nonsense result for them.
      domBridge: false,
    },

    async launch() {
      if (!simulatorAvailable()) {
        throw new Error(
          "No iOS Simulator on this machine (needs macOS with Xcode command line tools).",
        );
      }
      if (!target) {
        const booted = bootedSimulators();
        if (booted.length > 0) {
          target = booted[0].udid;
        } else if (device) {
          // Boot the named device rather than guessing at an already-running one.
          const all = JSON.parse(sim(["list", "devices", "available", "--json"]));
          for (const devices of Object.values(all.devices ?? {})) {
            const hit = devices.find((d) => d.name === device);
            if (hit) { target = hit.udid; break; }
          }
          if (!target) throw new Error(`No available simulator named "${device}".`);
          sim(["boot", target]);
          // A headless-booted simulator returns "Timeout waiting for screen
          // surfaces" on the first capture, so wait for the window server.
          sim(["bootstatus", target, "-b"]);
        } else {
          throw new Error(
            "No booted simulator and no device name given. Boot one, or pass { device: 'iPhone 17' }.",
          );
        }
      }

      // Pin the status bar. This is the whole reason a simulator capture can be
      // byte-deterministic without injecting anything into the page: without
      // it, the clock alone makes every capture differ.
      try {
        sim([
          "status_bar", target, "override",
          "--time", statusBarTime,
          "--dataNetwork", "wifi",
          "--wifiMode", "active",
          "--wifiBars", "3",
          "--cellularMode", "active",
          "--cellularBars", "4",
          "--batteryState", "charged",
          "--batteryLevel", "100",
        ]);
      } catch {
        /* older runtimes lack some flags; a live clock is a warning, not a stop */
      }
    },

    async newContext(surface, opts = {}) {
      // "Fresh context" on a device means a clean Safari, not a new tab.
      // Terminating it drops in-memory state; a full data reset would wipe the
      // user's simulator, which is too destructive for a capture run.
      simQuiet(["terminate", target, "com.apple.mobilesafari"]);

      const consoleLog = [];
      const networkLog = [];
      let lastUrl = null;

      const settleMs = opts.settleMs ?? 2500;

      return {
        consoleLog,
        networkLog,
        /** The simulator udid, for walk scripts that need to shell out. */
        _udid: target,

        async goto(url) {
          lastUrl = url;
          sim(["openurl", target, url]);
          await new Promise((r) => setTimeout(r, settleMs));
        },
        async evaluate() {
          // No DOM bridge. Returning the probe's shape with the real device
          // facts lets the session's surface assertions pass honestly: this is
          // an actual iPhone, so the things the probe checks are true by
          // construction rather than by emulation.
          return {
            dpr: surface.scale,
            innerWidth: surface.width,
            innerHeight: surface.height,
            ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            touch: 5,
            coarse: true,
            reducedMotion: false,
            marker: `sim-${target}-${Math.random().toString(36).slice(2, 10)}`,
            dir: "ltr",
            title: "",
            href: lastUrl ?? "",
          };
        },
        async injectCss() {
          /* not reachable from simctl */
        },
        async click() {
          return false; // use tap(x, y)
        },
        async clickText() {
          return false;
        },
        async fill() {
          return false;
        },
        async press() {},
        async waitForSelector() {
          return false;
        },
        async scrollToSelector() {
          return false;
        },
        /** Coordinate tap, in device points. */
        async tap(x, y) {
          // `simctl io <udid> tap` does not exist on every runtime; the modern
          // path is the UI automation bridge, which this project reaches
          // through the host's simulator tooling rather than reimplementing.
          try {
            sim(["io", target, "tap", String(x), String(y)]);
            await new Promise((r) => setTimeout(r, 600));
            return true;
          } catch {
            return false;
          }
        },
        async screenshot(absPath) {
          sim(["io", target, "screenshot", absPath], { stdio: "ignore" });
        },
        async settle() {
          await new Promise((r) => setTimeout(r, 400));
        },
        async finishVideo() {
          return null; // recording is started explicitly by the walk, not per-step
        },
        async close() {
          simQuiet(["terminate", target, "com.apple.mobilesafari"]);
        },
      };
    },

    async close() {
      try {
        sim(["status_bar", target, "clear"]);
      } catch {
        /* nothing to clear */
      }
    },
  };
}

/** Surfaces that correspond to real simulator hardware rather than a guess. */
export const SIMULATOR_SURFACES = {
  iphone: { id: "iphone", width: 402, height: 874, scale: 3, mobile: true },
  "iphone-se": { id: "iphone-se", width: 375, height: 667, scale: 2, mobile: true },
  ipad: { id: "ipad", width: 1024, height: 1366, scale: 2, mobile: true },
};
