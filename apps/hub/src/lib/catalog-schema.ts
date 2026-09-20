/**
 * Catalog schema versions, and the upgrade between them.
 *
 * ── The problem this solves ───────────────────────────────────────────────
 *
 * Two generations of catalog exist in the wild and the hub has to read both.
 *
 *   v1  web-shaped, written by the pre-1.0 skill and by any repo still
 *       carrying a copy of it:
 *         route, desktopStatus, mobileStatus, baseUrl, navItems[].route
 *
 *   v2  platform-agnostic, written by the current skill:
 *         location, surfaceStatus{}, capturedAgainst, navItems[].location
 *
 * The naive fix is to migrate every file on disk and move on. That fails the
 * moment a *different repository* — which owns its own copy of the skill and
 * its own release cadence — writes a v1 catalog again next week. So the
 * reconciliation is two-sided and deliberately asymmetric:
 *
 *   read   the hub upgrades v1 in memory, always, forever. A v1 catalog is a
 *          supported input, not an error state.
 *   write  new runs emit v2 with an explicit `schemaVersion`, and
 *          `scripts/migrate-catalog.mjs` upgrades files on disk when you want
 *          the committed artifact to be canonical.
 *
 * Keeping the reader permissive is what makes the dashboard able to show a
 * project whose walk was produced by an older toolchain — which is most of the
 * interesting cases, since the whole point is to document apps you do not
 * control.
 *
 * ── Why the statuses could not just be renamed ────────────────────────────
 *
 * `desktopStatus` / `mobileStatus` is a fixed pair. `surfaceStatus` is a map,
 * so a project can track a tablet, a watch or three phone sizes without a
 * schema change. The upgrade is lossless in one direction only — which is the
 * right direction.
 */

import type { Catalog, CatalogFeature, CatalogPersona, CaptureStatus } from "./types";

export const CATALOG_SCHEMA_VERSION = 2;

/** The v1 shapes, as literally written by the older skill. */
interface LegacyFeature {
  featureId: string;
  featureName: string;
  route?: string;
  location?: string;
  category?: string;
  requiresAuth?: boolean;
  authRole?: string | null;
  description?: string;
  desktopStatus?: CaptureStatus;
  mobileStatus?: CaptureStatus;
  videoStatus?: CaptureStatus;
  surfaceStatus?: Record<string, CaptureStatus>;
  issueCount?: number;
  lastWalkthroughAt?: string | null;
  lastCodeChangeAt?: string | null;
  isStale?: boolean;
  notes?: string;
  testIds?: string[];
  synthetic?: boolean;
  syntheticReason?: string;
}

interface LegacyPersona {
  id: string;
  name: string;
  description?: string;
  authRole?: string | null;
  entryPoint?: string;
  keyJourneys?: string[];
  navItems?: { label: string; route?: string; location?: string }[];
  portrait?: string;
  scene?: string;
}

interface LegacyCatalog {
  schemaVersion?: number;
  projectName?: string;
  platform?: string;
  driver?: string;
  baseUrl?: string;
  capturedAgainst?: string;
  githubRepo?: string;
  brand?: Catalog["brand"];
  surfaces?: Catalog["surfaces"];
  discoveredAt?: string;
  updatedAt?: string;
  features?: LegacyFeature[];
  personas?: LegacyPersona[];
  synthetic?: boolean;
  syntheticNote?: string;
  attribution?: string;
}

/**
 * Which generation is this?
 *
 * Detected from the shape rather than from a version field, because v1 has no
 * version field — that is precisely what makes it v1. A file carrying an
 * explicit `schemaVersion` is believed.
 */
export function detectSchemaVersion(raw: unknown): number {
  const cat = raw as LegacyCatalog | null;
  if (!cat || typeof cat !== "object") return CATALOG_SCHEMA_VERSION;
  if (typeof cat.schemaVersion === "number") return cat.schemaVersion;
  const features = cat.features ?? [];
  // A single v1 marker anywhere is enough: mixed files are the normal result
  // of a partially-migrated run and must still read cleanly.
  const looksLegacy = features.some(
    (f) => f.route !== undefined || f.desktopStatus !== undefined || f.mobileStatus !== undefined,
  );
  if (looksLegacy || cat.baseUrl !== undefined) return 1;
  return CATALOG_SCHEMA_VERSION;
}

function upgradeFeature(f: LegacyFeature): CatalogFeature {
  // `surfaceStatus` wins when both are present: a file mid-migration has the
  // new field as the authority and the old pair as a leftover.
  const surfaceStatus: Record<string, CaptureStatus> =
    f.surfaceStatus && Object.keys(f.surfaceStatus).length > 0
      ? f.surfaceStatus
      : {
          ...(f.desktopStatus ? { desktop: f.desktopStatus } : {}),
          ...(f.mobileStatus ? { mobile: f.mobileStatus } : {}),
        };

  return {
    featureId: f.featureId,
    featureName: f.featureName,
    // `location` is the v2 name for the same string. The *semantics* widen
    // (a route, a screen id, an argv) but a v1 value is always a web route,
    // so carrying it across verbatim is exact rather than approximate.
    location: f.location ?? f.route ?? "",
    category: f.category ?? "general",
    requiresAuth: f.requiresAuth ?? false,
    ...(f.authRole ? { authRole: f.authRole } : {}),
    surfaceStatus,
    ...(f.videoStatus ? { videoStatus: f.videoStatus } : {}),
    ...(f.issueCount !== undefined ? { issueCount: f.issueCount } : {}),
    ...(f.lastWalkthroughAt !== undefined ? { lastWalkthroughAt: f.lastWalkthroughAt } : {}),
    ...(f.lastCodeChangeAt !== undefined ? { lastCodeChangeAt: f.lastCodeChangeAt } : {}),
    ...(f.synthetic !== undefined ? { synthetic: f.synthetic } : {}),
    ...(f.syntheticReason ? { syntheticReason: f.syntheticReason } : {}),
    ...(f.testIds ? { testIds: f.testIds } : {}),
    // v1 called this `description`; v2 uses `notes` for agent-facing remarks
    // and puts user-facing prose in the walkthrough file, where it can be
    // markdown. Carrying it into `notes` keeps the text rather than dropping
    // it, and the hub renders notes.
    ...(f.notes ?? f.description ? { notes: f.notes ?? f.description } : {}),
  };
}

function upgradePersona(p: LegacyPersona): CatalogPersona {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    ...(p.authRole ? { authRole: p.authRole } : {}),
    ...(p.entryPoint ? { entryPoint: p.entryPoint } : {}),
    ...(p.keyJourneys ? { keyJourneys: p.keyJourneys } : {}),
    ...(p.navItems
      ? { navItems: p.navItems.map((n) => ({ label: n.label, location: n.location ?? n.route ?? "" })) }
      : {}),
    ...(p.portrait ? { portrait: p.portrait } : {}),
    ...(p.scene ? { scene: p.scene } : {}),
  };
}

/** What changed during an upgrade, so a migration can report honestly. */
export interface UpgradeReport {
  from: number;
  to: number;
  changed: boolean;
  notes: string[];
}

export function normalizeCatalog(raw: unknown): { catalog: Catalog | null; report: UpgradeReport } {
  const cat = raw as LegacyCatalog | null;
  const from = detectSchemaVersion(raw);
  const report: UpgradeReport = { from, to: CATALOG_SCHEMA_VERSION, changed: false, notes: [] };
  if (!cat || typeof cat !== "object" || !Array.isArray(cat.features)) {
    return { catalog: null, report };
  }

  const routeRenames = cat.features.filter((f) => f.route !== undefined && f.location === undefined).length;
  const statusRenames = cat.features.filter(
    (f) => (f.desktopStatus !== undefined || f.mobileStatus !== undefined) && !f.surfaceStatus,
  ).length;
  const navRenames = (cat.personas ?? []).filter((p) => (p.navItems ?? []).some((n) => n.route !== undefined)).length;

  if (routeRenames) report.notes.push(`${routeRenames} feature route → location`);
  if (statusRenames) report.notes.push(`${statusRenames} feature desktopStatus/mobileStatus → surfaceStatus`);
  if (navRenames) report.notes.push(`${navRenames} persona navItems[].route → location`);
  if (cat.baseUrl && !cat.capturedAgainst) report.notes.push("baseUrl → capturedAgainst");
  if (cat.schemaVersion !== CATALOG_SCHEMA_VERSION) report.notes.push(`schemaVersion stamped ${CATALOG_SCHEMA_VERSION}`);
  report.changed = report.notes.length > 0;

  const catalog: Catalog = {
    ...cat,
    schemaVersion: CATALOG_SCHEMA_VERSION,
    projectName: cat.projectName ?? "Untitled project",
    // v1 predates the platform axis and was web-only by construction, so this
    // default is a fact about that generation rather than a guess.
    platform: (cat.platform as Catalog["platform"]) ?? "web",
    ...(cat.driver ? { driver: cat.driver as Catalog["driver"] } : {}),
    ...(cat.capturedAgainst ?? cat.baseUrl ? { capturedAgainst: cat.capturedAgainst ?? cat.baseUrl } : {}),
    discoveredAt: cat.discoveredAt ?? new Date(0).toISOString(),
    updatedAt: cat.updatedAt ?? cat.discoveredAt ?? new Date(0).toISOString(),
    features: cat.features.map(upgradeFeature),
    ...(cat.personas ? { personas: cat.personas.map(upgradePersona) } : {}),
  } as Catalog;

  // v1's `baseUrl` is gone from the output shape; drop the leftover so a
  // migrated file does not carry two names for the same thing.
  delete (catalog as unknown as LegacyCatalog).baseUrl;

  return { catalog, report };
}
