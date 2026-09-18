/**
 * Server-side readers for everything on disk.
 *
 * Storage layout — one directory per project under `public/walkthroughs/`:
 *
 *   projects.json                       the registry
 *   public/walkthroughs/{slug}/
 *     catalog.json                      features, personas, surfaces
 *     {featureId}.{surfaceId}.json      one walkthrough per feature × surface
 *     persona-{personaId}.json          a persona journey
 *     fixes.json                        verified bug fixes
 *     issues.json                       problems found while capturing
 *     runs.json                         append-only run history
 *     {featureId}/                      captures: PNGs, videos, guides
 *     personas/                         persona art
 *
 * Putting captures under `public/` means the hub serves them as static files
 * with no image pipeline — the URL for a capture is just
 * `/walkthroughs/{slug}/{path}`.
 *
 * Every reader returns `null` / `[]` on a missing or malformed file rather
 * than throwing. A half-populated project is the normal state of this app:
 * the registry is written by a human, the rest arrives run by run.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  Catalog,
  CatalogFeature,
  CapturedIssue,
  IssuesFile,
  JourneyMoment,
  PersonaDetail,
  PersonaJourney,
  PersonaSummary,
  Platform,
  Project,
  ProjectsRegistry,
  ProjectSummary,
  Surface,
  Walkthrough,
} from "./types";
import { PLATFORMS } from "./types";
import { DEFAULT_SURFACE_IDS, orderSurfaces, resolveSurface } from "./surfaces";
import { isFeatureWalked } from "./coverage";
import { computeStaleness } from "./run-history";
import { normalizeCatalog } from "./catalog-schema";

const ROOT = process.cwd();
const REGISTRY = path.join(ROOT, "projects.json");
export const STORAGE = path.join(ROOT, "public", "walkthroughs");

function readJson<T>(abs: string): T | null {
  try {
    if (!fs.existsSync(abs)) return null;
    return JSON.parse(fs.readFileSync(abs, "utf8")) as T;
  } catch {
    return null;
  }
}

export function projectDir(slug: string): string {
  return path.join(STORAGE, slug);
}

/** Public URL for an asset stored under a project's directory. */
export function assetUrl(slug: string, relative: string): string {
  const clean = relative.replace(/^\/+/, "");
  return `/walkthroughs/${slug}/${clean}`;
}

/** Does this asset exist on disk? Used to avoid rendering broken cards. */
export function assetExists(slug: string, relative: string): boolean {
  if (!relative) return false;
  return fs.existsSync(path.join(projectDir(slug), relative.replace(/^\/+/, "")));
}

// ── Registry ────────────────────────────────────────────────────────────────

export function getProjects(): Project[] {
  const registry = readJson<ProjectsRegistry>(REGISTRY);
  return registry?.projects ?? [];
}

export function getProject(slug: string): Project | null {
  return getProjects().find((p) => p.slug === slug) ?? null;
}

// ── Catalog ─────────────────────────────────────────────────────────────────

/**
 * Read a project's catalog, upgrading an older generation on the way in.
 *
 * Normalising here rather than at the call sites means every consumer — the
 * feature grid, coverage, the health checks, the constellation — sees one
 * shape, and a project walked by an older toolchain renders identically to one
 * walked today. See `lib/catalog-schema.ts` for what the upgrade covers.
 */
export function getCatalog(slug: string): Catalog | null {
  const raw = readJson<unknown>(path.join(projectDir(slug), "catalog.json"));
  if (raw === null) return null;
  return normalizeCatalog(raw).catalog;
}

export function getFeature(slug: string, featureId: string): CatalogFeature | null {
  return getCatalog(slug)?.features.find((f) => f.featureId === featureId) ?? null;
}

/**
 * Surfaces to show for a project, in display order.
 *
 * Derived from what the catalog's features actually reference, not from the
 * platform defaults — a project that only ever captured desktop shouldn't
 * render an empty "Mobile" tab. Falls back to the platform defaults when the
 * catalog is empty, so a fresh project still shows its intended surfaces.
 */
export function getSurfaces(slug: string, catalog?: Catalog | null): Surface[] {
  const cat = catalog === undefined ? getCatalog(slug) : catalog;
  const platform: Platform = cat?.platform ?? "web";
  const ids = new Set<string>();
  for (const feature of cat?.features ?? []) {
    for (const id of Object.keys(feature.surfaceStatus ?? {})) ids.add(id);
  }
  if (ids.size === 0) for (const id of DEFAULT_SURFACE_IDS[platform]) ids.add(id);
  const resolved = [...ids].map((id) => resolveSurface(id, cat?.surfaces, platform));
  return orderSurfaces(resolved, platform);
}

// ── Walkthroughs ────────────────────────────────────────────────────────────

/**
 * Load one feature walkthrough.
 *
 * The canonical filename is `{featureId}.{surfaceId}.json`. Two fallbacks are
 * honoured because they cost nothing and save a re-capture:
 *   - `{featureId}.json` for a project that only captures one surface
 *   - a `walkthroughFile` override is *not* supported; keep filenames derivable
 */
export function getWalkthrough(
  slug: string,
  featureId: string,
  surfaceId: string,
): Walkthrough | null {
  const dir = projectDir(slug);
  const candidates = [
    path.join(dir, `${featureId}.${surfaceId}.json`),
    path.join(dir, `${featureId}.json`),
  ];
  for (const abs of candidates) {
    const parsed = readJson<Walkthrough>(abs);
    // Only accept the bare filename when it really is this surface, otherwise
    // a desktop file would silently answer a request for mobile.
    if (parsed && (parsed.surface === surfaceId || abs.includes(`.${surfaceId}.json`))) {
      return parsed;
    }
  }
  return null;
}

/** Every surface a feature has a walkthrough file for, in display order. */
export function getFeatureSurfaces(slug: string, featureId: string): Surface[] {
  const catalog = getCatalog(slug);
  const platform: Platform = catalog?.platform ?? "web";
  const available = getSurfaces(slug, catalog).filter((s) =>
    Boolean(getWalkthrough(slug, featureId, s.id)),
  );
  return orderSurfaces(available, platform);
}

/** All walkthroughs for a feature, keyed by surface id. */
export function getWalkthroughsForFeature(
  slug: string,
  featureId: string,
): Record<string, Walkthrough> {
  const out: Record<string, Walkthrough> = {};
  for (const surface of getSurfaces(slug)) {
    const wt = getWalkthrough(slug, featureId, surface.id);
    if (wt) out[surface.id] = wt;
  }
  return out;
}

// ── Personas and journeys ───────────────────────────────────────────────────

/**
 * Resolve persona art by convention, falling back to the catalog field.
 *
 * Convention wins over declaration: the art generator writes to a fixed path,
 * so a persona whose PNG exists but whose catalog entry was never updated
 * should still show its portrait. The reverse — a declared path with no file —
 * must resolve to null or the UI renders a broken image and still claims the
 * persona is illustrated.
 */
function resolvePersonaArt(
  slug: string,
  personaId: string,
  declared: string | undefined,
  kind: "portrait" | "scene",
): string | null {
  const conventional = kind === "portrait"
    ? `personas/${personaId}.png`
    : `personas/${personaId}-scene.png`;
  for (const rel of [conventional, declared]) {
    if (rel && assetExists(slug, rel)) return assetUrl(slug, rel);
  }
  return null;
}

/**
 * Every journey file belonging to a persona.
 *
 * Two naming schemes are accepted, mirroring how features are stored:
 *
 *   persona-{personaId}.json              one journey (the common case)
 *   persona-{personaId}.{journeyId}.json  several journeys for one persona
 *
 * Scenes whose `frames` are all missing from disk are dropped. A journey that
 * references captures nobody took is worse than a short journey: it reads as
 * complete coverage and renders as a column of broken images. The health
 * report picks the absence up separately via `claimed-but-absent`.
 */
export function getPersonaJourneys(slug: string, personaId: string): PersonaJourney[] {
  const dir = projectDir(slug);
  if (!fs.existsSync(dir)) return [];

  const prefix = `persona-${personaId}`;
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter(
      (n) => n.endsWith(".json") && (n === `${prefix}.json` || n.startsWith(`${prefix}.`)),
    );
  } catch {
    return [];
  }

  const journeys: PersonaJourney[] = [];
  for (const name of names.sort()) {
    const raw = readJson<PersonaJourney>(path.join(dir, name));
    if (!raw) continue;

    const scenes = (raw.scenes ?? [])
      .map((scene) => ({
        ...scene,
        frames: (scene.frames ?? []).filter((f) => assetExists(slug, f)).map((f) => assetUrl(slug, f)),
        video: scene.video && assetExists(slug, scene.video) ? assetUrl(slug, scene.video) : undefined,
      }))
      .filter((scene) => scene.frames.length > 0 || scene.video || scene.note);

    const moments: JourneyMoment[] = (raw.moments ?? [])
      .filter((m) => m.image && assetExists(slug, m.image))
      .filter((m) => m.afterScene >= -1 && m.afterScene < scenes.length)
      .map((m) => ({ ...m, image: assetUrl(slug, m.image) }));

    // Convention: `personas/{personaId}-story.mp4`, or the journey id when a
    // persona has more than one.
    const declaredStory = raw.storyVideo;
    const byJourney = `personas/${raw.journeyId}-story.mp4`;
    const byPersona = `personas/${personaId}-story.mp4`;
    const story = [declaredStory, byJourney, byPersona].find(
      (rel): rel is string => Boolean(rel) && assetExists(slug, rel as string),
    );

    journeys.push({
      ...raw,
      personaId,
      scenes,
      moments: moments.length > 0 ? moments : undefined,
      storyVideo: story ? assetUrl(slug, story) : undefined,
    });
  }
  return journeys;
}

export function getPersonas(slug: string, catalog?: Catalog | null): PersonaSummary[] {
  const cat = catalog ?? getCatalog(slug);
  return (cat?.personas ?? []).map((persona) => {
    const journeys = getPersonaJourneys(slug, persona.id);
    return {
      id: persona.id,
      name: persona.name,
      description: persona.description,
      authRole: persona.authRole,
      entryPoint: persona.entryPoint,
      portrait: resolvePersonaArt(slug, persona.id, persona.portrait, "portrait"),
      scene: resolvePersonaArt(slug, persona.id, persona.scene, "scene"),
      journeyCount: journeys.length,
      sceneCount: journeys.reduce((n, j) => n + j.scenes.length, 0),
      hasStory: journeys.some((j) => Boolean(j.storyVideo)),
    };
  });
}

export function getPersonaDetail(slug: string, personaId: string): PersonaDetail | null {
  const summary = getPersonas(slug).find((p) => p.id === personaId);
  if (!summary) return null;
  return { ...summary, journeys: getPersonaJourneys(slug, personaId) };
}

export function getJourney(
  slug: string,
  personaId: string,
  journeyId: string,
): PersonaJourney | null {
  return getPersonaJourneys(slug, personaId).find((j) => j.journeyId === journeyId) ?? null;
}

// ── Fixes and issues ────────────────────────────────────────────────────────

export function getIssues(slug: string): CapturedIssue[] {
  return readJson<IssuesFile>(path.join(projectDir(slug), "issues.json"))?.issues ?? [];
}

// ── Counting ────────────────────────────────────────────────────────────────

/**
 * Count capture files on disk for a project.
 *
 * Walks the project directory rather than trusting the JSON, because the
 * honest number is "how many images actually exist", and a mismatch between
 * this and what the walkthroughs reference is exactly the kind of drift the
 * health report is meant to catch.
 */
export function countScreenshots(slug: string): number {
  const dir = projectDir(slug);
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const walk = (d: string, depth: number) => {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(path.join(d, entry.name), depth + 1);
      else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) count += 1;
    }
  };
  walk(dir, 0);
  return count;
}

// ── Platform coverage ───────────────────────────────────────────────────────

/** Files in a project directory that are registries, not captures. */
const NON_WALKTHROUGH_JSON = new Set(["catalog.json", "runs.json", "issues.json", "fixes.json"]);

/**
 * Which platforms this app actually has captures on.
 *
 * The registry declares one `target.platform` and the catalog declares one
 * `platform`, but a single app can genuinely be documented on several — a web
 * app with an iOS companion, an Electron build of a web product. Each
 * walkthrough and each persona journey carries its own `platform`, so the
 * honest answer is the union of what is on disk, with the catalog's
 * declaration as the floor.
 *
 * Read from the files rather than from a declared list because a declared
 * list is a claim and the files are evidence. An app that says it ships on
 * five platforms and has captures for one should read as one.
 */
export function getDocumentedPlatforms(slug: string, catalog?: Catalog | null): Platform[] {
  const cat = catalog ?? getCatalog(slug);
  const found = new Set<Platform>();
  if (cat?.platform) found.add(cat.platform);

  const dir = projectDir(slug);
  if (fs.existsSync(dir)) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith(".json") && !NON_WALKTHROUGH_JSON.has(n));
    } catch {
      names = [];
    }
    for (const name of names) {
      const doc = readJson<{ platform?: Platform }>(path.join(dir, name));
      if (doc?.platform) found.add(doc.platform);
    }
  }

  return PLATFORMS.filter((p) => found.has(p));
}

// ── Summaries ───────────────────────────────────────────────────────────────

// Re-exported from the pure module so server callers have one import site.
// It lives in `coverage.ts` because client components need it too, and this
// file reaches `node:child_process` — see the header there.
export { isFeatureWalked } from "./coverage";

export function getProjectSummary(project: Project): ProjectSummary {
  const catalog = getCatalog(project.slug);
  const features = catalog?.features ?? [];
  const walkedCount = features.filter(isFeatureWalked).length;
  const issues = getIssues(project.slug);

  return {
    project,
    catalog,
    featureCount: features.length,
    walkedCount,
    pendingCount: features.length - walkedCount,
    personaCount: catalog?.personas?.length ?? 0,
    issueCount: issues.filter((i) => (i.status ?? "open") === "open").length,
    screenshotCount: countScreenshots(project.slug),
    staleness: computeStaleness(project, catalog),
    surfaces: getSurfaces(project.slug, catalog),
    platforms: getDocumentedPlatforms(project.slug, catalog),
  };
}

export function getAllProjectSummaries(): ProjectSummary[] {
  return getProjects().map(getProjectSummary);
}

// ── Credentials ─────────────────────────────────────────────────────────────

/**
 * Resolve a `$ENV_VAR` placeholder in an auth field.
 *
 * Returns `{ resolved: false }` when the variable isn't set, so the quick-login
 * UI can say "set `$ACME_STAGING_PASSWORD` in .env.local" instead of silently
 * rendering the literal string `$ACME_STAGING_PASSWORD` as a password and
 * sending someone off to paste it into a login form.
 */
export function resolveSecret(
  value: string | undefined,
): { resolved: boolean; value: string; varName?: string } {
  if (!value) return { resolved: false, value: "" };
  if (!value.startsWith("$")) return { resolved: true, value };
  const varName = value.slice(1);
  const fromEnv = process.env[varName];
  return fromEnv
    ? { resolved: true, value: fromEnv, varName }
    : { resolved: false, value: "", varName };
}
