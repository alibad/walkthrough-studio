import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { JourneyReader } from "@/components/journey/journey-reader";
import { StoryPlayer } from "@/components/journey/story-player";
import { Prose } from "@/components/prose";
import { plainText } from "@/lib/utils";
import { PlatformBadge } from "@/components/platform-badge";
import { getCatalog, getJourney, getPersonaDetail, getProject } from "@/lib/data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ project: string; persona: string; journey: string }>;
}): Promise<Metadata> {
  const { project: slug, persona: personaId, journey: journeyId } = await params;
  const journey = getJourney(slug, personaId, journeyId);
  if (!journey) return { title: "Not found" };
  return { title: journey.headline, description: plainText(journey.overview) };
}

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ project: string; persona: string; journey: string }>;
}) {
  const { project: slug, persona: personaId, journey: journeyId } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const persona = getPersonaDetail(slug, personaId);
  const journey = getJourney(slug, personaId, journeyId);
  if (!persona || !journey) notFound();

  const catalog = getCatalog(slug);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <header className="mx-auto max-w-[1180px] px-6 pb-8 pt-8">
          <Link
            href={`/${slug}/personas/${personaId}`}
            className="inline-flex items-center gap-1.5 font-mono text-micro tracking-wide text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3" strokeWidth={2} aria-hidden />
            {persona.name}
          </Link>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0 flex-1">
              <p className="eyebrow">{persona.authRole ?? "Journey"}</p>
              <h1 className="display mt-1.5 max-w-[24ch] text-balance">{journey.headline}</h1>
            </div>
            {/* Both, when both exist — they are not alternatives.
             *
             * The story is an assembled film with a synthetic voice; the
             * recording is what the browser actually did, silent and uncut.
             * Offering only the produced one would hide the evidence behind
             * the narration, which is the wrong way round for this project. */}
            {journey.storyVideo && (
              <StoryPlayer src={journey.storyVideo} title={journey.headline} />
            )}
            {journey.walkRecording && (
              <StoryPlayer
                src={journey.walkRecording}
                title={journey.headline}
                kind="recording"
              />
            )}
          </div>

          <Prose className="prose-walkthrough mt-4 max-w-[62ch] text-body">
            {journey.overview}
          </Prose>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <PlatformBadge platform={journey.platform} />
            <span className="nums font-mono text-micro text-ink-muted">
              {journey.scenes.length} scenes
            </span>
            {journey.capturedAt && (
              <span className="font-mono text-micro text-ink-faint">
                walked {new Date(journey.capturedAt).toISOString().slice(0, 10)}
              </span>
            )}
          </div>
        </header>

        <div className="border-y border-rule">
          <JourneyReader journey={journey} surfaces={catalog?.surfaces} />
        </div>

        {journey.payoff && (
          <section className="mx-auto max-w-[62ch] px-6 py-14 text-center">
            <p className="eyebrow">The payoff</p>
            <p className="mt-3 font-serif text-head-lg leading-snug text-balance">
              {journey.payoff}
            </p>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
