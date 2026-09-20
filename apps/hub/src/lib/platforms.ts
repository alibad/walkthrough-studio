/**
 * Platform metadata — the display and capability layer over `Platform`.
 *
 * Kept separate from `types.ts` so the contract stays data-only and this file
 * can reference art paths, icon names and copy without the capture agent
 * needing to care about any of it.
 */
import type { CaptureDriver, Platform } from "./types";
import { DRIVERS_BY_PLATFORM, LOCATION_KIND } from "./types";

export interface PlatformProfile {
  id: Platform;
  label: string;
  /** Short label for chips and dense tables. */
  short: string;
  /** One line explaining what this platform means for a walkthrough. */
  blurb: string;
  /** Lucide icon name, resolved in `components/platform-icon.tsx`. */
  icon: "globe" | "smartphone" | "monitor" | "terminal" | "tablet";
  /** Generated stipple emblem, under `/art/`. */
  art: string;
  /** Vocabulary for the `location` field. */
  location: { label: string; example: string };
  drivers: CaptureDriver[];
  /** The driver used when a project doesn't name one. */
  defaultDriver: CaptureDriver;
  /** Skill reference that documents how to drive this platform. */
  driverDoc: string;
}

export const PLATFORM_PROFILES: Record<Platform, PlatformProfile> = {
  web: {
    id: "web",
    label: "Web app",
    short: "Web",
    blurb:
      "Driven in a real browser. Captures span viewports and locales, and the app is reachable by URL, so deep-linking straight to a feature is cheap.",
    icon: "globe",
    art: "/art/platform-web.png",
    location: LOCATION_KIND.web,
    drivers: DRIVERS_BY_PLATFORM.web,
    defaultDriver: "playwright",
    driverDoc: "drivers/web-playwright.md",
  },
  ios: {
    id: "ios",
    label: "iOS app",
    short: "iOS",
    blurb:
      "Driven in the iOS Simulator. Navigation is by tap, not by URL, so most features have to be reached through the app's own flow — or by a deep link if the app registers a scheme.",
    icon: "smartphone",
    art: "/art/platform-mobile.png",
    location: LOCATION_KIND.ios,
    drivers: DRIVERS_BY_PLATFORM.ios,
    defaultDriver: "ios-simulator",
    driverDoc: "drivers/ios-simulator.md",
  },
  android: {
    id: "android",
    label: "Android app",
    short: "Android",
    blurb:
      "Driven on an emulator or attached device over adb. Activities can be launched directly, which makes feature isolation easier than on iOS.",
    icon: "smartphone",
    art: "/art/platform-mobile.png",
    location: LOCATION_KIND.android,
    drivers: DRIVERS_BY_PLATFORM.android,
    defaultDriver: "android-emulator",
    driverDoc: "drivers/android-emulator.md",
  },
  desktop: {
    id: "desktop",
    label: "Desktop app",
    short: "Desktop",
    blurb:
      "Driven as a windowed application. Electron apps expose a real Chromium and behave like web; native apps are driven through the OS accessibility layer.",
    icon: "monitor",
    art: "/art/platform-desktop.png",
    location: LOCATION_KIND.desktop,
    drivers: DRIVERS_BY_PLATFORM.desktop,
    defaultDriver: "electron",
    driverDoc: "drivers/desktop.md",
  },
  cli: {
    id: "cli",
    label: "Command line",
    short: "CLI",
    blurb:
      "Driven in a pseudo-terminal. A step is a command and its output; the capture is a rendered terminal frame, so help text, errors and progress all document themselves.",
    icon: "terminal",
    art: "/art/platform-cli.png",
    location: LOCATION_KIND.cli,
    drivers: DRIVERS_BY_PLATFORM.cli,
    defaultDriver: "terminal",
    driverDoc: "drivers/cli-terminal.md",
  },
};

export function platformProfile(platform: Platform): PlatformProfile {
  return PLATFORM_PROFILES[platform] ?? PLATFORM_PROFILES.web;
}

/** The driver a project will actually use. */
export function effectiveDriver(
  platform: Platform,
  declared?: CaptureDriver,
): CaptureDriver {
  if (declared && DRIVERS_BY_PLATFORM[platform]?.includes(declared)) return declared;
  return platformProfile(platform).defaultDriver;
}

export const DRIVER_LABELS: Record<CaptureDriver, string> = {
  playwright: "Playwright",
  "chrome-cli": "Headless Chrome",
  "ios-simulator": "iOS Simulator",
  "android-emulator": "Android emulator",
  electron: "Electron",
  "macos-native": "macOS accessibility",
  "windows-native": "Windows UI Automation",
  terminal: "Pseudo-terminal",
};

/**
 * Format a location for display. Web routes get no decoration (they already
 * read as paths); everything else gets a light prefix so a bare string like
 * `SettingsScreen` doesn't read as a typo'd route.
 */
export function formatLocation(location: string | undefined, platform: Platform): string {
  if (!location) return "";
  if (platform === "cli") return `$ ${location.replace(/^\$\s*/, "")}`;
  return location;
}
