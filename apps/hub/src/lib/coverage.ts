/**
 * Pure coverage predicates — no filesystem, no git, no `node:` imports.
 *
 * This file exists because of a boundary that has now bitten twice. The data
 * layer (`data.ts`) reaches git through `run-history.ts` → `target-git.ts` →
 * `node:child_process`. Any client component that imports *anything* from a
 * module which transitively imports `data.ts` drags `child_process` into the
 * browser bundle, and the build fails with "the chunking context does not
 * support external modules" — a message that names the chunk, not the import
 * that caused it.
 *
 * So: predicates that only need plain objects live here, where both a server
 * reader and a client chart can import them safely. `data.ts` re-exports them
 * so server-side callers don't need to know the split exists.
 */

import type { CatalogFeature } from "./types";

/**
 * A feature counts as walked when at least one of its surfaces is `done`.
 *
 * Partial coverage is still coverage — the project page breaks it down per
 * surface, and treating "desktop done, mobile pending" as unwalked would make
 * every project look emptier than it is.
 */
export function isFeatureWalked(feature: CatalogFeature): boolean {
  return Object.values(feature.surfaceStatus ?? {}).some((s) => s === "done");
}

/** Walked / catalogued, as a 0..1 ratio. Zero features reads as zero, not NaN. */
export function coverageRatio(features: CatalogFeature[]): number {
  if (features.length === 0) return 0;
  return features.filter(isFeatureWalked).length / features.length;
}
