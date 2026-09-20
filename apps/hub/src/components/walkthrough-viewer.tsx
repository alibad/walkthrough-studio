"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Columns2, Info, Lightbulb, Maximize2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Prose } from "@/components/prose";
import { SurfaceFrame } from "@/components/surface-frame";
import { VerificationBadge } from "@/components/status";
import { Lightbox } from "@/components/lightbox";
import { ResponsiveCompare } from "@/components/responsive-compare";
import { StoryPlayer } from "@/components/journey/story-player";
import { formatLocation } from "@/lib/platforms";
import { isHandheld } from "@/lib/surfaces";
import type {
  Platform,
  StepAnnotation,
  Surface,
  Walkthrough,
  WalkthroughStep,
} from "@/lib/types";

/**
 * The walkthrough reader.
 *
 * Layout logic worth knowing before editing:
 *
 *  - **Handheld surfaces get a side-by-side layout, wide ones get stacked.**
 *    A 393×852 capture next to its prose uses the page well; the same capture
 *    above its prose wastes two thirds of the width. A 1440×900 capture is the
 *    opposite. `isHandheld()` picks, rather than a media query, because the
 *    right answer depends on the artefact and not the reader's window.
 *
 *  - **Surfaces are a *switcher*, not separate pages.** The same feature on
 *    desktop and on mobile is one document with two sets of captures. Giving
 *    each its own route would double the URLs for one feature and make
 *    linking ambiguous.
 *
 *  - **The step rail is generated from the steps, not hand-maintained.** It's
 *    a table of contents for a document whose length varies from 2 to 30.
 */
export function WalkthroughViewer({
  slug,
  platform,
  walkthroughs,
  surfaces,
  featureName,
}: {
  slug: string;
  platform: Platform;
  /** Keyed by surface id. At least one entry. */
  walkthroughs: Record<string, Walkthrough>;
  /** Only the surfaces that actually have a walkthrough, in display order. */
  surfaces: Surface[];
  featureName: string;
}) {
  const [surfaceId, setSurfaceId] = useState(surfaces[0]?.id);
  const surface = surfaces.find((s) => s.id === surfaceId) ?? surfaces[0];
  const walkthrough = surface ? walkthroughs[surface.id] : undefined;
  const primaryVideo = walkthrough?.steps.find((step) => step.videoFilename)?.videoFilename;

  const [lightbox, setLightbox] = useState<{ files: string[]; index: number } | null>(null);
  /* "Compare" is only meaningful with something to compare against, so the
     control appears at two surfaces and not before. */
  const canCompare = surfaces.length > 1;
  const [compare, setCompare] = useState(false);

  if (!surface || !walkthrough) {
    return (
      <p className="py-16 text-center text-small text-ink-muted">
        No walkthrough captured for this feature yet.
      </p>
    );
  }

  return (
    <div>
      {/* Surface switcher */}
      {surfaces.length > 1 && (
        <div
          role="tablist"
          aria-label="Capture surface"
          className="mb-7 flex flex-wrap items-center gap-1"
        >
          {surfaces.map((s) => {
            const isActive = s.id === surface.id;
            const steps = walkthroughs[s.id]?.steps.length ?? 0;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSurfaceId(s.id)}
                className={cn(
                  "inline-flex items-baseline gap-1.5 rounded-sm border px-2.5 py-1 text-label font-medium transition-colors",
                  isActive
                    ? "border-ink bg-ink text-paper"
                    : "border-rule bg-paper-raised text-ink-muted hover:border-rule-strong hover:text-ink",
                )}
              >
                {s.label}
                <span className="text-micro opacity-60 nums">
                  {s.width}×{s.height}
                </span>
                {steps > 0 && (
                  <span className="text-micro opacity-50 nums">· {steps}</span>
                )}
              </button>
            );
          })}

          {canCompare && (
            <button
              type="button"
              onClick={() => setCompare((c) => !c)}
              aria-pressed={compare}
              className={cn(
                "ml-2 inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-label font-medium transition-colors",
                compare
                  ? "border-ink bg-ink text-paper"
                  : "border-rule bg-paper-raised text-ink-muted hover:border-rule-strong hover:text-ink",
              )}
            >
              <Columns2 className="size-3.5" strokeWidth={1.75} aria-hidden />
              Compare surfaces
            </button>
          )}
        </div>
      )}

      {/* Every surface, one moment at a time. The tabs above answer "what does
          this look like on a phone"; this answers "what changed between them",
          which is the question a reader actually has about responsiveness. */}
      {compare && (
        <ResponsiveCompare
          slug={slug}
          walkthroughs={walkthroughs}
          surfaces={surfaces}
          featureName={featureName}
        />
      )}

      {/* Overview */}
      <div className={cn("mb-10 grid gap-8 lg:grid-cols-[1fr_16rem]", compare && "hidden")}>
        <div>
          {walkthrough.headline && (
            <h2 className="display mb-3 text-head max-w-[34ch]">{walkthrough.headline}</h2>
          )}
          <Prose className="max-w-[64ch] text-body">{walkthrough.overview}</Prose>

          {walkthrough.note && (
            <div className="mt-4 flex items-start gap-2.5 rounded-sm border border-note/25 bg-note-wash px-3 py-2.5 text-small text-note">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <Prose className="text-small [&_*]:text-note">{walkthrough.note}</Prose>
            </div>
          )}

          {primaryVideo && (
            <div className="mt-5 max-w-[32rem]">
              <StoryPlayer
                src={`/walkthroughs/${slug}/${primaryVideo}`}
                title={`${featureName} — recorded walkthrough`}
                kind="recording"
                variant="card"
                label="Play the recorded walkthrough"
                detail="Watch the captured interaction from start to finish"
              />
            </div>
          )}
        </div>

        {/* Step rail */}
        <nav aria-label="Steps" className="lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow mb-2.5">
            {walkthrough.steps.length}{" "}
            {walkthrough.steps.length === 1 ? "step" : "steps"}
          </p>
          <ol className="space-y-px">
            {walkthrough.steps.map((step) => (
              <li key={step.stepNumber}>
                <a
                  href={`#step-${step.stepNumber}`}
                  className="group flex items-baseline gap-2.5 rounded-sm px-2 py-1.5 text-small text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
                >
                  <span className="w-4 shrink-0 text-right font-mono text-micro text-ink-faint nums">
                    {step.stepNumber}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">{step.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* Steps */}
      <ol className={cn("space-y-14", compare && "hidden")}>
        {walkthrough.steps.map((step) => (
          <li key={step.stepNumber}>
            <Step
              slug={slug}
              platform={platform}
              surface={surface}
              step={step}
              featureName={featureName}
              onOpen={(files, index) => setLightbox({ files, index })}
            />
          </li>
        ))}
      </ol>

      {/* Closing notes */}
      {((walkthrough.keyFeatures?.length ?? 0) > 0 ||
        (walkthrough.tips?.length ?? 0) > 0 ||
        (walkthrough.personaInsights?.length ?? 0) > 0) && (
        <div className="mt-16 grid gap-8 border-t border-rule pt-8 md:grid-cols-2">
          {(walkthrough.keyFeatures?.length ?? 0) > 0 && (
            <NoteList title="What this feature does" items={walkthrough.keyFeatures!} />
          )}
          {(walkthrough.tips?.length ?? 0) > 0 && (
            <NoteList title="Worth knowing" items={walkthrough.tips!} />
          )}
          {(walkthrough.personaInsights?.length ?? 0) > 0 && (
            <NoteList
              title="From the persona's side"
              items={walkthrough.personaInsights!}
            />
          )}
        </div>
      )}

      {lightbox && (
        <Lightbox
          srcs={lightbox.files.map((f) => `/walkthroughs/${slug}/${f}`)}
          index={lightbox.index}
          title={featureName}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox((l) => (l ? { ...l, index } : null))}
        />
      )}
    </div>
  );
}

// ── One step ────────────────────────────────────────────────────────────────

function Step({
  slug,
  platform,
  surface,
  step,
  featureName,
  onOpen,
}: {
  slug: string;
  platform: Platform;
  surface: Surface;
  step: WalkthroughStep;
  featureName: string;
  onOpen: (files: string[], index: number) => void;
}) {
  const frames = useMemo(
    () => [step.screenshotFilename, ...(step.screenshotFrames ?? [])].filter(Boolean),
    [step.screenshotFilename, step.screenshotFrames],
  );
  const [frame, setFrame] = useState(0);
  const sideBySide = isHandheld(surface);

  const caption = step.frameCaptions?.[frame];

  const copy = (
    <div className={cn(sideBySide ? "min-w-0 flex-1" : "max-w-[64ch]")}>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-label text-brand nums">
          {String(step.stepNumber).padStart(2, "0")}
        </span>
        <h3 className="font-serif text-title leading-snug">{step.title}</h3>
      </div>

      {/* The interaction that produced this state. Set apart from the
          description because it's the *evidence* the step advanced, not prose
          about it. */}
      {step.action && (
        <p className="mt-2.5 border-l-2 border-rule-strong pl-3 text-small italic text-ink-muted">
          {step.action}
        </p>
      )}

      <Prose className="mt-3 text-body">{step.description}</Prose>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {step.location && (
          <span className="locator">{formatLocation(step.location, platform)}</span>
        )}
        <VerificationBadge status={step.verificationStatus} />
      </div>

      {(step.annotations?.length ?? 0) > 0 && (
        <ul className="mt-4 space-y-2">
          {step.annotations!.map((annotation, i) => (
            <li key={i}>
              <Annotation annotation={annotation} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const media = (
    /* Hand-held surfaces already land in the side-by-side column, which caps
       them at 16rem — about 555px tall for a 393x852 phone. The tall-image
       problem lives in the journey scene layout, not here. */
    <div className={cn(sideBySide ? "w-full max-w-[16rem] shrink-0" : "mt-5")}>
      <div className="group relative">
        <SurfaceFrame surface={surface} location={step.location}>
          <button
            type="button"
            onClick={() => onOpen(frames, frame)}
            className="absolute inset-0 z-[5] cursor-zoom-in"
            aria-label={`Enlarge capture for step ${step.stepNumber}: ${step.title}`}
          />
          <Image
            src={`/walkthroughs/${slug}/${frames[frame]}`}
            alt={step.screenshotAlt ?? `${featureName} — ${step.title}`}
            fill
            sizes={sideBySide ? "256px" : "(max-width: 1024px) 100vw, 820px"}
            className="object-cover object-top"
          />
        </SurfaceFrame>

        <span
          aria-hidden
          /* Always visible, not hover-only: on a hand-held capture the image is
             deliberately shown smaller than life, so the way back to full size
             has to be discoverable without hunting for it. */
          className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 rounded-sm border border-rule bg-paper/90 px-1.5 py-1 text-[0.6875rem] text-ink-muted opacity-70 transition-opacity group-hover:opacity-100"
        >
          <Maximize2 className="size-3 text-ink-muted" />
          <span className="hidden sm:inline">Full size</span>
        </span>
      </div>

      {/* Frame slider for multi-state steps. */}
      {frames.length > 1 && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {frames.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setFrame(i)}
                aria-label={`Frame ${i + 1} of ${frames.length}`}
                aria-current={i === frame}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === frame ? "w-5 bg-brand" : "w-1.5 bg-rule-strong hover:bg-ink-faint",
                )}
              />
            ))}
          </div>
          <span className="text-micro text-ink-faint nums">
            {frame + 1}/{frames.length}
          </span>
        </div>
      )}

      {caption && <p className="mt-2 text-micro leading-relaxed text-ink-faint">{caption}</p>}

      {step.videoFilename && (
        <StoryPlayer
          src={`/walkthroughs/${slug}/${step.videoFilename}`}
          title={`${featureName} — ${step.title}`}
          kind="recording"
          variant="card"
          className="mt-3"
          label="Play this recorded interaction"
          detail="Unedited screen recording · opens here"
        />
      )}
    </div>
  );

  return (
    <article id={`step-${step.stepNumber}`} className="scroll-mt-24">
      {sideBySide ? (
        <div className="flex flex-col gap-7 sm:flex-row sm:items-start sm:gap-9">
          {copy}
          {media}
        </div>
      ) : (
        <>
          {copy}
          {media}
        </>
      )}
    </article>
  );
}

// ── Annotations ─────────────────────────────────────────────────────────────

const ANNOTATION_STYLE = {
  tip: { icon: Lightbulb, className: "border-note/25 bg-note-wash text-note" },
  warning: { icon: TriangleAlert, className: "border-warn/25 bg-warn-wash text-warn" },
  important: { icon: Info, className: "border-brand/25 bg-brand-wash text-brand-deep" },
} as const;

function Annotation({ annotation }: { annotation: StepAnnotation }) {
  const style = ANNOTATION_STYLE[annotation.type] ?? ANNOTATION_STYLE.tip;
  const Icon = style.icon;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-sm border px-3 py-2 text-small",
        style.className,
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="leading-relaxed">{annotation.text}</span>
    </div>
  );
}

function NoteList({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="eyebrow mb-3">{title}</h3>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-small">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-brand" />
            <Prose inline className="text-small">
              {item}
            </Prose>
          </li>
        ))}
      </ul>
    </section>
  );
}
