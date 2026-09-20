"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Maximize2 } from "lucide-react";
import { Prose } from "@/components/prose";
import { SurfaceFrame } from "@/components/surface-frame";
import { Lightbox } from "@/components/lightbox";
import { isHandheld } from "@/lib/surfaces";
import type { Surface, Walkthrough } from "@/lib/types";

/** "Desktop 1440×900" — the caption the lightbox shows per frame. */
function cellLabel(surface: Surface): string {
  return `${surface.label} ${surface.width}×${surface.height}`;
}

/**
 * The same moment, on every surface, side by side.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * The viewer showed one surface at a time behind a tab switcher, which means a
 * reader could see the desktop layout and could see the mobile layout and could
 * never see the *relationship* between them. That is the thing anyone actually
 * wants from "is this responsive?" — what collapsed, what got dropped, what
 * moved below the fold — and it was the one view the hub could not produce.
 *
 * It is also the view that makes a responsive bug undeniable. One target app
 * rendered zoomed out on a phone; a mobile capture on its own
 * looked like an ordinary narrow render, and the two side by side would have
 * shown the type at half the relative size immediately.
 *
 * ── Matching steps across surfaces ────────────────────────────────────────
 *
 * Surfaces do not always walk the same steps: a filter that is one click on a
 * desktop table might be behind a menu on a phone, and a step can legitimately
 * be skipped on one surface when nothing changed there. So steps are paired by
 * title first and by position only as a fallback, and a surface with no
 * matching step renders an explicit gap rather than a silently shifted image.
 */
export function ResponsiveCompare({
  slug,
  walkthroughs,
  surfaces,
  featureName,
}: {
  slug: string;
  walkthroughs: Record<string, Walkthrough>;
  surfaces: Surface[];
  featureName: string;
}) {
  const [lightbox, setLightbox] = useState<{ srcs: string[]; labels: string[]; index: number } | null>(null);

  /** One row per moment, carrying whichever surfaces captured it. */
  const rows = useMemo(() => {
    const primary = walkthroughs[surfaces[0].id];
    if (!primary) return [];

    return primary.steps.map((step, index) => {
      const cells = surfaces.map((s) => {
        const steps = walkthroughs[s.id]?.steps ?? [];
        // Title first: it survives a surface skipping a step, which index
        // matching does not — one skipped step would shift every later pairing
        // by one and quietly compare unrelated screens.
        const byTitle = steps.find(
          (candidate) => candidate.title.trim().toLowerCase() === step.title.trim().toLowerCase(),
        );
        return { surface: s, step: byTitle ?? steps[index] ?? null, matchedByTitle: Boolean(byTitle) };
      });
      return { key: step.stepNumber, step, cells };
    });
  }, [walkthroughs, surfaces]);

  if (rows.length === 0) return null;

  const openLightbox = (srcs: string[], labels: string[], index: number) =>
    setLightbox({ srcs, labels, index });

  return (
    <div className="space-y-12">
      {rows.map((row) => {
        const present = row.cells.filter((c) => c.step?.screenshotFilename);
        const srcs = present.map((c) => `/walkthroughs/${slug}/${c.step!.screenshotFilename}`);
        const labels = present.map((c) => `${cellLabel(c.surface)} — ${row.step.title}`);

        return (
          <section key={row.key} id={`compare-step-${row.key}`} className="scroll-mt-24">
            <div className="mb-4 max-w-[68ch]">
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-micro text-ink-faint nums">
                  {String(row.step.stepNumber).padStart(2, "0")}
                </span>
                <h3 className="font-serif text-title leading-tight text-ink">{row.step.title}</h3>
              </div>
              {row.step.action && (
                <p className="mt-2 border-l-2 border-rule-strong pl-3 text-small italic text-ink-muted">
                  {row.step.action}
                </p>
              )}
              <Prose className="mt-2 text-small">{row.step.description}</Prose>
            </div>

            {/* Captures sit on a shared baseline so the eye compares layout
                rather than chrome. Each keeps its own true aspect ratio — the
                whole point is that a phone is a different shape, so squeezing
                them to a common box would hide the thing being examined. */}
            <div className="flex flex-wrap items-start gap-6">
              {row.cells.map((cell) => {
                const shot = cell.step?.screenshotFilename;
                const widthClass = isHandheld(cell.surface) ? "w-[200px]" : "w-[min(520px,100%)]";
                return (
                  <figure key={cell.surface.id} className={`${widthClass} shrink-0`}>
                    <figcaption className="mb-2 flex items-baseline gap-2">
                      <span className="text-label font-medium text-ink">{cell.surface.label}</span>
                      <span className="font-mono text-micro text-ink-faint nums">
                        {cell.surface.width}×{cell.surface.height}
                      </span>
                    </figcaption>

                    {shot ? (
                      <div className="group relative">
                        <SurfaceFrame surface={cell.surface} location={cell.step!.location}>
                          <button
                            type="button"
                            onClick={() =>
                              openLightbox(
                                srcs,
                                labels,
                                Math.max(
                                  0,
                                  present.findIndex((c) => c.surface.id === cell.surface.id),
                                ),
                              )
                            }
                            className="absolute inset-0 z-[5] cursor-zoom-in"
                            aria-label={`Enlarge ${cell.surface.label} capture for ${row.step.title}`}
                          />
                          <Image
                            src={`/walkthroughs/${slug}/${shot}`}
                            alt={
                              cell.step!.screenshotAlt ??
                              `${featureName} on ${cell.surface.label} — ${row.step.title}`
                            }
                            fill
                            sizes="(max-width: 640px) 100vw, 520px"
                            className="object-cover object-top"
                          />
                        </SurfaceFrame>
                        <span
                          aria-hidden
                          className="pointer-events-none absolute right-2 top-2 z-10 rounded-sm border border-rule bg-paper/90 p-1 opacity-70 transition-opacity group-hover:opacity-100"
                        >
                          <Maximize2 className="size-3 text-ink-muted" />
                        </span>
                      </div>
                    ) : (
                      /* Said out loud rather than left blank. An empty cell in a
                         comparison reads as "this surface is broken"; the real
                         meaning is usually "nothing changed here, so the walk
                         didn't claim a step it couldn't back up". */
                      <div className="mat grid h-40 place-items-center rounded-sm px-4 text-center">
                        <p className="text-label text-ink-faint">
                          Not captured on {cell.surface.label}
                        </p>
                      </div>
                    )}

                    {cell.step && !cell.matchedByTitle && (
                      <p className="mt-1.5 text-micro text-ink-faint">
                        matched by position — this surface titles the step “{cell.step.title}”
                      </p>
                    )}
                  </figure>
                );
              })}
            </div>
          </section>
        );
      })}

      {lightbox && (
        <Lightbox
          srcs={lightbox.srcs}
          labels={lightbox.labels}
          index={lightbox.index}
          title={featureName}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox((l) => (l ? { ...l, index } : null))}
        />
      )}
    </div>
  );
}
