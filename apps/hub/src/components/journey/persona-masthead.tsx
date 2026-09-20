/**
 * The persona masthead.
 *
 * Leads with the scene-setter — a wide illustration of the persona in their
 * physical setting — rather than with a screenshot, because the first thing a
 * reader needs is *who this is*, and a screenshot of a settings page answers
 * a different question.
 *
 * Both images are generated, and both say so. See `moment.tsx` for the
 * reasoning; the same rule applies here and for the same reason.
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { PersonaDetail, Project } from "@/lib/types";
import { Prose } from "@/components/prose";

export function PersonaMasthead({
  project,
  persona,
}: {
  project: Project;
  persona: PersonaDetail;
}) {
  return (
    <header>
      {persona.scene && (
        /* 5:2, not 3:1. The plate is generated at 3:2 (1400×933), and a 3:1
           band throws away two thirds of a composition that was framed as a
           whole — then upscales the surviving strip past its native width,
           which turns stipple into grey mush. 5:2 is the widest crop the
           source can fill at 1:1 pixels on a 1400px-wide container. */
        <div className="relative mx-auto aspect-[5/2] w-full max-w-[1400px] overflow-hidden border-b border-rule">
          <Image
            src={persona.scene}
            alt={`${persona.name} in their setting`}
            fill
            sizes="(max-width: 1400px) 100vw, 1400px"
            priority
            className="object-cover object-[50%_35%]"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, var(--paper) 0%, color-mix(in srgb, var(--paper) 55%, transparent) 20%, transparent 55%)",
            }}
          />
          <p className="absolute bottom-3 right-4 font-mono text-micro tracking-wide text-ink-faint">
            illustration
          </p>
        </div>
      )}

      <div className="mx-auto max-w-[1180px] px-6 pb-8 pt-6">
        <Link
          href={`/${project.slug}`}
          className="inline-flex items-center gap-1.5 font-mono text-micro tracking-wide text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3" strokeWidth={2} aria-hidden />
          {project.name}
        </Link>

        <div className="mt-5 flex flex-wrap items-start gap-6">
          {persona.portrait && (
            <div className="relative size-24 shrink-0 overflow-hidden rounded-full border border-rule">
              <Image
                src={persona.portrait}
                alt={persona.name}
                fill
                sizes="96px"
                className="object-cover object-top"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{persona.authRole ?? "Persona"}</p>
            <h1 className="display mt-1.5 text-balance">{persona.name}</h1>
            <Prose className="prose-walkthrough mt-3 max-w-[62ch] text-body">
              {persona.description}
            </Prose>
            {persona.entryPoint && (
              <p className="mt-3 flex flex-wrap items-baseline gap-2 text-small text-ink-muted">
                <span>Enters at</span>
                <code className="truncate-start rounded bg-paper-sunken px-2 py-0.5 font-mono text-micro text-ink">
                  {persona.entryPoint}
                </code>
              </p>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
