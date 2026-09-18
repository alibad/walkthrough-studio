import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { WalkthroughViewer } from "@/components/walkthrough-viewer";
import { PlatformBadge } from "@/components/platform-badge";
import { SyntheticNotice } from "@/components/status";
import { StatePlate } from "@/components/plate";
import { formatLocation } from "@/lib/platforms";
import {
  getCatalog,
  getFeature,
  getFeatureSurfaces,
  getProject,
  getWalkthroughsForFeature,
} from "@/lib/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ project: string; featureId: string }>;
}): Promise<Metadata> {
  const { project: slug, featureId } = await params;
  const project = getProject(slug);
  const feature = getFeature(slug, featureId);
  if (!project || !feature) return { title: "Not found" };
  return {
    title: `${feature.featureName} · ${project.name}`,
    description: `Walkthrough of ${feature.featureName} in ${project.name}.`,
  };
}

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ project: string; featureId: string }>;
}) {
  const { project: slug, featureId } = await params;
  const project = getProject(slug);
  const feature = getFeature(slug, featureId);
  if (!project || !feature) notFound();

  const catalog = getCatalog(slug);
  const platform = catalog?.platform ?? project.target.platform;
  const surfaces = getFeatureSurfaces(slug, featureId);
  const walkthroughs = getWalkthroughsForFeature(slug, featureId);

  // A feature can exist in the catalog with nothing captured — that's the
  // normal state before a run, and it deserves a real page explaining what to
  // do rather than a 404.
  const hasCaptures = surfaces.length > 0;

  // "Blocked" and "not captured yet" are different facts and get different
  // pages: one is a permanent limitation of the platform, the other is a
  // backlog item. Collapsing them would hide the former behind an implied
  // promise that someone will get round to it.
  const blockedSurfaces = Object.entries(feature.surfaceStatus ?? {})
    .filter(([, status]) => status === "blocked")
    .map(([id]) => id);
  const isBlocked = !hasCaptures && blockedSurfaces.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        crumbs={[
          { label: project.name, href: `/${slug}` },
          { label: feature.featureName },
        ]}
      />

      <main className="flex-1 above-grain">
        <header className="border-b border-rule bg-paper-raised">
          <div className="mx-auto max-w-[76rem] px-6 py-9">
            <div className="flex flex-wrap items-center gap-2">
              <PlatformBadge platform={platform} />
              <span className="text-micro font-medium text-ink-faint">
                {feature.category}
              </span>
              {feature.requiresAuth && (
                <span className="inline-flex items-center gap-1 text-micro text-ink-faint">
                  <Lock className="size-3" aria-hidden />
                  {feature.authRole ?? "requires sign-in"}
                </span>
              )}
            </div>

            <h1 className="display mt-3.5 text-head-lg max-w-[26ch]">
              {feature.featureName}
            </h1>

            {feature.location && (
              <p className="mt-3">
                <span className="locator text-small">
                  {formatLocation(feature.location, platform)}
                </span>
              </p>
            )}
          </div>
        </header>

        <div className="mx-auto max-w-[76rem] px-6 py-10">
          {feature.synthetic && (
            <SyntheticNotice reason={feature.syntheticReason} className="mb-8" />
          )}

          {hasCaptures ? (
            <WalkthroughViewer
              slug={slug}
              platform={platform}
              walkthroughs={walkthroughs}
              surfaces={surfaces}
              featureName={feature.featureName}
            />
          ) : isBlocked ? (
            <BlockedSurfaces
              blocked={blockedSurfaces}
              notes={feature.notes}
            />
          ) : (
            <NotCapturedYet
              slug={slug}
              featureId={featureId}
              location={feature.location}
              notes={feature.notes}
            />
          )}

          <div className="mt-16 border-t border-rule pt-6">
            <Link
              href={`/${slug}`}
              className="inline-flex items-center gap-1.5 text-small text-ink-muted transition-colors hover:text-ink"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              All features in {project.name}
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function BlockedSurfaces({
  blocked,
  notes,
}: {
  blocked: string[];
  notes?: string;
}) {
  return (
    <div className="py-8">
      <StatePlate
        src="/art/state-blocked.png"
        title={`Can't be captured on ${blocked.join(", ")}`}
        maxWidth={420}
      >
        <p>
          The driver for this platform can&apos;t reach this feature — usually
          hardware the simulator doesn&apos;t have, or a flow that needs more than
          one device. This is a permanent limitation, not a backlog item, which is
          why it reads <em>blocked</em> rather than <em>pending</em>.
        </p>
        {notes && (
          <p className="mt-3 rounded-sm border border-rule bg-paper-sunken px-3 py-2.5 text-left">
            <span className="font-medium text-ink">Why: </span>
            {notes}
          </p>
        )}
      </StatePlate>
    </div>
  );
}

function NotCapturedYet({
  slug,
  featureId,
  location,
  notes,
}: {
  slug: string;
  featureId: string;
  location?: string;
  notes?: string;
}) {
  return (
    <div className="py-8">
      <StatePlate src="/art/state-not-captured.png" title="Not walked yet" maxWidth={420}>
        <p>
          This feature is in the catalog but no capture exists for it. That&apos;s an
          honest gap, not a broken page.
        </p>

        {notes && (
          <p className="mt-3 rounded-sm border border-rule bg-paper-sunken px-3 py-2.5 text-left">
            <span className="font-medium text-ink">Note from the last run: </span>
            {notes}
          </p>
        )}

        <pre className="mt-4 overflow-x-auto rounded-sm border border-rule bg-paper-sunken px-3 py-2.5 text-left font-mono text-small text-ink">
          {`/walkthrough ${location ?? featureId} --project=${slug}`}
        </pre>
        <p className="mt-2.5 text-micro text-ink-faint">
          Run that in Claude Code or Codex from the repo root.
        </p>
      </StatePlate>
    </div>
  );
}
