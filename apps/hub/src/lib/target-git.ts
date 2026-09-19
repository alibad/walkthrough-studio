/**
 * Read-only git queries against the *target* codebase.
 *
 * The hub never writes to a target repo. Every helper here:
 *   - expands `~` to $HOME
 *   - uses a short timeout, so a hung or network-mounted repo can't stall a
 *     page render
 *   - returns `null` on any failure (not a git dir, missing path, timeout)
 *
 * Callers must treat every result as best-effort and surface failure as a
 * `reason` string, never by throwing.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CommitSummary } from "./types";

const GIT_TIMEOUT_MS = 3_000;

/**
 * The hub renders from `apps/hub`, so a relative path in the registry has to
 * resolve against the repository root or `../openstage` would mean
 * `apps/openstage`.
 */
const REPO_ROOT = path.resolve(process.cwd(), "..", "..");

/**
 * Resolve a registry path to something on disk.
 *
 * Three accepted forms, and the order matters:
 *
 *   `~/Code/thing`   expanded against $HOME
 *   `../thing`       resolved against the REPOSITORY root, not the cwd
 *   `/abs/path`      used as-is
 *
 * The relative form is the one to prefer and the reason this function grew.
 * `projects.json` is committed and published — an absolute path in it puts
 * somebody's home directory, and usually their real name, on a public web
 * page. `../openstage` says the same thing to every machine that has the
 * sibling checkout and says nothing to a stranger.
 */
export function expandHome(p: string): string {
  if (!p) return p;
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  if (p === "~") return os.homedir();
  if (!path.isAbsolute(p)) return path.resolve(REPO_ROOT, p);
  return p;
}

/**
 * Given a `codebase.local` (which may point inside a monorepo) return the git
 * top-level plus the repo-relative sub-path to scope diffs to. `null` when the
 * path is missing or isn't a git repo.
 */
export function resolveRepo(
  localPath: string | undefined,
): { repoRoot: string; watchPath: string } | null {
  if (!localPath) return null;
  const abs = expandHome(localPath);
  if (!fs.existsSync(abs)) return null;
  try {
    const repoRoot = execFileSync("git", ["-C", abs, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      // Swallow stderr. A non-git path is an expected, handled outcome here —
      // without this, "fatal: not a git repository" prints on every render of
      // every project that hasn't set `codebase.local`.
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!repoRoot) return null;
    const watchPath = path.relative(repoRoot, abs).replaceAll(path.sep, "/");
    return { repoRoot, watchPath };
  } catch {
    return null;
  }
}

function git(repoRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export interface HeadInfo {
  sha: string;
  shaShort: string;
  branch?: string;
  commitDate?: string;
  commitSubject?: string;
  dirty: boolean;
}

/** Current HEAD state for the given sub-path. */
export function getHead(repoRoot: string, watchPath: string): HeadInfo | null {
  const scope = watchPath || ".";
  const sha = git(repoRoot, ["log", "-1", "--pretty=%H", "--", scope]);
  if (!sha) return null;
  return {
    sha,
    shaShort: sha.slice(0, 8),
    branch: git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]) ?? undefined,
    commitDate: git(repoRoot, ["log", "-1", "--pretty=%aI", sha, "--", scope]) ?? undefined,
    commitSubject: git(repoRoot, ["log", "-1", "--pretty=%s", sha, "--", scope]) ?? undefined,
    dirty: Boolean(git(repoRoot, ["status", "--porcelain", "--", scope])?.length),
  };
}

/** Does this sha exist locally? Must be true before we can diff against it. */
export function shaExists(repoRoot: string, sha: string): boolean {
  if (!sha) return false;
  return git(repoRoot, ["cat-file", "-e", `${sha}^{commit}`]) !== null;
}

/** Commits in `fromSha..HEAD` touching `watchPath`, newest first. */
export function commitsSince(
  repoRoot: string,
  fromSha: string,
  watchPath: string,
  limit = 50,
): CommitSummary[] {
  if (!shaExists(repoRoot, fromSha)) return [];
  const sep = ""; // unit separator — safe inside commit subjects
  const out = git(repoRoot, [
    "log",
    `${fromSha}..HEAD`,
    `--pretty=format:${["%H", "%s", "%aI", "%an"].join(sep)}`,
    "-n",
    String(limit),
    "--",
    watchPath || ".",
  ]);
  if (!out) return [];
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, subject, date, author] = line.split(sep);
      return { sha, shaShort: sha.slice(0, 8), subject, date, author };
    });
}

/** Files changed in `fromSha..HEAD`, returned relative to `watchPath`. */
export function filesChangedSince(
  repoRoot: string,
  fromSha: string,
  watchPath: string,
): string[] {
  if (!shaExists(repoRoot, fromSha)) return [];
  const out = git(repoRoot, ["diff", "--name-only", `${fromSha}..HEAD`, "--", watchPath || "."]);
  if (!out) return [];
  const prefix = watchPath ? watchPath.replace(/\/?$/, "/") : "";
  return out
    .split("\n")
    .filter(Boolean)
    .map((f) => (prefix && f.startsWith(prefix) ? f.slice(prefix.length) : f));
}
