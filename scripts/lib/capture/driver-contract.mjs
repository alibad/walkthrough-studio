/**
 * The capture driver contract.
 *
 * A driver knows how to reach a browser and move a pointer. It does NOT know
 * what a good capture is — that lives in `invariants.mjs` and is applied
 * identically to every driver by `session.mjs`. Splitting it this way is the
 * whole point of the rewrite: swapping the backend must not be able to change
 * what "walked" means.
 *
 * ── Implementing a driver ─────────────────────────────────────────────────
 *
 * Implement the shape below and register it in `index.mjs`. Declare your
 * capabilities honestly in `declares` — the session *verifies* the ones it can
 * verify, and a driver that declares `retina: true` and delivers 1x fails the
 * walk at the first capture rather than silently shipping soft pixels.
 *
 * `declares.video: false` is not a defect. It is recorded in the run manifest
 * and the walk continues; the honest artifact says "no video for this run",
 * which is worth more than a video-shaped file with nothing in it.
 *
 * @typedef {Object} SurfaceSpec
 * @property {string}  id        surface id, e.g. "desktop" / "mobile"
 * @property {number}  width     CSS pixels
 * @property {number}  height    CSS pixels
 * @property {number}  scale     deviceScaleFactor — 2 or 3 for Retina
 * @property {boolean} mobile    real device emulation, not a narrow window
 * @property {string} [userAgent]
 * @property {string} [locale]
 * @property {string} [timezone]
 *
 * @typedef {Object} CaptureContext
 * @property {(url: string) => Promise<void>} goto
 * @property {(expr: string) => Promise<any>} evaluate       evaluates an expression string
 * @property {(css: string) => Promise<void>} injectCss
 * @property {(selector: string) => Promise<boolean>} click  real pointer input; false when absent
 * @property {(text: string, opts?: {role?: string}) => Promise<boolean>} clickText  target by visible text
 * @property {(selector: string, value: string) => Promise<boolean>} fill
 * @property {(key: string) => Promise<void>} press
 * @property {(selector: string, timeoutMs?: number) => Promise<boolean>} waitForSelector
 * @property {(selector: string, offsetPx?: number) => Promise<boolean>} scrollToSelector
 * @property {(absPath: string) => Promise<void>} screenshot  MUST write a PNG
 * @property {() => Promise<void>} settle
 * @property {() => Promise<string|null>} finishVideo   null when unsupported
 * @property {() => Promise<void>} close
 * @property {{type: string, text: string}[]} consoleLog
 * @property {{status: number, url: string, method: string}[]} networkLog
 *
 * @typedef {Object} CaptureDriver
 * @property {string} id
 * @property {string} label
 * @property {{retina: boolean, realMobile: boolean, video: boolean, consoleNetwork: boolean, freshContext: boolean, animationsFrozen: boolean, timeFrozen: boolean}} declares
 * @property {(opts?: object) => Promise<void>} launch
 * @property {(surface: SurfaceSpec, opts?: object) => Promise<CaptureContext>} newContext
 * @property {() => Promise<void>} close
 */

export const CAPABILITY_KEYS = [
  "retina",
  "realMobile",
  "video",
  "consoleNetwork",
  "freshContext",
  "animationsFrozen",
  "timeFrozen",
];
