import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { PersonaMasthead } from "@/components/journey/persona-masthead";
import { StoryPlayer } from "@/components/journey/story-player";
import { Prose } from "@/components/prose";
import { plainText } from "@/lib/utils";
import { PlatformBadge } from "@/components/platform-badge";
import { getCatalog, getPersonaDetail, getProject } from "@/lib/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ project: string; persona: string }>;
}): Promise<Metadata> {
  const { project: slug, persona: personaId } = await params;
  const project = getProject(slug);
  const persona = project ? getPersonaDetail(slug, personaId) : null;
  if (!project || !persona) return { title: "Not found" };
  return {
    title: `${persona.name} · ${project.name}`,
    description: plainText(persona.description),
  };
}

/**
 * A persona and the journeys walked for them.
 *
 * The journey list is the page's content, not a sidebar: a persona with no
 * journey is a claim without evidence, and the page says so plainly rather
 * than rendering an empty shell that looks like a loading state.
 */
export default async function PersonaPage({
  params,
}: {
  params: Promise<{ project: string; persona: string }>;
}) {
  const { project: slug, persona: personaId } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const persona = getPersonaDetail(slug, personaId);
  if (!persona) notFound();

  const catalog = getCatalog(slug);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <PersonaMasthead project={project} persona={persona} />

        <div className="mx-auto max-w-[1180px] px-6 pb-20">
          <div className="rule-h" />

          {persona.journeys.length === 0 ? (
            <section className="py-12">
              <p className="eyebrow">No journey walked</p>
              <h2 className="mt-2 font-serif text-head">
                This persona is declared, not demonstrated
              </h2>
              <p className="mt-3 max-w-[62ch] text-body text-ink-muted">
                {persona.name} exists in{" "}
                <code className="font-mono text-label">catalog.json</code>, but no journey has been
                captured for them. Until one is, the only honest claim is that someone thought this
                role mattered — not that the product serves it.
              </p>
            </section>
          ) : (
            <section className="py-10">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="eyebrow">
                  {persona.journeys.length}{" "}
                  {persona.journeys.length === 1 ? "journey" : "journeys"}
                </h2>
                <span className="nums font-mono text-micro text-ink-faint">
                  {persona.sceneCount} scenes
                </span>
              </div>

              <ul className="mt-5 space-y-5">
                {persona.journeys.map((journey) => (
                  <li
                    key={journey.journeyId}
                    className="rounded border border-rule bg-paper-raised p-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-serif text-head leading-tight text-balance">
                          {journey.headline}
                        </h3>
                        <Prose className="prose-walkthrough mt-2 max-w-[62ch] text-body">
                          {journey.overview}
                        </Prose>
                        {journey.payoff && (
                          <p className="mt-3 border-l-2 border-brand pl-3 text-body text-ink">
                            {journey.payoff}
                          </p>
                        )}
                      </div>
                      {journey.storyVideo && (
                        <StoryPlayer src={journey.storyVideo} title={journey.headline} />
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <PlatformBadge platform={journey.platform} />
                        <span className="nums font-mono text-micro text-ink-muted">
                          {journey.scenes.length} scenes
                        </span>
                        {journey.moments && journey.moments.length > 0 && (
                          <span className="nums font-mono text-micro text-ink-faint">
                            {journey.moments.length} illustrated
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/${slug}/personas/${personaId}/journeys/${journey.journeyId}`}
                        className="group flex items-center gap-1.5 text-body text-ink underline decoration-rule-strong underline-offset-4 transition-colors hover:decoration-ink"
                      >
                        Read the journey
                        <ArrowRight
                          className="size-3.5 transition-transform group-hover:translate-x-0.5"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(catalog?.personas?.length ?? 0) > 1 && (
            <section className="border-t border-rule py-8">
              <h2 className="eyebrow">Other personas</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {(catalog?.personas ?? [])
                  .filter((p) => p.id !== personaId)
                  .map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/${slug}/personas/${p.id}`}
                        className="rounded border border-rule bg-paper px-3 py-1.5 text-label text-ink-muted transition-colors hover:border-rule-strong hover:text-ink"
                      >
                        {p.name}
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
