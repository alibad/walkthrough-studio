/**
 * The personas on a project page.
 *
 * Sits above Features, not below, and that order is the argument: a feature
 * list tells you what the software has, a persona tells you who it is for,
 * and the second is the better first question. It was the thing the old hub
 * led with and the thing worth bringing back.
 *
 * Renders nothing when a project has no personas. An empty "Personas (0)"
 * heading is a reproach rather than information — the catalog health report is
 * where absent coverage belongs.
 */

import Image from "next/image";
import Link from "next/link";
import { Film } from "lucide-react";
import type { PersonaSummary } from "@/lib/types";
import { plainText } from "@/lib/utils";

export function PersonaStrip({
  slug,
  personas,
}: {
  slug: string;
  personas: PersonaSummary[];
}) {
  if (personas.length === 0) return null;

  return (
    <section aria-label="Personas" className="mb-14">
      <h2 className="mb-5 border-b border-rule pb-2.5 font-serif text-head">
        Personas
        <span className="nums ml-2.5 font-sans text-title text-ink-faint">{personas.length}</span>
      </h2>

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {personas.map((persona) => (
          <li key={persona.id}>
            <Link
              href={`/${slug}/personas/${persona.id}`}
              className="group flex h-full flex-col overflow-hidden rounded border border-rule bg-paper-raised transition-colors hover:border-rule-strong"
            >
              {/* The scene-setter is the card's face when it exists. It says
                  more about who the persona is than a cropped portrait does,
                  and it gives the grid its texture. */}
              <div className="relative aspect-[3/2] w-full overflow-hidden bg-paper-sunken">
                {persona.scene ? (
                  <Image
                    src={persona.scene}
                    alt={`${persona.name} in their setting`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
                    className="object-cover object-[50%_35%] transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                ) : persona.portrait ? (
                  <Image
                    src={persona.portrait}
                    alt={persona.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 360px"
                    className="object-cover object-top"
                  />
                ) : (
                  <span className="grid size-full place-items-center font-serif text-display text-ink-faint">
                    {persona.name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                {persona.hasStory && (
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full border border-rule bg-paper/90 px-2 py-0.5 font-mono text-micro text-ink backdrop-blur">
                    <Film className="size-3" strokeWidth={2} aria-hidden />
                    story
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col p-4">
                {persona.authRole && <p className="eyebrow">{persona.authRole}</p>}
                <h3 className="mt-1 font-serif text-title leading-tight">{persona.name}</h3>
                {/* Stripped, not rendered through `<Prose>`: this is a
                    three-line clamped teaser, and Prose emits block children
                    that `line-clamp` can't clamp. The full description is
                    rendered properly on the persona's own page. */}
                <p className="mt-1.5 line-clamp-3 flex-1 text-small text-ink-muted">
                  {plainText(persona.description)}
                </p>
                <p className="nums mt-3 font-mono text-micro text-ink-faint">
                  {persona.journeyCount === 0
                    ? "no journey walked"
                    : `${persona.journeyCount} ${
                        persona.journeyCount === 1 ? "journey" : "journeys"
                      } · ${persona.sceneCount} scenes`}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
