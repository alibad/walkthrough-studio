import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { ProjectHero } from "@/components/project-hero";
import { FeatureGrid } from "@/components/feature-grid";
import { RunLog } from "@/components/run-log";
import { WhatsNew } from "@/components/whats-new";
import { CatalogHealthBanner } from "@/components/catalog-health-banner";
import { SyntheticNotice } from "@/components/status";
import { getCatalogHealth } from "@/lib/catalog-health";
import { getRuns } from "@/lib/run-history";
import { PersonaStrip } from "@/components/journey/persona-strip";
import { getIssues, getPersonas, getProject, getProjectSummary } from "@/lib/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ project: string }>;
}): Promise<Metadata> {
  const { project: slug } = await params;
  const project = getProject(slug);
  if (!project) return { title: "Not found" };
  return {
    title: project.name,
    description: project.description ?? project.longDescription,
  };
}

/**
 * The project page: three questions, in the order a reader needs them.
 *
 *   1. What is this, and how was it driven?   — the masthead
 *   2. Can I trust what follows?              — drift, then quality findings
 *   3. What's here?                           — the features, then the runs
 *
 * Stacked sections rather than tabs. Tabs made sense when there were four
 * panels; with two, they hide half the page behind a click for no gain — and
 * the drift and health cards must be read *before* the content they qualify,
 * not alongside it.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project: slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const summary = getProjectSummary(project);
  const catalog = summary.catalog;
  const platform = project.target.platform;
  const issues = getIssues(slug);
  const health = getCatalogHealth(slug, catalog, issues);
  const runs = getRuns(slug);
  const personas = getPersonas(slug, catalog);

  // Mirrors the banner's own early return: it shows findings, or a "checks
  // pass" note when there were steps to check. With neither, it renders null.
  const hasHealthToShow = health.issues.length > 0 || health.totals.steps > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader crumbs={[{ label: project.name }]} />

      <main className="flex-1 above-grain">
        <ProjectHero summary={summary} />

        <div className="mx-auto max-w-[76rem] px-6 py-10">
          {catalog?.synthetic && (
            <SyntheticNotice reason={catalog.syntheticNote} className="mb-6" />
          )}

          <div
            className={`mb-12 grid gap-5 ${hasHealthToShow ? "lg:grid-cols-2" : "grid-cols-1"}`}
          >
            <WhatsNew slug={slug} staleness={summary.staleness} catalog={catalog} />
            {hasHealthToShow && (
              <CatalogHealthBanner
                health={health}
                slug={slug}
                openIssueCount={issues.filter((i) => (i.status ?? "open") === "open").length}
              />
            )}
          </div>

          <PersonaStrip slug={slug} personas={personas} />

          <section aria-label="Features" className="mb-14">
            <h2 className="mb-5 border-b border-rule pb-2.5 font-serif text-head">
              Features
              <span className="ml-2.5 text-title font-sans text-ink-faint nums">
                {health.taxonomy.primaries.length}
              </span>
            </h2>
            <FeatureGrid
              slug={slug}
              platform={platform}
              taxonomy={health.taxonomy}
              surfaces={summary.surfaces}
            />
          </section>

          <section aria-label="Run history">
            <h2 className="mb-5 border-b border-rule pb-2.5 font-serif text-head">
              Runs
              <span className="ml-2.5 text-title font-sans text-ink-faint nums">
                {runs.length}
              </span>
            </h2>
            <RunLog runs={runs} />
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
