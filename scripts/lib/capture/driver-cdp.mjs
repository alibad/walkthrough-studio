/**
 * Raw CDP driver — dependency-free, attaches to a Chrome you already have.
 *
 * ── Why a second driver, and why this one ─────────────────────────────────
 *
 * Two things Playwright cannot do:
 *
 *  1. Run where its browsers are not installed. A cold machine pays a 94.3 MiB
 *     download before the first capture. In a CI container or on a locked-down
 *     laptop that is sometimes simply unavailable.
 *  2. Use a browser profile that is already signed in. Some auth gates (SSO
 *     with a hardware key, an MFA push, a corporate IdP) cannot be driven at
 *     all; the only way past them is a human signing in once, in their own
 *     Chrome, and the capture attaching to *that*.
 *
 * This driver speaks the DevTools protocol directly over Node 22's built-in
 * `WebSocket` and `fetch`. No npm dependency, no browser download. Point it at
 * any Chrome started with `--remote-debugging-port=9222`.
 *
 * ── What it was measured to deliver (2026-09-18) ──────────────────────────
 *
 *   retina           Emulation.setDeviceMetricsOverride 1440x900x2 -> 2880x1800 PNG
 *   realMobile       393x852x3 + mobile + touch -> dpr 3, innerWidth 393,
 *                    maxTouchPoints 1, pointer:coarse true
 *   freshContext     Target.createBrowserContext -> distinct storage markers,
 *                    and document.cookie carrying only the page's own cookie
 *                    rather than the host profile's
 *   animationsFrozen NOT native — injected CSS turns two differing captures of
 *                    a spinning page into byte-identical ones. Enforced by the
 *                    session layer, identically to every other backend.
 *   video            NOT AVAILABLE. Declared false; the run manifest records it.
 *
 * ── The one thing worth knowing before you use it ─────────────────────────
 *
 * Clicks go through `Input.dispatchMouseEvent` at the element's centre, not
 * `element.click()`. That is deliberate: a synthetic `.click()` succeeds on an
 * element covered by a modal, so it "works" and captures a screen the user
 * could never have reached. Real pointer input has to pass hit-testing, so
 * when an overlay is in the way the click fails — which is the correct and
 * useful outcome.
 */

import { writeFileSync } from "node:fs";
import { FREEZE_CSS } from "./invariants.mjs";

const DEFAULT_ENDPOINT = "http://127.0.0.1:9222";

/** A minimal CDP session over one WebSocket, with id//response correlation. */
class CdpSocket {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", () => reject(new Error(`CDP socket failed: ${this.url}`)), { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message} (${msg.error.code})`)) : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
      }, 30_000);
    });
  }

  on(method, fn) {
    const arr = this.listeners.get(method) ?? [];
    arr.push(fn);
    this.listeners.set(method, arr);
  }

  close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

export function cdpDriver({ endpoint = DEFAULT_ENDPOINT } = {}) {
  let socket = null;

  return {
    id: "cdp",
    label: "Raw CDP (attached Chrome)",
    declares: {
      retina: true,
      realMobile: true,
      video: false, // measured: the protocol offers screencast frames, not a muxed file
      consoleNetwork: true,
      freshContext: true,
      animationsFrozen: false, // enforced by the session layer via injected CSS
      // The protocol has no equivalent of Playwright's clock API, so a page
      // with a live timestamp stays non-deterministic here and the duplicate
      // guard is correspondingly weaker. Declared false so the run manifest
      // says so rather than implying a determinism this backend does not have.
      timeFrozen: false,
    },

    async launch() {
      let version;
      try {
        version = await fetch(`${endpoint}/json/version`).then((r) => r.json());
      } catch {
        throw new Error(
          `No DevTools endpoint at ${endpoint}. Start Chrome with --remote-debugging-port=9222 ` +
            `(and a dedicated --user-data-dir if you do not want it sharing your everyday profile).`,
        );
      }
      socket = new CdpSocket(version.webSocketDebuggerUrl);
      await socket.open();
    },

    async newContext(surface, opts = {}) {
      // A real browser context, not just a new tab: cookies, localStorage and
      // caches are separate, which is what "fresh per feature" has to mean.
      const { browserContextId } = await socket.send("Target.createBrowserContext", {
        disposeOnDetach: false,
      });
      const { targetId } = await socket.send("Target.createTarget", {
        url: "about:blank",
        browserContextId,
      });
      const { sessionId } = await socket.send("Target.attachToTarget", { targetId, flatten: true });

      const consoleLog = [];
      const networkLog = [];
      const s = (m, p) => socket.send(m, p, sessionId);

      await s("Page.enable");
      await s("Runtime.enable");
      await s("Network.enable");
      await s("Log.enable");

      socket.on("Runtime.consoleAPICalled", (p) => {
        if (p.sessionId && p.sessionId !== sessionId) return;
        consoleLog.push({
          type: p.type,
          text: (p.args ?? []).map((a) => a.value ?? a.description ?? "").join(" "),
        });
      });
      socket.on("Log.entryAdded", (p) => consoleLog.push({ type: p.entry.level, text: p.entry.text }));
      socket.on("Network.responseReceived", (p) =>
        networkLog.push({ status: p.response.status, url: p.response.url, method: "GET" }),
      );

      await s("Emulation.setDeviceMetricsOverride", {
        width: surface.width,
        height: surface.height,
        deviceScaleFactor: surface.scale,
        mobile: !!surface.mobile,
        screenWidth: surface.width,
        screenHeight: surface.height,
      });
      if (surface.mobile) {
        await s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
        await s("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
      }
      if (surface.userAgent) {
        await s("Emulation.setUserAgentOverride", { userAgent: surface.userAgent });
      }
      await s("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
      if (surface.timezone) {
        await s("Emulation.setTimezoneOverride", { timezoneId: surface.timezone }).catch(() => {});
      }

      const evaluate = async (expr) => {
        const res = await s("Runtime.evaluate", {
          expression: expr,
          returnByValue: true,
          awaitPromise: true,
        });
        if (res.exceptionDetails) throw new Error(res.exceptionDetails.text ?? "evaluate failed");
        return res.result?.value;
      };

      /** Element centre in viewport coordinates, or null when it isn't there. */
      const centreOf = async (selector) =>
        evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return null;
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        })()`);

      return {
        consoleLog,
        networkLog,

        async goto(url) {
          await s("Page.navigate", { url });
          // Wait for the load event rather than a fixed pause: the protocol
          // tells us when the document is done, and guessing wastes time on a
          // fast machine and flakes on a slow one.
          await new Promise((resolve) => {
            const done = () => resolve();
            socket.on("Page.loadEventFired", done);
            setTimeout(done, 20_000);
          });
        },
        evaluate,
        async injectCss(css) {
          await evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); return true; })()`);
        },
        async click(selector) {
          const at = await centreOf(selector);
          if (!at) return false;
          for (const type of ["mousePressed", "mouseReleased"]) {
            await s("Input.dispatchMouseEvent", {
              type,
              x: at.x,
              y: at.y,
              button: "left",
              clickCount: 1,
              buttons: type === "mousePressed" ? 1 : 0,
            });
          }
          return true;
        },
        /** Same contract as the Playwright driver: target by visible text. */
        async clickText(text, { role = "button" } = {}) {
          const at = await evaluate(`(() => {
            const want = ${JSON.stringify(text)}.toLowerCase();
            const tags = ['button', 'a', '[role="button"]', 'summary', 'label'];
            const pool = tags.flatMap((t) => [...document.querySelectorAll(t)]);
            const hit = pool.find((el) => (el.innerText || el.textContent || '').trim().toLowerCase().includes(want));
            if (!hit) return null;
            const r = hit.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return null;
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          })()`);
          if (!at) return false;
          for (const type of ["mousePressed", "mouseReleased"]) {
            await s("Input.dispatchMouseEvent", {
              type, x: at.x, y: at.y, button: "left", clickCount: 1,
              buttons: type === "mousePressed" ? 1 : 0,
            });
          }
          return true;
        },
        async fill(selector, value) {
          const at = await centreOf(selector);
          if (!at) return false;
          await this.click(selector);
          await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) { el.value = ''; } return true; })()`);
          await s("Input.insertText", { text: value });
          // React and friends listen for input/change, and insertText alone
          // does not always reach a controlled component's onChange.
          await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return false;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true; })()`);
          return true;
        },
        async press(key) {
          const keyMap = { Enter: { windowsVirtualKeyCode: 13, key: "Enter", text: "\r" }, Escape: { windowsVirtualKeyCode: 27, key: "Escape" }, Tab: { windowsVirtualKeyCode: 9, key: "Tab" } };
          const k = keyMap[key] ?? { key };
          await s("Input.dispatchKeyEvent", { type: "keyDown", ...k });
          await s("Input.dispatchKeyEvent", { type: "keyUp", ...k });
        },
        async waitForSelector(selector, timeoutMs = 10_000) {
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return true;
            await new Promise((r) => setTimeout(r, 150));
          }
          return false;
        },
        async scrollToSelector(selector, offsetPx = 80) {
          const ok = await evaluate(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return false;
            const top = el.getBoundingClientRect().top + window.scrollY - ${offsetPx};
            window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
            return true;
          })()`);
          if (ok) await new Promise((r) => setTimeout(r, 350));
          return !!ok;
        },
        async screenshot(absPath) {
          const { data } = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
          writeFileSync(absPath, Buffer.from(data, "base64"));
        },
        async settle() {
          await evaluate("document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true").catch(() => {});
          await this.injectCss(FREEZE_CSS);
          await new Promise((r) => setTimeout(r, 250));
        },
        async finishVideo() {
          return null; // declared false; the session records it honestly
        },
        async close() {
          await socket.send("Target.closeTarget", { targetId }).catch(() => {});
          await socket.send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
        },
      };
    },

    async close() {
      socket?.close();
      socket = null;
    },
  };
}
