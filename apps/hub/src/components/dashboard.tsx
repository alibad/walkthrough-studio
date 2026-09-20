"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Camera, Layers, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlatformBadge, PlatformIcon } from "@/components/platform-badge";
import { StalenessPill } from "@/components/status";
import { Plate } from "@/components/plate";
import { PLATFORM_PROFILES, platformProfile } from "@/lib/platforms";
import type { Platform, ProjectSummary } from "@/lib/types";

/**
 * The library view. One card per registered app.
 *
 * Client-side because of the platform filter, which needs to be instant — the
 * whole point of the filter is scanning, and a server round-trip per chip
 * would make it feel like a search.
 */

interface DashboardProps {
  /** Pre-serialized on the server; `ProjectSummary` is plain JSON. */
  summaries: ProjectSummary[];
}

export function Dashboard({ summaries }: DashboardProps) {
  const [platform, setPlatform] = useState<Platform | "all">("all");

  const platformsPresent = useMemo(() => {
    const seen = new Set<Platform>();
    for (const s of summaries) seen.add(s.project.target.platform);
    // Keep the canonical order rather than insertion order, so the filter row
    // doesn't reshuffle when the registry changes.
    return (Object.keys(PLATFORM_PROFILES) as Platform[]).filter((p) => seen.has(p));
  }, [summaries]);

  const visible = useMemo(
    () =>
      platform === "all"
        ? summaries
        : summaries.filter((s) => s.project.target.platform === platform),
    [summaries, platform],
  );

  const totals = useMemo(
    () =>
      summaries.reduce(
        (acc, s) => ({
          features: acc.features + s.featureCount,
          walked: acc.walked + s.walkedCount,
          captures: acc.captures + s.screenshotCount,
          personas: acc.personas + s.personaCount,
        }),
        { features: 0, walked: 0, captures: 0, personas: 0 },
      ),
    [summaries],
  );

  return (
    <div className="above-grain">
      <Hero totals={totals} projectCount={summaries.length} />

      <section className="mx-auto max-w-[76rem] px-6 pb-24">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4 border-b border-rule pb-4">
          <h2 className="font-serif text-head">
            {visible.length} {visible.length === 1 ? "app" : "apps"}
          </h2>

          {platformsPresent.length > 1 && (
            <div
              className="flex flex-wrap items-center gap-1"
              role="group"
              aria-label="Filter by platform"
            >
              <FilterChip
                active={platform === "all"}
                onClick={() => setPlatform("all")}
                label="All"
              />
              {platformsPresent.map((p) => (
                <FilterChip
                  key={p}
                  active={platform === p}
                  onClick={() => setPlatform(p)}
                  label={PLATFORM_PROFILES[p].short}
                  icon={<PlatformIcon platform={p} className="size-3" />}
                />
              ))}
            </div>
          )}
        </div>

        {/* Selecting a platform is also a question: "what does documenting an
            iOS app actually involve?" Answer it here, where it's been asked,
            rather than making someone go and read the driver guide. */}
        {platform !== "all" && <PlatformStrip platform={platform} />}

        {visible.length === 0 ? (
          <EmptyLibrary filtered={platform !== "all"} />
        ) : (
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((summary) => (
              <li key={summary.project.slug}>
                <ProjectCard summary={summary} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────

function Hero({
  totals,
  projectCount,
}: {
  totals: { features: number; walked: number; captures: number; personas: number };
  projectCount: number;
}) {
  return (
    <section className="mx-auto max-w-[76rem] px-6 pb-14 pt-12">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <p className="eyebrow mb-5">Walkthrough Studio</p>
          <h1 className="display text-display-lg max-w-[18ch]">
            See how it actually works.
          </h1>
          <p className="mt-6 max-w-[46ch] text-body leading-relaxed text-ink-muted">
            An agent drives your app the way a person would — clicking, typing,
            tapping, running commands — and writes down what it saw. Web, mobile,
            desktop, command line. Every capture is dated against a commit, so
            you always know whether the documentation still matches the product.
          </p>

          <dl className="mt-9 flex flex-wrap gap-x-10 gap-y-5 border-t border-rule pt-6">
            <Stat value={projectCount} label={projectCount === 1 ? "app" : "apps"} />
            <Stat
              value={totals.walked}
              label="features walked"
              hint={
                totals.features > totals.walked
                  ? `${totals.features - totals.walked} still to go`
                  : undefined
              }
            />
            <Stat value={totals.captures} label="captures" />
            {totals.personas > 0 && <Stat value={totals.personas} label="personas" />}
          </dl>
        </div>

        {/* The hero plate. Decorative — the stats above carry the information,
            so it's marked aria-hidden and given no caption. */}
        <div className="relative" aria-hidden>
          <div className="mat overflow-hidden rounded-md">
            <Image
              src="/art/hero-studio.png"
              alt=""
              width={1536}
              height={1024}
              priority
              sizes="(max-width: 1024px) 100vw, 640px"
              className="h-auto w-full mix-blend-multiply"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
  hint,
}: {
  value: number | string;
  label: string;
  hint?: string;
}) {
  return (
    <div>
      <dd className="font-serif text-head-lg leading-none nums">{value}</dd>
      <dt className="mt-1.5 text-label text-ink-muted">{label}</dt>
      {hint && <p className="mt-0.5 text-micro text-ink-faint">{hint}</p>}
    </div>
  );
}

// ── Filter ──────────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-label font-medium transition-colors",
        active
          ? "border-ink bg-ink text-paper"
          : "border-rule bg-paper-raised text-ink-muted hover:border-rule-strong hover:text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PlatformStrip({ platform }: { platform: Platform }) {
  const profile = platformProfile(platform);
  return (
    <aside className="mb-7 flex items-center gap-5 rounded-md border border-rule bg-paper-raised px-5 py-4 shadow-plate">
      <Plate
        src={profile.art}
        width={512}
        height={512}
        sizes="112px"
        className="hidden h-auto w-28 shrink-0 sm:block"
      />
      <div className="min-w-0">
        <h3 className="font-serif text-title">{profile.label}</h3>
        <p className="mt-1 max-w-[70ch] text-small leading-relaxed text-ink-muted">
          {profile.blurb}
        </p>
        <p className="mt-2 text-micro text-ink-faint">
          {profile.location.label} looks like{" "}
          <code className="font-mono text-[0.75rem] text-ink-muted">
            {profile.location.example}
          </code>
        </p>
      </div>
    </aside>
  );
}

// ── Project card ────────────────────────────────────────────────────────────

function ProjectCard({ summary }: { summary: ProjectSummary }) {
  const { project, catalog, staleness } = summary;
  const scopeStatus = catalog?.scope?.status ?? "unknown";
  const canClaimPercentage = scopeStatus === "comprehensive";
  const coverage =
    summary.featureCount > 0
      ? Math.round((summary.walkedCount / summary.featureCount) * 100)
      : 0;

  return (
    <Link
      href={`/${project.slug}`}
      className="group flex h-full flex-col rounded-md border border-rule bg-paper-raised p-5 shadow-plate transition-all hover:border-rule-strong hover:shadow-plate-lift"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <PlatformBadge platform={project.target.platform} />
          {project.tag && (
            <span className="text-micro font-medium text-ink-faint">{project.tag}</span>
          )}
        </div>
        <ArrowUpRight
          className="size-4 shrink-0 text-ink-faint transition-colors group-hover:text-brand"
          aria-hidden
        />
      </div>

      <h3 className="font-serif text-title leading-snug">{project.name}</h3>

      {project.description && (
        <p className="mt-2 line-clamp-3 text-small leading-relaxed text-ink-muted">
          {project.description}
        </p>
      )}

      <div className="mt-4 flex-1" />

      {/* A percentage is meaningful only after the product inventory has been
          reconciled. A bounded one-of-one slice is not 100% of a product. */}
      {summary.featureCount > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 flex items-baseline justify-between text-micro text-ink-faint">
            <span>
              <span className="font-medium text-ink-muted nums">
                {summary.walkedCount}
              </span>{" "}
              {canClaimPercentage ? (
                <>of <span className="nums">{summary.featureCount}</span> features</>
              ) : scopeStatus === "bounded" ? (
                <>walked in a bounded slice</>
              ) : (
                <>of <span className="nums">{summary.featureCount}</span> catalogued</>
              )}
            </span>
            <span className={cn("nums", !canClaimPercentage && "font-medium text-warn")}>
              {canClaimPercentage
                ? `${coverage}%`
                : scopeStatus === "bounded"
                  ? "Not product coverage"
                  : scopeStatus === "partial"
                    ? "Partial inventory"
                    : "Scope not declared"}
            </span>
          </div>
          {canClaimPercentage && (
            <div className="h-[3px] overflow-hidden rounded-full bg-paper-deep">
              <div
                className="h-full rounded-full bg-ink/70 transition-[width]"
                style={{ width: `${coverage}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule pt-3">
        <StalenessPill staleness={staleness} />
        <span className="flex items-center gap-3 text-micro text-ink-faint">
          {summary.screenshotCount > 0 && (
            <span className="inline-flex items-center gap-1" title="Captures on disk">
              <Camera className="size-3" aria-hidden />
              <span className="nums">{summary.screenshotCount}</span>
            </span>
          )}
          {summary.personaCount > 0 && (
            <span className="inline-flex items-center gap-1" title="Personas">
              <Users className="size-3" aria-hidden />
              <span className="nums">{summary.personaCount}</span>
            </span>
          )}
          {summary.surfaces.length > 1 && (
            <span
              className="inline-flex items-center gap-1"
              title={summary.surfaces.map((s) => s.label).join(" · ")}
            >
              <Layers className="size-3" aria-hidden />
              <span className="nums">{summary.surfaces.length}</span>
            </span>
          )}
        </span>
      </div>

      {catalog?.synthetic && (
        <p className="mt-2.5 text-micro font-medium text-warn">
          Mapped from source — not captured
        </p>
      )}
    </Link>
  );
}

// ── Empty ───────────────────────────────────────────────────────────────────

function EmptyLibrary({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <p className="py-16 text-center text-small text-ink-muted">
        No apps registered on that platform yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <Image
        src="/art/empty-nothing-captured.png"
        alt=""
        width={1536}
        height={1024}
        aria-hidden
        className="w-full max-w-md opacity-90"
      />
      <div className="max-w-[44ch]">
        <h3 className="font-serif text-title">Nothing registered yet</h3>
        <p className="mt-2 text-small leading-relaxed text-ink-muted">
          Add an app to{" "}
          <code className="font-mono text-[0.8125rem] text-ink">projects.json</code>, then
          run <code className="font-mono text-[0.8125rem] text-ink">/walkthrough</code> in
          Claude Code or Codex to capture it.
        </p>
      </div>
    </div>
  );
}
