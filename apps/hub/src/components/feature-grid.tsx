"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Lock, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { CaptureStatusChip } from "@/components/status";
import { PlateIcon } from "@/components/plate";
import { categoryArt } from "@/lib/category-art";
import { formatLocation } from "@/lib/platforms";
import type { CatalogTaxonomy } from "@/lib/catalog-health";
import type { CatalogFeature, Platform, Surface } from "@/lib/types";

/**
 * The feature index.
 *
 * Variants (locale and form-factor slices) are collapsed under their parent
 * by default and revealed by a toggle. The alternative — listing them as
 * peers — was the single most misleading thing the old version of this hub
 * did: an app with 8 features and 3 locales appeared to have 24, and the
 * feature count is the number everyone reads first.
 *
 * Grouped by category, because a flat list of 40 features is a wall, and the
 * categories the capture agent assigns are usually the app's own information
 * architecture.
 */
export function FeatureGrid({
  slug,
  platform,
  taxonomy,
  surfaces,
}: {
  slug: string;
  platform: Platform;
  taxonomy: CatalogTaxonomy;
  surfaces: Surface[];
}) {
  const [showVariants, setShowVariants] = useState(false);

  const surfaceLabel = useMemo(
    () => new Map(surfaces.map((s) => [s.id, s.label])),
    [surfaces],
  );

  /** Variants hanging off each primary, for the "also walked" line. */
  const variantsByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const v of taxonomy.variants) {
      if (!v.parentFeatureId) continue;
      const bucket = map.get(v.parentFeatureId) ?? [];
      bucket.push(v.feature.featureId);
      map.set(v.parentFeatureId, bucket);
    }
    return map;
  }, [taxonomy.variants]);

  const shown = showVariants
    ? [...taxonomy.primaries, ...taxonomy.variants.map((v) => v.feature)]
    : taxonomy.primaries;

  const byCategory = useMemo(() => {
    const groups = new Map<string, CatalogFeature[]>();
    for (const f of shown) {
      const key = f.category || "Other";
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  if (taxonomy.primaries.length === 0 && taxonomy.variants.length === 0) {
    return (
      <p className="py-12 text-center text-small text-ink-muted">
        No features catalogued yet. Run{" "}
        <code className="font-mono text-[0.8125rem] text-ink">/walkthrough catalog</code> to
        discover them.
      </p>
    );
  }

  return (
    <div>
      {taxonomy.variants.length > 0 && (
        <div className="mb-4 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowVariants((v) => !v)}
            aria-pressed={showVariants}
            className="text-micro font-medium text-ink-muted underline decoration-rule-strong underline-offset-2 transition-colors hover:text-ink"
          >
            {showVariants ? "Hide" : "Show"} {taxonomy.variants.length} locale and
            form-factor {taxonomy.variants.length === 1 ? "variant" : "variants"}
          </button>
        </div>
      )}

      <div className="space-y-9">
        {byCategory.map(([category, features]) => (
          <section key={category}>
            <div className="mb-4 flex items-center gap-3 border-b border-rule pb-2.5">
              {categoryArt(category) && (
                <PlateIcon src={categoryArt(category)!} size={40} className="-ml-1" />
              )}
              <h3 className="eyebrow">
                {category}
                <span className="ml-2 font-normal normal-case tracking-normal text-ink-faint nums">
                  {features.length}
                </span>
              </h3>
            </div>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {features.map((feature) => (
                <li key={feature.featureId}>
                  <FeatureRow
                    slug={slug}
                    platform={platform}
                    feature={feature}
                    surfaceLabel={surfaceLabel}
                    alsoWalked={variantsByParent.get(feature.featureId) ?? []}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function FeatureRow({
  slug,
  platform,
  feature,
  surfaceLabel,
  alsoWalked,
}: {
  slug: string;
  platform: Platform;
  feature: CatalogFeature;
  surfaceLabel: Map<string, string>;
  alsoWalked: string[];
}) {
  const statuses = Object.entries(feature.surfaceStatus ?? {});
  const walked = statuses.some(([, s]) => s === "done");

  return (
    <Link
      href={`/${slug}/features/${feature.featureId}`}
      className={cn(
        "group flex h-full flex-col rounded-md border bg-paper-raised p-4 transition-all",
        walked
          ? "border-rule shadow-plate hover:border-rule-strong hover:shadow-plate-lift"
          : // Unwalked features are visibly provisional: no shadow, so they sit
            // flat on the page rather than presenting as finished plates.
            "border-dashed border-rule-strong/60 hover:border-rule-strong",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-serif text-title leading-snug">{feature.featureName}</h4>
        <ArrowUpRight
          className="mt-0.5 size-3.5 shrink-0 text-ink-faint transition-colors group-hover:text-brand"
          aria-hidden
        />
      </div>

      {feature.location && (
        <p className="mt-2">
          <span className="locator">{formatLocation(feature.location, platform)}</span>
        </p>
      )}

      {feature.notes && (
        <p className="mt-2 line-clamp-2 text-small leading-relaxed text-ink-muted">
          {feature.notes}
        </p>
      )}

      <div className="mt-3 flex-1" />

      <div className="flex flex-wrap items-center gap-1.5">
        {statuses.map(([surfaceId, status]) => (
          <CaptureStatusChip
            key={surfaceId}
            status={status}
            surfaceLabel={surfaceLabel.get(surfaceId) ?? surfaceId}
          />
        ))}
        {feature.videoStatus === "done" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-brand/25 bg-brand-wash px-2 py-0.5 text-micro font-medium text-brand-deep">
            <Play className="size-2.5 fill-current" strokeWidth={1.75} aria-hidden />
            Video walkthrough
          </span>
        )}
        {feature.requiresAuth && (
          <span
            className="inline-flex items-center gap-1 text-micro text-ink-faint"
            title={
              feature.authRole
                ? `Requires the "${feature.authRole}" role`
                : "Requires sign-in"
            }
          >
            <Lock className="size-3" aria-hidden />
            {feature.authRole ?? "auth"}
          </span>
        )}
      </div>

      {alsoWalked.length > 0 && (
        <p className="mt-2.5 text-micro text-ink-faint">
          Also walked: {alsoWalked.join(" · ")}
        </p>
      )}

      {feature.synthetic && (
        <p className="mt-2 text-micro font-medium text-warn">
          Described from source, not captured
        </p>
      )}
    </Link>
  );
}
