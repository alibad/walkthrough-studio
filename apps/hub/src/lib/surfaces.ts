/**
 * The built-in surface registry.
 *
 * A surface is a named capture target with real dimensions and a frame kind.
 * These presets cover the common cases so a project only has to say
 * `surfaceStatus: { "mobile": "done" }`; a project with unusual hardware can
 * declare its own in `catalog.json › surfaces`, which take precedence.
 *
 * Dimensions are *logical* units — CSS pixels for web, points for iOS, dp for
 * Android, character cells for CLI — because that's what a driver is given and
 * what a reader recognizes. `scale` carries the device pixel ratio separately.
 *
 * Ids are load-bearing: they appear in capture paths and in `runs.json`.
 * Renaming one orphans existing captures, so add a surface rather than
 * renaming one.
 */
import type { Platform, Surface } from "./types";

// ── web ─────────────────────────────────────────────────────────────────────

const WEB: Surface[] = [
  {
    id: "desktop",
    label: "Desktop",
    platform: "web",
    width: 1440,
    height: 900,
    scale: 2,
    frame: "browser",
  },
  {
    id: "laptop",
    label: "Laptop",
    platform: "web",
    width: 1280,
    height: 800,
    scale: 2,
    frame: "browser",
  },
  {
    id: "tablet",
    label: "Tablet",
    platform: "web",
    width: 834,
    height: 1112,
    scale: 2,
    frame: "tablet",
    orientation: "portrait",
    deviceName: "iPad Pro 11",
  },
  {
    id: "mobile",
    label: "Mobile",
    platform: "web",
    width: 393,
    height: 852,
    scale: 3,
    frame: "phone",
    orientation: "portrait",
    // A real device descriptor, not just a narrow window — touch events,
    // user agent and DPR all differ, and layouts key off all three.
    deviceName: "iPhone 15 Pro",
  },
];

// ── ios ─────────────────────────────────────────────────────────────────────

const IOS: Surface[] = [
  {
    id: "iphone",
    label: "iPhone",
    platform: "ios",
    width: 393,
    height: 852,
    scale: 3,
    frame: "phone",
    orientation: "portrait",
    deviceName: "iPhone 17 Pro",
  },
  {
    id: "iphone-landscape",
    label: "iPhone · landscape",
    platform: "ios",
    width: 852,
    height: 393,
    scale: 3,
    frame: "phone",
    orientation: "landscape",
    deviceName: "iPhone 17 Pro",
  },
  {
    id: "ipad",
    label: "iPad",
    platform: "ios",
    width: 834,
    height: 1210,
    scale: 2,
    frame: "tablet",
    orientation: "portrait",
    deviceName: "iPad Pro 11-inch",
  },
];

// ── android ─────────────────────────────────────────────────────────────────

const ANDROID: Surface[] = [
  {
    id: "android-phone",
    label: "Android phone",
    platform: "android",
    width: 412,
    height: 915,
    scale: 3,
    frame: "phone",
    orientation: "portrait",
    deviceName: "Pixel 9",
  },
  {
    id: "android-tablet",
    label: "Android tablet",
    platform: "android",
    width: 800,
    height: 1280,
    scale: 2,
    frame: "tablet",
    orientation: "portrait",
    deviceName: "Pixel Tablet",
  },
];

// ── desktop ─────────────────────────────────────────────────────────────────

const DESKTOP: Surface[] = [
  {
    id: "window",
    label: "App window",
    platform: "desktop",
    width: 1280,
    height: 800,
    scale: 2,
    frame: "desktop-window",
  },
  {
    id: "window-compact",
    label: "Compact window",
    platform: "desktop",
    width: 900,
    height: 620,
    scale: 2,
    frame: "desktop-window",
  },
  {
    id: "fullscreen",
    label: "Full screen",
    platform: "desktop",
    width: 1920,
    height: 1080,
    scale: 2,
    frame: "none",
  },
];

// ── cli ─────────────────────────────────────────────────────────────────────

const CLI: Surface[] = [
  {
    id: "terminal",
    label: "Terminal",
    platform: "cli",
    // Pixel size is derived from the grid at render time; the grid is the
    // contract, because that's what wraps output and breaks tables.
    width: 960,
    height: 600,
    scale: 2,
    frame: "terminal",
    columns: 100,
    rows: 30,
  },
  {
    id: "terminal-narrow",
    label: "Narrow terminal",
    platform: "cli",
    width: 720,
    height: 560,
    scale: 2,
    frame: "terminal",
    columns: 80,
    rows: 24,
  },
];

export const BUILTIN_SURFACES: Surface[] = [...WEB, ...IOS, ...ANDROID, ...DESKTOP, ...CLI];

const BY_ID = new Map(BUILTIN_SURFACES.map((s) => [s.id, s]));

/** Surfaces a platform captures by default, primary first. */
export const DEFAULT_SURFACE_IDS: Record<Platform, string[]> = {
  web: ["desktop", "mobile"],
  ios: ["iphone"],
  android: ["android-phone"],
  desktop: ["window"],
  cli: ["terminal"],
};

/**
 * Resolve a surface id against a project's custom surfaces first, then the
 * built-ins. Unknown ids get a permissive placeholder rather than throwing —
 * a capture agent inventing `watch` shouldn't blank the page; it should show
 * up unframed with a visible id so someone notices and adds a preset.
 */
export function resolveSurface(
  id: string,
  custom: Surface[] | undefined,
  platform: Platform,
): Surface {
  const fromCustom = custom?.find((s) => s.id === id);
  if (fromCustom) return fromCustom;
  const builtin = BY_ID.get(id);
  if (builtin) return builtin;
  return {
    id,
    label: id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    platform,
    width: 1280,
    height: 800,
    scale: 2,
    frame: "none",
  };
}

/** Every surface a platform can capture — customs first, then built-ins. */
export function surfacesForPlatform(platform: Platform, custom?: Surface[]): Surface[] {
  const customs = (custom ?? []).filter((s) => s.platform === platform);
  const builtins = BUILTIN_SURFACES.filter(
    (s) => s.platform === platform && !customs.some((c) => c.id === s.id),
  );
  return [...customs, ...builtins];
}

/**
 * Order surfaces for display: the platform's declared defaults first (in
 * order), then anything else alphabetically. Keeps "Desktop, Mobile" from
 * rendering as "Mobile, Desktop" just because of map iteration order.
 */
export function orderSurfaces(surfaces: Surface[], platform: Platform): Surface[] {
  const rank = new Map(DEFAULT_SURFACE_IDS[platform].map((id, i) => [id, i]));
  return [...surfaces].sort((a, b) => {
    const ra = rank.get(a.id) ?? 500;
    const rb = rank.get(b.id) ?? 500;
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label);
  });
}

/** Aspect ratio as a CSS `aspect-ratio` value. */
export function surfaceAspect(surface: Surface): string {
  return `${surface.width} / ${surface.height}`;
}

/** True when the surface is a hand-held form factor — drives layout choices. */
export function isHandheld(surface: Surface): boolean {
  return surface.frame === "phone" || surface.frame === "tablet";
}
