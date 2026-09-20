"use client";

/**
 * The panel that opens when you pick an app off the chart.
 *
 * It overlays the chart from the right rather than replacing it, so the star
 * you clicked stays visible and the chart keeps its role as the thing you are
 * navigating. Everything in here is a summary with a way out — the panel
 * answers "what is this app and who uses it", and hands off to the project
 * page for anything deeper.
 *
 * The personas are the reason this panel exists. A features table can live on
 * a project page; a row of faces cannot be summarised in a number, and it is
 * the fastest honest answer to "what is this app for".
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Film, X } from "lucide-react";
import type { ConstellationNode, PersonaSummary, ProjectSummary } from "@/lib/types";
import { PLATFORM_PROFILES } from "@/lib/platforms";
import { StalenessPill } from "@/components/status";

export function AppPanel({
  summary,
  node,
  personas,
  onClose,
}: {
  summary: ProjectSummary;
  node: ConstellationNode;
  personas: PersonaSummary[];
  onClose: () => void;
}) {
  const { project } = summary;

  return (
    <aside
      className="absolute inset-y-0 right-0 z-10 w-full max-w-[420px] overflow-y-auto border-l border-rule bg-paper-raised shadow-plate"
      aria-label={`${project.name} summary`}
    >
      <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-rule bg-paper-raised px-6 py-5">
        <div className="min-w-0">
          <p className="eyebrow">{project.tag ?? "App"}</p>
          <h2 className="mt-1 truncate font-serif text-head-lg leading-tight">{project.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded p-1.5 text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
        >
          <X className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <div className="space-y-7 px-6 py-6">
        {/* Where it lives on the chart, spelled out. A bridge line between two
            territories is suggestive; the words are unambiguous. */}
        <div className="flex flex-wrap items-center gap-2">
          {node.platforms.map((platform) => (
            <span
              key={platform}
              className="rounded border border-rule bg-paper px-2 py-1 font-mono text-micro tracking-wide text-ink-muted"
            >
              {PLATFORM_PROFILES[platform].short}
            </span>
          ))}
          <StalenessPill staleness={summary.staleness} />
        </div>

        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded border border-rule bg-rule">
          <Stat label="Walked" value={`${node.walkedCount}/${node.featureCount}`} />
          <Stat label="Captures" value={summary.screenshotCount} />
          <Stat label="Personas" value={personas.length} />
        </dl>

        {personas.length > 0 ? (
          <section>
            <h3 className="eyebrow">Who uses it</h3>
            <ul className="mt-3 space-y-2">
              {personas.map((persona) => (
                <li key={persona.id}>
                  <Link
                    href={`/${project.slug}/personas/${persona.id}`}
                    className="group flex items-center gap-3 rounded border border-rule bg-paper p-3 transition-colors hover:border-rule-strong hover:bg-paper-sunken"
                  >
                    <PersonaAvatar persona={persona} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-serif text-title leading-tight">{persona.name}</p>
                      <p className="mt-0.5 font-mono text-micro text-ink-muted">
                        {persona.journeyCount === 0
                          ? "no journey walked"
                          : `${persona.journeyCount} ${
                              persona.journeyCount === 1 ? "journey" : "journeys"
                            } · ${persona.sceneCount} scenes`}
                      </p>
                    </div>
                    {persona.hasStory && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand/25 bg-brand-wash px-2 py-0.5 text-micro font-medium text-brand-deep">
                        <Film className="size-3" strokeWidth={1.75} aria-hidden />
                        Story video
                      </span>
                    )}
                    <ArrowRight
                      className="size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section>
            <h3 className="eyebrow">Who uses it</h3>
            <p className="mt-2 text-small text-ink-muted">
              No personas defined. Personas are declared in{" "}
              <code className="font-mono text-label">catalog.json</code> and walked as journeys —
              until one is, this app is documented as features only.
            </p>
          </section>
        )}

        <Link
          href={`/${project.slug}`}
          className="flex items-center justify-between rounded border border-ink bg-ink px-4 py-3 text-paper transition-colors hover:bg-ink/90"
        >
          <span className="text-body">Open the full record</span>
          <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-paper px-3 py-2.5">
      <dt className="font-mono text-micro tracking-wide text-ink-faint">{label}</dt>
      <dd className="nums mt-0.5 font-serif text-title text-ink">{value}</dd>
    </div>
  );
}

/**
 * A persona's face, or their initial.
 *
 * The fallback is typographic rather than a generic silhouette icon: a stock
 * avatar implies a person we have no picture of, whereas a set initial reads
 * as a label and doesn't pretend to be a portrait.
 */
function PersonaAvatar({ persona }: { persona: PersonaSummary }) {
  if (!persona.portrait) {
    return (
      <span className="grid size-11 shrink-0 place-items-center rounded-full border border-rule bg-paper-sunken font-mono text-label text-ink-muted">
        {persona.name.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <span className="relative size-11 shrink-0 overflow-hidden rounded-full border border-rule">
      <Image
        src={persona.portrait}
        alt={persona.name}
        fill
        sizes="44px"
        className="object-cover object-top"
      />
    </span>
  );
}
