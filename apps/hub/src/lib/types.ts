/**
 * Walkthrough Studio — the data contract.
 *
 * Everything in this file is written by a capture agent (see
 * `plugins/walkthrough`) and read by the hub. It is the single source of truth
 * for both sides; if you change a shape here, update
 * `plugins/walkthrough/skills/walkthrough/references/output-format.md` in the
 * same commit.
 *
 * ── The one idea that makes this platform-agnostic ────────────────────────
 *
 * The original version of this schema was web-shaped: a project had a URL, a
 * step had a `route`, and a capture had a `viewport` that was either
 * `"desktop"` or `"mobile"`. None of that survives contact with an iOS app, a
 * macOS menu-bar utility, or a CLI.
 *
 * So three web-specific concepts are replaced by three general ones:
 *
 *   url      → `ProjectTarget`  — how a driver *reaches* the app, which is a
 *                                 base URL for web, a bundle id + device for
 *                                 mobile, an executable for desktop, a command
 *                                 for a CLI.
 *   route    → `location`       — one string whose *semantics* depend on the
 *                                 platform. A path, a screen name, a deep
 *                                 link, a window title, an argv. Documented
 *                                 per-platform on the field itself.
 *   viewport → `Surface`        → a named capture surface with real pixel
 *                                 dimensions and a frame kind, so the hub
 *                                 knows whether to draw browser chrome, a
 *                                 phone bezel, a window title bar, or a
 *                                 terminal.
 *
 * Everything else — catalogs, steps, personas, journeys, runs, health — is
 * already platform-neutral and is kept close to its original form.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Platforms and drivers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The kind of application being walked. This is the top-level axis of the
 * whole product: it selects a default driver, a location vocabulary, a set of
 * surfaces, and the frame the hub draws around a capture.
 */
export type Platform = "web" | "ios" | "android" | "desktop" | "cli";

export const PLATFORMS: Platform[] = ["web", "ios", "android", "desktop", "cli"];

/**
 * How an agent actually drives the app to capture it. A project declares one;
 * the skill's driver references (`plugins/walkthrough/skills/walkthrough/drivers/`)
 * document the mechanics of each.
 */
export type CaptureDriver =
  /** Web: Playwright (or Playwright MCP) against a real browser. */
  | "playwright"
  /** Web fallback: headless Chrome CLI, one screenshot per process. */
  | "chrome-cli"
  /** iOS: `simctl` + the accessibility tree, via the simulator control tool. */
  | "ios-simulator"
  /** Android: `adb` + `uiautomator` dumps against an emulator or device. */
  | "android-emulator"
  /** Desktop: Playwright's Electron support — a real Chromium under the hood. */
  | "electron"
  /** Desktop: native macOS, `screencapture` + the accessibility API. */
  | "macos-native"
  /** Desktop: native Windows, UI Automation. */
  | "windows-native"
  /** CLI: a pseudo-terminal session recorded frame by frame. */
  | "terminal";

/** Drivers that are valid for a given platform, best first. */
export const DRIVERS_BY_PLATFORM: Record<Platform, CaptureDriver[]> = {
  web: ["playwright", "chrome-cli"],
  ios: ["ios-simulator"],
  android: ["android-emulator"],
  desktop: ["electron", "macos-native", "windows-native"],
  cli: ["terminal"],
};

/**
 * What a `location` string means on each platform. Purely presentational —
 * the hub uses it to label and prefix the value correctly. The location itself
 * is always one plain string.
 */
export const LOCATION_KIND: Record<Platform, { label: string; example: string }> = {
  web: { label: "Route", example: "/settings/billing" },
  ios: { label: "Screen", example: "SettingsScreen" },
  android: { label: "Screen", example: "com.acme/.SettingsActivity" },
  desktop: { label: "Window", example: "Preferences › Network" },
  cli: { label: "Command", example: "acme deploy --dry-run" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Surfaces — the generalized viewport
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How the hub decorates a capture. A screenshot of a phone app inside browser
 * chrome looks wrong; a terminal capture inside a phone bezel looks absurd.
 * The frame is a property of the surface, not of the viewer.
 */
export type FrameKind =
  | "browser"
  | "phone"
  | "tablet"
  | "desktop-window"
  | "terminal"
  | "none";

/**
 * A named capture surface. Replaces the old `viewport: "desktop" | "mobile"`.
 *
 * Surfaces are identified by a stable `id` that appears in filenames and in
 * `runs.json`, so renaming one orphans existing captures — add a new surface
 * instead. Built-ins live in `lib/surfaces.ts`; a project may define its own
 * in `catalog.json › surfaces` for hardware we don't ship a preset for.
 */
export interface Surface {
  /** Stable slug, used in paths (`{featureId}/{surfaceId}/step-01.png`). */
  id: string;
  label: string;
  platform: Platform;
  /** Logical pixels (CSS px for web, points for iOS, dp for Android). */
  width: number;
  height: number;
  /** Device pixel ratio the capture should be taken at. Default 2. */
  scale?: number;
  frame: FrameKind;
  orientation?: "portrait" | "landscape";
  /**
   * Driver-specific device name, when the driver emulates real hardware —
   * a Playwright device descriptor, a `simctl` device name, an AVD name.
   */
  deviceName?: string;
  /** For `cli` surfaces: terminal grid, which is what actually matters. */
  columns?: number;
  rows?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Project registry (`projects.json`)
// ─────────────────────────────────────────────────────────────────────────────

export interface LabeledUrl {
  label: string;
  url: string;
}

/** One repository location — a project's primary repo or a nested service. */
export interface ProjectCodebaseEntry {
  /** `owner/repo`, for deep links. */
  github?: string;
  /** Sub-path inside the repo, when many apps share a monorepo. */
  githubPath?: string;
  githubBranch?: string;
  /** Local filesystem path. May contain `~`. Required for staleness checks. */
  local?: string;
  /**
   * Free-form framework hint the capture agent uses to guess where screens
   * live — `nextjs-app-router`, `swiftui`, `jetpack-compose`, `flutter`,
   * `react-native`, `electron-react`, `tauri`, `cobra-cli`, …
   */
  framework?: string;
}

export interface ProjectCodebase extends ProjectCodebaseEntry {
  frontend?: ProjectCodebaseEntry;
  backend?: ProjectCodebaseEntry;
  /** Extra services keyed by role — `agents`, `ml`, `shared`, … */
  other?: Record<string, ProjectCodebaseEntry>;
}

/**
 * How to launch the app locally so the agent can drive it. Optional — when
 * absent, the agent assumes the app is already running (web) or already
 * installed (mobile/desktop).
 */
export interface LaunchRecipe {
  /** Shell command, run from `cwd`. */
  command: string;
  cwd?: string;
  /** Port to wait on before capturing (web/electron dev servers). */
  port?: number;
  /** Substring in stdout that means "ready". Checked when `port` is absent. */
  readyWhen?: string;
  env?: Record<string, string>;
  /** Seconds to wait before giving up. Default 120. */
  timeoutSeconds?: number;
}

/**
 * Everything a driver needs to reach the app. Which fields matter depends on
 * `platform`; the hub only ever *displays* these, it never launches anything.
 */
export interface ProjectTarget {
  platform: Platform;
  /** Defaults to the first entry of `DRIVERS_BY_PLATFORM[platform]`. */
  driver?: CaptureDriver;

  // ── web ────────────────────────────────────────────────────────────────
  local?: string;
  staging?: string;
  production?: string;
  /** Extra labeled URLs — prototype, demo video, dashboards. */
  other?: LabeledUrl[];

  // ── ios / android ──────────────────────────────────────────────────────
  /** `com.acme.app` — used to launch and to terminate between features. */
  bundleId?: string;
  /** Built artifact: `.app` for a simulator, `.apk` for an emulator. */
  appPath?: string;
  /** Default device/emulator, e.g. `iPhone 17 Pro`, `Pixel_9_API_36`. */
  device?: string;
  /** URL scheme for deep-linking straight to a screen. */
  urlScheme?: string;

  // ── desktop ────────────────────────────────────────────────────────────
  /** Path to the app bundle or executable. */
  executable?: string;
  /** For Electron: the entry point Playwright should launch. */
  electronMain?: string;

  // ── cli ────────────────────────────────────────────────────────────────
  /** The binary under test, e.g. `acme` or `./bin/acme`. */
  binary?: string;

  /** How to bring the app up locally, when it isn't already running. */
  launch?: LaunchRecipe;
}

export interface ProjectAuthRole {
  /** Email/username. Absent for shared-secret gates with no identity. */
  email?: string;
  /**
   * Literal value, or a `$ENV_VAR_NAME` placeholder the runner resolves from
   * `.env.local` at capture time. Never commit a literal secret.
   */
  password?: string;
  /** Free-form note shown on the quick-login card. */
  note?: string;
}

export interface ProjectAuth {
  /**
   * Mechanism hint the capture agent uses to pick an interaction pattern:
   * `none`, `site-password`, `email-password`, `oauth`, `sso`, `biometric`,
   * `api-token`, `device-account`, `keychain`.
   */
  type: string;
  /** Where the login gate lives — a route, a screen name, a command. */
  loginLocation?: string;
  /** `default` for shared gates; persona ids for per-role logins. */
  roles?: Record<string, ProjectAuthRole>;
  /**
   * True when auth must be done by a human once and then reused (SSO, MFA,
   * biometric). The agent should persist and reuse session state rather than
   * re-authenticating per feature.
   */
  interactiveOnly?: boolean;
  /** Where reusable session state is cached, relative to the project dir. */
  storageStatePath?: string;
}

export interface ProjectLinks {
  docs?: string | LabeledUrl[];
  design?: string | LabeledUrl[];
  issues?: string | LabeledUrl[];
  chat?: string | LabeledUrl[];
  other?: LabeledUrl[];
}

export interface ProjectHeroMedia {
  /** Path relative to `/walkthroughs/{slug}/`. */
  image: string;
  video?: string;
  aspect?: "16/10" | "16/9" | "4/3" | "3/2";
  caption?: string;
}

export interface ProjectImpactStat {
  value: string;
  label: string;
  hint?: string;
}

export interface ProjectStoryBeat {
  /** Must match a `featureId` in the catalog. */
  featureId: string;
  headline?: string;
  blurb?: string;
}

/** Optional narrative layer for the project page. Degrades gracefully. */
export interface ProjectNarrative {
  impactHeadline?: string;
  heroMedia?: ProjectHeroMedia;
  impactStats?: ProjectImpactStat[];
  story?: ProjectStoryBeat[];
  screenshots?: { image: string; caption: string }[];
}

export interface Project {
  slug: string;
  name: string;
  /** One-liner, shown on cards. */
  description?: string;
  /** Longer blurb, shown on the project page. */
  longDescription?: string;
  /** Owning team or customer tag. */
  tag?: string;
  /**
   * The app under documentation. A project is one app on one platform — a
   * product shipping a web app *and* an iOS app is two registry entries that
   * share a `codebase`, because they capture completely differently.
   */
  target: ProjectTarget;
  codebase?: ProjectCodebase;
  links?: ProjectLinks;
  auth?: ProjectAuth;
  narrative?: ProjectNarrative;
  /** Free-form display metadata. Never load-bearing. */
  meta?: Record<string, string | undefined>;
}

export interface ProjectsRegistry {
  projects: Project[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog (`{slug}/catalog.json`)
// ─────────────────────────────────────────────────────────────────────────────

/** Colours and type lifted from the target app, so guides look like the app. */
export interface CatalogBrand {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  logoPath?: string;
  fontFamily?: string;
}

export type CaptureStatus = "done" | "pending" | "blocked" | "skipped";

export interface CatalogFeature {
  featureId: string;
  featureName: string;
  /**
   * Where the feature lives. Semantics follow the project's platform:
   *   web      → URL path, `/settings/billing`
   *   ios      → screen identifier or deep link, `SettingsScreen`
   *   android  → activity or screen, `com.acme/.SettingsActivity`
   *   desktop  → window or pane path, `Preferences › Network`
   *   cli      → the invocation, `acme deploy --dry-run`
   */
  location: string;
  /** Grouping label — `onboarding`, `settings`, `reporting`, … */
  category: string;
  requiresAuth: boolean;
  /** Key into `auth.roles` when this feature needs a specific identity. */
  authRole?: string;
  /**
   * Capture status per surface id — `{ desktop: "done", mobile: "pending" }`.
   * Replaces the old fixed `desktopStatus`/`mobileStatus` pair, so a project
   * can track a tablet, a watch, or three phone sizes without a schema change.
   */
  surfaceStatus: Record<string, CaptureStatus>;
  videoStatus?: CaptureStatus;
  issueCount?: number;
  lastWalkthroughAt?: string | null;
  lastCodeChangeAt?: string | null;
  /**
   * True when the feature was mapped from source but never actually driven.
   * The hub labels these explicitly — a described feature is not a walked one.
   */
  synthetic?: boolean;
  syntheticReason?: string;
  /** Selectors harvested from source: `data-testid`, accessibility ids, … */
  testIds?: string[];
  /** Notes the capture agent wants to surface (blockers, gotchas). */
  notes?: string;
}

export interface CatalogPersona {
  id: string;
  name: string;
  description: string;
  /** Key into `auth.roles`. */
  authRole?: string;
  /** Where this persona starts. Same semantics as `CatalogFeature.location`. */
  entryPoint?: string;
  /** Journey ids walked for this persona. */
  keyJourneys?: string[];
  /** The persona's own navigation vocabulary. */
  navItems?: { label: string; location: string }[];
  /** Portrait / scene art, relative to `/walkthroughs/{slug}/`. */
  portrait?: string;
  scene?: string;
}

export interface Catalog {
  projectName: string;
  platform: Platform;
  driver?: CaptureDriver;
  /** Where the capture ran: a base URL, a device name, a host. */
  capturedAgainst?: string;
  /**
   * Surfaces this project captures. Ids referenced by `surfaceStatus` and by
   * walkthrough files. Omit to accept the platform defaults from
   * `lib/surfaces.ts`.
   */
  surfaces?: Surface[];
  brand?: CatalogBrand;
  discoveredAt: string;
  updatedAt: string;
  features: CatalogFeature[];
  personas?: CatalogPersona[];
  /** True when the catalog as a whole was authored without live capture. */
  synthetic?: boolean;
  syntheticNote?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Walkthroughs (`{slug}/{featureId}.{surfaceId}.json`)
// ─────────────────────────────────────────────────────────────────────────────

export interface StepAnnotation {
  type: "tip" | "warning" | "important";
  text: string;
}

/**
 * Honesty signal, per step. The hub renders anything other than `live-walked`
 * with a visible badge — an unmarked step is a claim that a human-equivalent
 * agent really did this against the running app.
 */
export type VerificationStatus =
  /** Driven against the running app; the pixels are real. */
  | "live-walked"
  /** Described from source or docs. No capture happened. */
  | "synthetic"
  /** Surface reached, but the action was deliberately not taken because it
   *  would mutate real state (a Send, a Delete, a payment). */
  | "gated-write";

export interface WalkthroughStep {
  stepNumber: number;
  title: string;
  /** Markdown. Rendered through `<Prose>` — don't pre-flatten it. */
  description: string;
  /** Path relative to `/walkthroughs/{slug}/`. */
  screenshotFilename: string;
  /**
   * Extra frames for steps that span several UI states (a streaming
   * response, a carousel, a multi-turn exchange). `screenshotFilename` is
   * always frame 0. When non-empty the viewer renders a frame slider.
   */
  screenshotFrames?: string[];
  /** Captions aligned to `[screenshotFilename, ...screenshotFrames]`. */
  frameCaptions?: string[];
  /** Clip for steps where timing or audio carries the meaning. */
  videoFilename?: string;
  screenshotAlt?: string;
  /** Same semantics as `CatalogFeature.location`. */
  location?: string;
  annotations?: StepAnnotation[];
  verificationStatus?: VerificationStatus;
  /**
   * The interaction performed to *reach* this state, in plain language:
   * "Tapped Continue", "Typed a rent figure into the Income field",
   * "Ran `acme deploy --dry-run`". This is what proves the step advanced.
   */
  action?: string;
  /** For persona journeys — which feature walk this step came from. */
  sourceFeature?: string;
}

export interface Walkthrough {
  featureId: string;
  featureName: string;
  type: "feature" | "persona";
  /** Persona id, for `type: "persona"`. */
  persona?: string;
  /** Primary location; `locations` when the walk spans several. */
  location?: string;
  locations?: string[];
  category?: string;
  /** Surface id this file captures. Matches a `Surface.id`. */
  surface: string;
  platform: Platform;
  /** Locale of this capture, when the app is localized. BCP-47. */
  locale?: string;
  /** One-paragraph framing, markdown. */
  overview: string;
  headline?: string;
  targetAudience?: string;
  steps: WalkthroughStep[];
  video?: {
    file?: string;
    format?: string;
    durationMs?: number;
    generatedAt?: string;
  };
  keyFeatures?: string[];
  tips?: string[];
  personaInsights?: string[];
  generatedAt?: string;
  /** Whole-walkthrough honesty signal. */
  synthetic?: boolean;
  syntheticReason?: string;
  /** Genuine gaps only — never "cost gate" or "it was slow". */
  note?: string;
  capturedAt?: string;
  /** git sha of the target at capture time — the anchor for staleness. */
  targetSha?: string;
  targetCommitDate?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixes (`{slug}/fixes.json`)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifiedFix {
  id: string;
  title: string;
  description?: string;
  /** Where the bug lived. Same semantics as `CatalogFeature.location`. */
  location?: string;
  featureId?: string;
  /** Commit or PR that fixed it. */
  commit?: string;
  prUrl?: string;
  issueUrl?: string;
  fixedAt?: string;
  verifiedAt?: string;
  /** Proof captures, relative to `/walkthroughs/{slug}/`. */
  beforeScreenshot?: string;
  afterScreenshot?: string;
  video?: string;
  status: "verified" | "unverified" | "regressed";
  surface?: string;
}

export interface FixesFile {
  fixes: VerifiedFix[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Issues (`{slug}/issues.json`)
// ─────────────────────────────────────────────────────────────────────────────

export interface CapturedIssue {
  id: string;
  featureId?: string;
  location?: string;
  surface?: string;
  severity: "blocker" | "major" | "minor" | "polish";
  title: string;
  detail?: string;
  /** Console / logcat / stderr excerpt that evidences it. */
  evidence?: string;
  screenshot?: string;
  foundAt: string;
  status?: "open" | "fixed" | "wontfix";
}

export interface IssuesFile {
  issues: CapturedIssue[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Run history (`{slug}/runs.json`)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One capture run. Append-only: never mutate a historical entry. This is how
 * the hub answers "when did we last walk this?" and "has the app moved since?"
 */
export interface RunManifest {
  /** ISO timestamp, also the run id. */
  id: string;
  startedAt: string;
  completedAt: string;
  /** Skill or tool that produced the run. */
  skill?: string;
  /** Which agent ran it — `claude-opus-5`, `codex`, `ali-local`, … */
  agent?: string;
  /** State of the target codebase at capture time. */
  target: {
    sha: string;
    shaShort: string;
    branch?: string;
    dirty?: boolean;
    commitDate?: string;
    commitSubject?: string;
    /** Repo-relative path diffs are scoped to. */
    watchPath?: string;
  };
  config: {
    platform: Platform;
    driver: CaptureDriver;
    /** Base URL, device name, or host the run executed against. */
    capturedAgainst?: string;
    env?: Record<string, string>;
    /** Surface ids covered. */
    surfaces: string[];
    locales?: string[];
    notes?: string;
  };
  coverage: {
    features: string[];
    personas?: string[];
    screenshots: number;
    videos?: number;
    issues?: number;
  };
}

export interface RunsFile {
  runs: RunManifest[];
}

export type StalenessVerdict = "fresh" | "stale" | "very-stale" | "never" | "unknown";

export interface CommitSummary {
  sha: string;
  shaShort: string;
  subject: string;
  date: string;
  author?: string;
}

export interface StalenessReport {
  lastRunAt: string | null;
  lastRunSha: string | null;
  lastRunShaShort: string | null;
  currentSha: string | null;
  currentShaShort: string | null;
  commitsSince: number;
  dirty: boolean;
  ageDays: number | null;
  verdict: StalenessVerdict;
  commits: CommitSummary[];
  changedFiles: string[];
  /** Features the diff plausibly touched. Over-reports by design. */
  affectedFeatures: string[];
  /** Why the verdict is `unknown`. */
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Journeys — persona-scale narratives stitched from feature walks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Editorial layout for a scene.
 *
 * A journey is read top-to-bottom like a photo essay, not scrubbed like a
 * test report, so scenes alternate framing to keep a long journey from
 * reading as one long column of screenshots. Unset means "let the renderer
 * pick" — it applies a deterministic pattern by scene index, so a journey
 * that never sets `layout` still reads as though someone laid it out.
 */
export type JourneySceneLayout = "full-bleed" | "split-left" | "split-right" | "inset";

export interface JourneyScene {
  id: string;
  /** Scene heading. */
  title: string;
  /** Markdown — the persona's experience of this moment, in their terms. */
  narrative: string;
  /** Captures for this scene, relative to `/walkthroughs/{slug}/`. */
  frames: string[];
  frameCaptions?: string[];
  video?: string;
  location?: string;
  surface?: string;
  /** Feature walk this scene draws on. */
  sourceFeature?: string;
  verificationStatus?: VerificationStatus;
  /** Genuine reason this scene couldn't be fully captured. */
  note?: string;
  layout?: JourneySceneLayout;
}

/**
 * A moment shot — the persona *away from the screen*.
 *
 * Every other artifact in this repo is a capture of software. A journey made
 * only of captures reads as a UI inventory even when the narrative is good,
 * because every frame is a rectangle of someone else's chrome. Moments are
 * generated illustration, not observation, and they are the one place in the
 * contract where that is true — hence `synthetic` is not merely allowed here,
 * it is the only honest value, and the renderer always labels them.
 */
export interface JourneyMoment {
  /** Stable id, also the filename stem: `personas/{personaId}-moment-{id}.png` */
  id: string;
  /** Illustration path, relative to `/walkthroughs/{slug}/`. */
  image: string;
  /** First-person line. The persona's own voice, not the narrator's. */
  caption: string;
  /**
   * Index of the scene this moment follows. `-1` places it before scene one.
   * Out-of-range values are dropped rather than clamped, so a journey that
   * loses scenes doesn't silently reorder its own story.
   */
  afterScene: number;
}

export interface PersonaJourney {
  personaId: string;
  journeyId: string;
  headline: string;
  /** Markdown — the arc in two or three sentences. */
  overview: string;
  /**
   * The single outcome this journey delivers.
   *
   * PLAIN TEXT, not markdown — it renders as a display line and a spoken
   * narration beat, and neither goes through `<Prose>`. Markdown here shows
   * up as literal asterisks in both.
   */
  payoff?: string;
  scenes: JourneyScene[];
  platform: Platform;
  surface?: string;
  capturedAt?: string;
  targetSha?: string;
  /** Generated story video, relative to `/walkthroughs/{slug}/`. */
  storyVideo?: string;
  /** Generated illustration between scenes. Always synthetic — see the type. */
  moments?: JourneyMoment[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived / view models (computed by the hub, never persisted)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectSummary {
  project: Project;
  catalog: Catalog | null;
  featureCount: number;
  walkedCount: number;
  pendingCount: number;
  personaCount: number;
  issueCount: number;
  screenshotCount: number;
  staleness: StalenessReport;
  /** Surfaces this project actually has captures for. */
  surfaces: Surface[];
  /** Platforms this project actually has captures on — evidence, not claim. */
  platforms: Platform[];
}

/**
 * A persona with its art and journeys resolved against the filesystem.
 *
 * `portrait` and `scene` are `string | null` rather than optional, because the
 * distinction the UI needs is "no art has been generated" (draw the
 * typographic fallback) versus "art exists" — not "the catalog author didn't
 * fill in the field". The data layer collapses both to null.
 */
export interface PersonaSummary {
  id: string;
  name: string;
  description: string;
  authRole?: string;
  entryPoint?: string;
  portrait: string | null;
  scene: string | null;
  journeyCount: number;
  sceneCount: number;
  /** True when at least one journey has a rendered story video. */
  hasStory: boolean;
}

export interface PersonaDetail extends PersonaSummary {
  journeys: PersonaJourney[];
}

/**
 * One app's position in the constellation.
 *
 * Computed, never persisted. The old hub pinned projects to their client's
 * real headquarters on a Mapbox globe, which was beautiful and completely
 * unavailable to anyone whose apps don't have head offices worth mapping.
 * The substrate here is the only spatial fact this tool actually knows about
 * an app: which platforms it runs on.
 */
export interface ConstellationNode {
  slug: string;
  name: string;
  /** Platforms this app is documented on. Drives which territory it sits in. */
  platforms: Platform[];
  /** Normalized 0..1 position within the chart. */
  x: number;
  y: number;
  /** 0..1 — share of catalogued features that have been walked. Drives size. */
  coverage: number;
  featureCount: number;
  walkedCount: number;
  personaCount: number;
  staleness: StalenessVerdict;
  /** Persona portraits to fan around the node, already resolved. */
  personas: { id: string; name: string; portrait: string | null }[];
}
