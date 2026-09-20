/**
 * Run history and staleness.
 *
 * Every capture run appends a `RunManifest` to
 * `public/walkthroughs/{slug}/runs.json`. This module is the only reader and
 * writer of that file — anything that needs "when did we last walk this?" or
 * "has the app moved since?" goes through here.
 *
 * Staleness is *always computed*, never stored. A persisted verdict would go
 * wrong the moment someone pushes a commit, and the whole point is to notice
 * exactly that.
 */
import fs from "node:fs";
import path from "node:path";
import type { Catalog, Project, RunManifest, RunsFile, StalenessReport } from "./types";
import { commitsSince, filesChangedSince, getHead, resolveRepo, shaExists } from "./target-git";

const ROOT = process.cwd();
const STORAGE = path.join(ROOT, "public", "walkthroughs");

function runsPath(slug: string): string {
  return path.join(STORAGE, slug, "runs.json");
}

/** All runs for a project, newest first. */
export function getRuns(slug: string): RunManifest[] {
  try {
    const file = runsPath(slug);
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as RunsFile;
    return [...(parsed.runs ?? [])].sort((a, b) => (a.id < b.id ? 1 : -1));
  } catch {
    return [];
  }
}

export function getLatestRun(slug: string): RunManifest | null {
  return getRuns(slug)[0] ?? null;
}

/**
 * Append a run manifest. Append-only by contract — historical entries are
 * never rewritten, because they're the baseline every later staleness check
 * is measured against.
 */
export function appendRun(slug: string, manifest: RunManifest): void {
  const file = runsPath(slug);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing: RunsFile = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf8")) as RunsFile)
    : { runs: [] };
  existing.runs = [...(existing.runs ?? []), manifest];
  fs.writeFileSync(file, JSON.stringify(existing, null, 2) + "\n");
}

// ── Staleness ───────────────────────────────────────────────────────────────

//  fresh      — no commits since the last run AND age ≤ 30 days
//  stale      — 1–10 commits, or no commits but older than 30 days
//  very-stale — more than 10 commits, or older than 90 days
//
// The time component matters independently of the commit count: an app nobody
// has touched in four months still deserves a re-walk, because the *world*
// around it moved (dependencies, data, the reader's memory of it).
const FRESH_MAX_DAYS = 30;
const VERY_STALE_DAYS = 90;
const STALE_MAX_COMMITS = 10;

/** Pure policy, exported so boundary behaviour cannot drift without a test. */
export function stalenessVerdict({
  commitsSince,
  ageDays,
  dirty = false,
}: {
  commitsSince: number;
  ageDays: number;
  dirty?: boolean;
}): StalenessReport["verdict"] {
  if (commitsSince > STALE_MAX_COMMITS || ageDays > VERY_STALE_DAYS) return "very-stale";
  if (dirty || commitsSince > 0 || ageDays > FRESH_MAX_DAYS) return "stale";
  return "fresh";
}

function daysBetween(isoA: string, isoB: string): number {
  return Math.abs(new Date(isoB).getTime() - new Date(isoA).getTime()) / 86_400_000;
}

const EMPTY: Omit<StalenessReport, "verdict"> = {
  lastRunAt: null,
  lastRunSha: null,
  lastRunShaShort: null,
  currentSha: null,
  currentShaShort: null,
  commitsSince: 0,
  dirty: false,
  ageDays: null,
  commits: [],
  changedFiles: [],
  affectedFeatures: [],
};

function unknown(reason: string): StalenessReport {
  return { ...EMPTY, verdict: "unknown", reason };
}

function never(): StalenessReport {
  return { ...EMPTY, verdict: "never" };
}

/**
 * Directory conventions that mean "this file could affect any feature".
 *
 * Platform-specific by necessity: a theme change in a Next.js app lives in
 * `globals.css`, in SwiftUI it's a `Theme.swift`, in Compose a `Theme.kt`, in
 * Electron a shared renderer stylesheet. Getting this wrong in the permissive
 * direction (over-reporting) is fine; getting it wrong the other way means we
 * tell someone a walkthrough is fresh when the app was restyled underneath it.
 */
const GLOBAL_PATTERNS = [
  // cross-platform
  /(^|\/)(theme|themes|styles?|design-system|tokens)\//i,
  /(^|\/)(i18n|locales?|translations?|strings)\//i,
  // web
  /globals?\.css$/i,
  /tailwind\.config\.[jt]s$/i,
  /(^|\/)layout\.[jt]sx?$/i,
  /(^|\/)_app\.[jt]sx?$/i,
  // ios
  /(^|\/)(AppDelegate|SceneDelegate)\.swift$/i,
  /App\.swift$/i,
  /Assets\.xcassets\//i,
  /Info\.plist$/i,
  // android
  /(^|\/)res\/values\//i,
  /AndroidManifest\.xml$/i,
  /(^|\/)MainActivity\.(kt|java)$/i,
  // desktop
  /(^|\/)(main|preload)\.[jt]s$/i,
  /tauri\.conf\.json$/i,
  // cli
  /(^|\/)(cmd|commands)\/root\.go$/i,
  /(^|\/)cli\.[jt]s$/i,
];

/**
 * Turn a feature `location` into path tokens worth matching against.
 *
 * Handles all five location vocabularies:
 *   `/settings/billing`             → settings, billing
 *   `SettingsScreen`                → settings
 *   `com.acme/.SettingsActivity`    → settings
 *   `Preferences › Network`         → preferences, network
 *   `acme deploy --dry-run`         → deploy
 */
function locationTokens(location: string): string[] {
  const stripped = location
    // drop CLI flags and their values — they aren't file names
    .replace(/\s--?[\w-]+(=\S+)?/g, " ")
    // split camelCase / PascalCase into words
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();

  return stripped
    .split(/[\s/›>._:|-]+/)
    .map((t) => t.replace(/[[\]()]/g, "").trim())
    // Drop noise: locale prefixes, framework suffixes, generic verbs, and
    // anything too short to be a meaningful filename match.
    .filter(
      (t) =>
        t.length > 2 &&
        ![
          "en", "ar", "fr", "es", "de", "com", "org", "app", "src",
          "screen", "view", "page", "activity", "fragment", "window",
          "home", "index", "main", "the", "and", "run", "new", "get",
        ].includes(t),
    );
}

/** Conservative guess: could this changed file have altered this feature? */
function fileAffectsFeature(file: string, location: string, category: string): boolean {
  const lowered = file.toLowerCase();
  if (GLOBAL_PATTERNS.some((re) => re.test(file))) return true;
  if (category && lowered.includes(`/${category.toLowerCase()}/`)) return true;
  for (const token of locationTokens(location)) {
    if (
      lowered.includes(`/${token}/`) ||
      lowered.includes(`${token}.`) ||
      lowered.includes(`-${token}.`) ||
      lowered.includes(`_${token}.`)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Build a staleness report: compare the most recent run's target sha against
 * the current state of `codebase.local`.
 *
 * `catalog` is optional; when supplied we also work out which features the
 * diff plausibly touched, which is what drives the "these need a re-walk"
 * list on the project page.
 */
export function computeStaleness(
  project: Project,
  catalog: Catalog | null = null,
): StalenessReport {
  const latest = getLatestRun(project.slug);
  const resolved = resolveRepo(project.codebase?.local);

  if (!latest) {
    // Never walked — but still report current HEAD when we can, so the UI can
    // say "never walked; target is at 0fee47c5" rather than just "never".
    if (resolved) {
      const head = getHead(resolved.repoRoot, resolved.watchPath);
      if (head) {
        return {
          ...never(),
          currentSha: head.sha,
          currentShaShort: head.shaShort,
          dirty: head.dirty,
        };
      }
    }
    return never();
  }

  const ageDays = daysBetween(latest.completedAt, new Date().toISOString());

  if (!resolved) {
    // We have runs but can't read git. Age alone is still worth reporting.
    return {
      ...unknown(
        project.codebase?.local
          ? "codebase.local is not a git repository"
          : "no codebase.local set for this project",
      ),
      lastRunAt: latest.completedAt,
      lastRunSha: latest.target.sha,
      lastRunShaShort: latest.target.shaShort,
      ageDays,
    };
  }

  const head = getHead(resolved.repoRoot, resolved.watchPath);
  if (!head) {
    return {
      ...unknown("could not read git HEAD for the target codebase"),
      lastRunAt: latest.completedAt,
      lastRunSha: latest.target.sha,
      lastRunShaShort: latest.target.shaShort,
      ageDays,
    };
  }

  // An empty, mistyped, pruned, or foreign SHA is not "zero commits since".
  // Treating the failed diff as an empty diff made an unprovable run look
  // fresh — exactly backwards for an evidence system.
  if (!shaExists(resolved.repoRoot, latest.target.sha)) {
    return {
      ...unknown("the walkthrough's recorded target commit is missing from this checkout"),
      lastRunAt: latest.completedAt,
      lastRunSha: latest.target.sha || null,
      lastRunShaShort: latest.target.shaShort || null,
      currentSha: head.sha,
      currentShaShort: head.shaShort,
      dirty: head.dirty,
      ageDays,
    };
  }

  const commits = commitsSince(resolved.repoRoot, latest.target.sha, resolved.watchPath, 50);
  const changedFiles = filesChangedSince(
    resolved.repoRoot,
    latest.target.sha,
    resolved.watchPath,
  );

  const verdict = stalenessVerdict({ commitsSince: commits.length, ageDays, dirty: head.dirty });

  const affectedFeatures = (catalog?.features ?? [])
    .filter((f) => changedFiles.some((file) => fileAffectsFeature(file, f.location, f.category)))
    .map((f) => f.featureId);

  return {
    lastRunAt: latest.completedAt,
    lastRunSha: latest.target.sha,
    lastRunShaShort: latest.target.shaShort,
    currentSha: head.sha,
    currentShaShort: head.shaShort,
    commitsSince: commits.length,
    dirty: head.dirty,
    ageDays,
    verdict,
    commits,
    changedFiles,
    affectedFeatures,
    ...(head.dirty ? { reason: "the target checkout has uncommitted changes" } : {}),
  };
}
