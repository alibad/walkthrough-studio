/**
 * Catalog and walkthrough QUALITY checks.
 *
 * Staleness answers *when* the docs got old. This answers *whether they were
 * honest to begin with* — a different and more important question, because a
 * stale walkthrough merely lags the product, while a dishonest one teaches
 * readers something untrue about it.
 *
 * Every check here exists because a real run produced the failure:
 *
 *   - three steps referencing different filenames but identical bytes (the
 *     capture never interacted with the app between shots)
 *   - "features" that were really locale or surface slices of one feature,
 *     inflating the feature count
 *   - `surfaceStatus: "done"` with no walkthrough file behind it
 *   - a catalog of entirely synthetic steps presented as coverage
 *
 * The hub renders these as a banner on the project page. Nothing here throws:
 * a broken project should show *why* it's broken, not a 500.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  CapturedIssue,
  Catalog,
  CatalogFeature,
  Platform,
  Surface,
  Walkthrough,
} from "./types";
import { getWalkthrough, projectDir } from "./data";
import { BUILTIN_SURFACES } from "./surfaces";

// ── Capture hashing ─────────────────────────────────────────────────────────

// Hashing the same PNG repeatedly across features is the dominant cost of a
// health report, so memoize per process. Captures are immutable once written.
const hashCache = new Map<string, string | null>();

function hashFile(abs: string): string | null {
  const cached = hashCache.get(abs);
  if (cached !== undefined) return cached;
  let hash: string | null = null;
  try {
    if (fs.existsSync(abs)) {
      hash = crypto.createHash("md5").update(fs.readFileSync(abs)).digest("hex");
    }
  } catch {
    hash = null;
  }
  hashCache.set(abs, hash);
  return hash;
}

export interface StepQuality {
  stepNumber: number;
  title: string;
  screenshotFilename: string;
  /** MD5 of the referenced file; `null` when it doesn't exist. */
  contentHash: string | null;
  /** Set when an earlier step in the same walkthrough has identical bytes. */
  duplicateOfStep?: number;
  /** True when the step records no interaction that would advance state. */
  missingAction?: boolean;
}

export interface WalkthroughQuality {
  steps: StepQuality[];
  /** Groups of step numbers whose captures are byte-identical. */
  duplicateGroups: number[][];
  missingFiles: string[];
  syntheticStepCount: number;
  stepCount: number;
}

/** Per-step quality for one walkthrough, including duplicate grouping. */
export function getWalkthroughQuality(
  slug: string,
  walkthrough: Walkthrough,
): WalkthroughQuality {
  const dir = projectDir(slug);
  const steps: StepQuality[] = walkthrough.steps.map((s) => ({
    stepNumber: s.stepNumber,
    title: s.title,
    screenshotFilename: s.screenshotFilename,
    contentHash: hashFile(path.join(dir, s.screenshotFilename)),
    // Step 1 is the entry state — nothing had to happen to reach it. Every
    // step after it should name the interaction that got us there.
    missingAction: s.stepNumber > 1 && !s.action,
  }));

  const byHash = new Map<string, number[]>();
  for (const s of steps) {
    if (!s.contentHash) continue;
    const bucket = byHash.get(s.contentHash) ?? [];
    bucket.push(s.stepNumber);
    byHash.set(s.contentHash, bucket);
  }

  const duplicateGroups: number[][] = [];
  for (const bucket of byHash.values()) {
    if (bucket.length < 2) continue;
    duplicateGroups.push(bucket);
    const [first, ...rest] = bucket;
    for (const n of rest) {
      const step = steps.find((x) => x.stepNumber === n);
      if (step) step.duplicateOfStep = first;
    }
  }

  return {
    steps,
    duplicateGroups,
    missingFiles: steps.filter((s) => s.contentHash === null).map((s) => s.screenshotFilename),
    syntheticStepCount: walkthrough.steps.filter((s) => s.verificationStatus === "synthetic")
      .length,
    stepCount: walkthrough.steps.length,
  };
}

// ── Taxonomy: features vs. variants ─────────────────────────────────────────

/**
 * A catalog entry that is really a slice of another feature rather than a
 * feature of its own.
 *
 * This matters because the feature count is the headline number on every
 * card. Listing `checkout`, `checkout-ar` and `checkout-mobile` as three
 * features triples that number without documenting anything more.
 */
export interface VariantFeature {
  feature: CatalogFeature;
  /** `locale` — a translation of another feature. `surface` — a form factor. */
  reason: "locale" | "surface";
  parentFeatureId?: string;
}

export interface CatalogTaxonomy {
  primaries: CatalogFeature[];
  variants: VariantFeature[];
}

const LOCALE_SEGMENT = /(^|\/)(ar|fr|es|de|pt|zh|ja|ko|hi|ur|tr|ru|it|nl)(\/|$)/i;
const LOCALE_SUFFIX = /[-_](ar|fr|es|de|pt|zh|ja|ko|hi|ur|tr|ru|it|nl|arabic|french|spanish)$/i;
const SURFACE_SUFFIX = /[-_](mobile|desktop|tablet|phone|ipad|iphone|android|narrow|wide)$/i;

/**
 * Split features into primaries and variants. Every feature is preserved —
 * this only regroups them, so nothing is ever hidden by the classification.
 */
export function classifyCatalog(catalog: Catalog | null): CatalogTaxonomy {
  if (!catalog) return { primaries: [], variants: [] };

  const primaries: CatalogFeature[] = [];
  const variants: VariantFeature[] = [];
  const ids = new Set(catalog.features.map((f) => f.featureId));

  /** Strip the variant suffix and see if the base feature actually exists. */
  const parentOf = (id: string, re: RegExp): string | undefined => {
    const base = id.replace(re, "");
    return base !== id && ids.has(base) ? base : undefined;
  };

  for (const f of catalog.features) {
    const category = (f.category ?? "").toLowerCase();
    const id = f.featureId;
    const location = f.location ?? "";

    if (category === "i18n" || category === "localization" || LOCALE_SUFFIX.test(id) || LOCALE_SEGMENT.test(location)) {
      variants.push({ feature: f, reason: "locale", parentFeatureId: parentOf(id, LOCALE_SUFFIX) });
      continue;
    }
    if (category === "responsive" || SURFACE_SUFFIX.test(id)) {
      variants.push({
        feature: f,
        reason: "surface",
        parentFeatureId: parentOf(id, SURFACE_SUFFIX),
      });
      continue;
    }
    primaries.push(f);
  }

  return { primaries, variants };
}

// ── The report ──────────────────────────────────────────────────────────────

export type IssueKind =
  | "duplicate-captures"
  | "missing-captures"
  | "variants-as-features"
  | "thin-walkthrough"
  | "claimed-but-absent"
  | "unknown-surface"
  | "all-synthetic"
  | "open-issues"
  | "persona-without-journey"
  | "steps-without-action";

export interface CatalogIssue {
  severity: "warning" | "info";
  kind: IssueKind;
  title: string;
  /** Markdown. Rendered through `<Prose>`. */
  detail: string;
  featureIds?: string[];
}

export interface CatalogHealthReport {
  issues: CatalogIssue[];
  taxonomy: CatalogTaxonomy;
  /** Per-walkthrough quality, keyed `${featureId}:${surfaceId}`. */
  walkthroughs: Record<string, WalkthroughQuality>;
  /** Counted across everything on disk. */
  totals: {
    steps: number;
    syntheticSteps: number;
    liveSteps: number;
  };
}

const code = (s: string) => `\`${s}\``;
const list = (items: string[], max = 8): string => {
  const shown = items.slice(0, max).map(code).join(", ");
  return items.length > max ? `${shown} and ${items.length - max} more` : shown;
};
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/**
 * Scan a project's catalog and every walkthrough on disk. Safe to call from a
 * server component — bounded by the number of catalog features and memoized
 * per process for file hashing.
 */
export function getCatalogHealth(
  slug: string,
  catalog: Catalog | null,
  issues: CapturedIssue[] = [],
): CatalogHealthReport {
  const issuesOut: CatalogIssue[] = [];
  const taxonomy = classifyCatalog(catalog);
  const walkthroughs: Record<string, WalkthroughQuality> = {};
  const totals = { steps: 0, syntheticSteps: 0, liveSteps: 0 };

  if (!catalog) return { issues: issuesOut, taxonomy, walkthroughs, totals };

  const platform: Platform = catalog.platform ?? "web";

  // 1 — Variants masquerading as features.
  if (taxonomy.variants.length > 0) {
    issuesOut.push({
      severity: "warning",
      kind: "variants-as-features",
      title: `${taxonomy.variants.length} catalog ${plural(
        taxonomy.variants.length,
        "entry",
        "entries",
      )} ${taxonomy.variants.length === 1 ? "is" : "are"} really a variant`,
      detail: `${list(
        taxonomy.variants.map((v) => `${v.feature.featureId} (${v.reason})`),
      )} look like locale or form-factor slices rather than features of their own. Capture them against the *same* feature id — locale goes in \`locale\`, form factor in \`surface\` — so the feature count stays honest.`,
      featureIds: taxonomy.variants.map((v) => v.feature.featureId),
    });
  }

  // 2 — Surface ids nobody can resolve.
  const knownSurfaceIds = new Set([
    ...BUILTIN_SURFACES.map((s) => s.id),
    ...(catalog.surfaces ?? []).map((s: Surface) => s.id),
  ]);
  const unknownSurfaces = new Set<string>();
  for (const f of catalog.features) {
    for (const id of Object.keys(f.surfaceStatus ?? {})) {
      if (!knownSurfaceIds.has(id)) unknownSurfaces.add(id);
    }
  }
  if (unknownSurfaces.size > 0) {
    issuesOut.push({
      severity: "info",
      kind: "unknown-surface",
      title: `${unknownSurfaces.size} unrecognized ${plural(unknownSurfaces.size, "surface")}`,
      detail: `${list([
        ...unknownSurfaces,
      ])} ${unknownSurfaces.size === 1 ? "isn't" : "aren't"} a built-in preset and ${
        unknownSurfaces.size === 1 ? "isn't" : "aren't"
      } declared in \`catalog.json › surfaces\`. Captures still render, but unframed and with a raw id as the label — add a surface definition with real dimensions.`,
    });
  }

  // 3 — Per-walkthrough quality, plus coverage claims we can't back up.
  const duplicated: string[] = [];
  const missing: string[] = [];
  const thin: string[] = [];
  const claimedButAbsent: string[] = [];
  const actionless: string[] = [];

  for (const f of catalog.features) {
    for (const [surfaceId, status] of Object.entries(f.surfaceStatus ?? {})) {
      const wt = getWalkthrough(slug, f.featureId, surfaceId);

      if (!wt) {
        // The loudest possible signal: the catalog says this was walked, and
        // there is nothing on disk to show for it.
        if (status === "done") claimedButAbsent.push(`${f.featureId} (${surfaceId})`);
        continue;
      }

      const quality = getWalkthroughQuality(slug, wt);
      walkthroughs[`${f.featureId}:${surfaceId}`] = quality;

      totals.steps += quality.stepCount;
      totals.syntheticSteps += quality.syntheticStepCount;

      const label = `${f.featureId} (${surfaceId})`;
      if (quality.duplicateGroups.length > 0) duplicated.push(label);
      if (quality.missingFiles.length > 0) missing.push(label);
      if (quality.stepCount <= 1) thin.push(label);
      if (quality.steps.some((s) => s.missingAction)) actionless.push(label);
    }
  }
  totals.liveSteps = totals.steps - totals.syntheticSteps;

  if (claimedButAbsent.length > 0) {
    issuesOut.push({
      severity: "warning",
      kind: "claimed-but-absent",
      title: `${claimedButAbsent.length} ${plural(
        claimedButAbsent.length,
        "capture",
      )} marked done with no walkthrough on disk`,
      detail: `${list(
        claimedButAbsent,
      )} ${claimedButAbsent.length === 1 ? "is" : "are"} marked \`"done"\` in \`surfaceStatus\` but ${claimedButAbsent.length === 1 ? "has" : "have"} no walkthrough file. Either the run didn't finish writing, or the status was set optimistically. Set it back to \`"pending"\` or re-run the capture.`,
      featureIds: claimedButAbsent.map((s) => s.split(" ")[0]),
    });
  }

  if (duplicated.length > 0) {
    issuesOut.push({
      severity: "warning",
      kind: "duplicate-captures",
      title: `Byte-identical captures in ${duplicated.length} ${plural(
        duplicated.length,
        "walkthrough",
      )}`,
      detail: `${list(
        duplicated,
      )} store the **same bytes** under different filenames. Nothing happened in the app between those steps — interact with it (tap, type, scroll, navigate) before the next capture, or collapse the steps into one.`,
      featureIds: duplicated.map((s) => s.split(" ")[0]),
    });
  }

  if (missing.length > 0) {
    issuesOut.push({
      severity: "warning",
      kind: "missing-captures",
      title: `Missing capture files in ${missing.length} ${plural(missing.length, "walkthrough")}`,
      detail: `${list(missing)} reference files that don't exist on disk. Those steps render as blanks while still counting toward coverage.`,
      featureIds: missing.map((s) => s.split(" ")[0]),
    });
  }

  if (thin.length > 0) {
    issuesOut.push({
      severity: "info",
      kind: "thin-walkthrough",
      title: `${thin.length} ${plural(thin.length, "walkthrough")} with a single step`,
      detail: `${list(thin)} ${thin.length === 1 ? "has" : "have"} one step. A single capture shows a screen, not how it behaves — usually a sign the scenario stopped at the front door.`,
      featureIds: thin.map((s) => s.split(" ")[0]),
    });
  }

  if (actionless.length > 0) {
    issuesOut.push({
      severity: "info",
      kind: "steps-without-action",
      title: `${actionless.length} ${plural(
        actionless.length,
        "walkthrough",
      )} with unexplained steps`,
      detail: `${list(actionless)} contain steps after the first with no \`action\` recorded. Without it a reader can't tell what moved the app from the previous state — and neither can the next agent trying to reproduce the walk.`,
      featureIds: actionless.map((s) => s.split(" ")[0]),
    });
  }

  // 4 — Honesty about synthetic coverage.
  if (totals.steps > 0 && totals.liveSteps === 0) {
    issuesOut.push({
      severity: "warning",
      kind: "all-synthetic",
      title: "Every step is synthetic",
      detail: `All ${totals.steps} ${plural(
        totals.steps,
        "step",
      )} are marked \`synthetic\` — described from source, never driven against a running ${platform === "cli" ? "binary" : "app"}. This is a map, not a walkthrough. Useful as a plan; not evidence that anything works.`,
    });
  }

  // 5 — What the walk found broken.
  //
  // Issues live here rather than in their own panel because they *are* a
  // quality finding: the walk telling you what it hit. Splitting them into a
  // separate tab made them easy to miss, which defeats the point of recording
  // them at all.
  const open = issues.filter((i) => (i.status ?? "open") === "open");
  if (open.length > 0) {
    const blockers = open.filter((i) => i.severity === "blocker").length;
    const byFeature = open
      .map((i) => (i.featureId ? `${i.title} (\`${i.featureId}\`)` : i.title))
      .slice(0, 6);
    issuesOut.push({
      severity: blockers > 0 ? "warning" : "info",
      kind: "open-issues",
      title: `${open.length} open ${plural(open.length, "issue")} found while walking${
        blockers > 0 ? ` · ${blockers} blocking` : ""
      }`,
      detail: `${byFeature.join("; ")}${
        open.length > 6 ? `; and ${open.length - 6} more` : ""
      }. These were recorded during capture, not fixed — the walk observes the product, it doesn't repair it.`,
      featureIds: open.map((i) => i.featureId).filter((id): id is string => Boolean(id)),
    });
  }

  // 6 — Personas asserted but never walked.
  //
  // Declaring a persona is free and costs nothing to be wrong about. Walking
  // one is the expensive part, and it is the only part that constitutes
  // evidence that the product serves that role. A catalog listing six
  // personas with one journey between them is claiming five times the
  // coverage it has, and the persona grid will happily render all six as
  // equals — so the discrepancy has to be said out loud somewhere.
  //
  // This replaces the predecessor's `no-persona-journeys`, which only fired
  // when a catalog had more than one persona and so stayed silent on the
  // single worst case: exactly one persona, never walked.
  const personas = catalog.personas ?? [];
  if (personas.length > 0) {
    const unwalked = personas.filter((persona) => !hasWalkedJourney(slug, persona.id));
    if (unwalked.length > 0) {
      issuesOut.push({
        severity: "info",
        kind: "persona-without-journey",
        title: `${unwalked.length} of ${personas.length} ${plural(
          personas.length,
          "persona",
        )} ${unwalked.length === 1 ? "has" : "have"} no walked journey`,
        detail: `${unwalked
          .map((p) => `**${p.name}**`)
          .slice(0, 6)
          .join(", ")}${
          unwalked.length > 6 ? `, and ${unwalked.length - 6} more` : ""
        } ${
          unwalked.length === 1 ? "is" : "are"
        } declared in the catalog but nothing has been captured for them. A declared persona is somebody's hypothesis about who uses this; only a walked journey is evidence.`,
      });
    }
  }

  return { issues: issuesOut, taxonomy, walkthroughs, totals };
}

/**
 * Does a persona have at least one journey file with at least one scene?
 *
 * Reads the directory rather than trusting `keyJourneys`, for the same reason
 * `claimed-but-absent` exists: the catalog is a claim and the filesystem is
 * the evidence, and this check is specifically about the gap between them.
 */
function hasWalkedJourney(slug: string, personaId: string): boolean {
  const dir = projectDir(slug);
  if (!fs.existsSync(dir)) return false;
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return false;
  }
  const prefix = `persona-${personaId}`;
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    if (name !== `${prefix}.json` && !name.startsWith(`${prefix}.`)) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      if (Array.isArray(doc?.scenes) && doc.scenes.length > 0) return true;
    } catch {
      // A malformed journey file is not a walked journey.
    }
  }
  return false;
}
