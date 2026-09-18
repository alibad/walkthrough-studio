"use client";

/**
 * One scene of a journey.
 *
 * A feature walkthrough is a list of steps and reads correctly as a list. A
 * journey is a story about a person, and a story told as a uniform column of
 * screenshot-then-paragraph flattens into a UI inventory no matter how good
 * the writing is. So scenes alternate framing.
 *
 * Four layouts, and the choice is editorial rather than semantic:
 *
 *   full-bleed   the capture is the point — an arrival, a payoff
 *   split-left   narrative leads, capture supports
 *   split-right  capture leads, narrative explains
 *   inset        the narrative is the point and the capture is evidence
 *
 * When `layout` is unset the renderer applies a deterministic cycle by index,
 * so a journey whose author never thought about layout still reads as though
 * someone laid it out — and re-rendering never reshuffles it.
 */

import Image from "next/image";
import { useState } from "react";
import { Maximize2, Play } from "lucide-react";
import type { JourneyScene, JourneySceneLayout, Surface } from "@/lib/types";
import { SurfaceFrame } from "@/components/surface-frame";
import { VerificationBadge } from "@/components/status";
import { Prose } from "@/components/prose";
import { cn } from "@/lib/utils";

/**
 * The fallback cycle. Deliberately not `index % 4` over all four layouts:
 * full-bleed twice in five scenes gives a long journey two moments of
 * emphasis, which is about the right rhythm, and the pattern is long enough
 * (5) that it doesn't visibly repeat against the usual 5–9 scene journey.
 */
const LAYOUT_CYCLE: JourneySceneLayout[] = [
  "full-bleed",
  "split-left",
  "inset",
  "split-right",
  "full-bleed",
];

export function Scene({
  scene,
  index,
  surface,
  onOpenFrame,
}: {
  scene: JourneyScene;
  index: number;
  surface: Surface;
  onOpenFrame: (frames: string[], captions: string[] | undefined, start: number) => void;
}) {
  const layout = scene.layout ?? LAYOUT_CYCLE[index % LAYOUT_CYCLE.length];
  const hasCapture = scene.frames.length > 0 || Boolean(scene.video);

  const body = (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="nums shrink-0 font-mono text-micro text-ink-faint">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3 className="font-serif text-head leading-tight text-balance">{scene.title}</h3>
      </div>
      <Prose className="prose-walkthrough text-body">{scene.narrative}</Prose>
      <div className="flex flex-wrap items-center gap-2">
        {scene.location && (
          <code className="truncate-start max-w-full rounded bg-paper-sunken px-2 py-0.5 font-mono text-micro text-ink-muted">
            {scene.location}
          </code>
        )}
        {scene.verificationStatus && (
          <VerificationBadge status={scene.verificationStatus} />
        )}
      </div>
      {scene.note && (
        <p className="border-l-2 border-rule-strong pl-3 text-small italic text-ink-muted">
          {scene.note}
        </p>
      )}
    </div>
  );

  const capture = hasCapture ? (
    <SceneCapture scene={scene} surface={surface} onOpenFrame={onOpenFrame} />
  ) : null;

  // A scene with no capture collapses to prose regardless of its declared
  // layout. Rendering an empty frame beside the text would claim a capture
  // exists; the `note` field is where the reason belongs.
  if (!capture) {
    return <section className="mx-auto max-w-[62ch] px-6 py-10">{body}</section>;
  }

  switch (layout) {
    case "full-bleed":
      return (
        <section className="py-12">
          <div className="mx-auto max-w-[1180px] px-6">{capture}</div>
          <div className="mx-auto mt-6 max-w-[62ch] px-6">{body}</div>
        </section>
      );
    case "split-left":
      return (
        <section className="mx-auto grid max-w-[1180px] items-center gap-10 px-6 py-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div>{body}</div>
          <div>{capture}</div>
        </section>
      );
    case "split-right":
      return (
        <section className="mx-auto grid max-w-[1180px] items-center gap-10 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="lg:order-1">{capture}</div>
          <div className="lg:order-2">{body}</div>
        </section>
      );
    case "inset":
      return (
        <section className="mx-auto max-w-[72ch] px-6 py-12">
          {body}
          <div className="mt-6">{capture}</div>
        </section>
      );
  }
}

function SceneCapture({
  scene,
  surface,
  onOpenFrame,
}: {
  scene: JourneyScene;
  surface: Surface;
  onOpenFrame: (frames: string[], captions: string[] | undefined, start: number) => void;
}) {
  const [frame, setFrame] = useState(0);
  const multi = scene.frames.length > 1;

  if (scene.video && scene.frames.length === 0) {
    return (
      <SurfaceFrame surface={surface} location={scene.location}>
        <video
          src={scene.video}
          controls
          playsInline
          preload="metadata"
          className="size-full bg-ink object-contain"
        />
      </SurfaceFrame>
    );
  }

  const src = scene.frames[Math.min(frame, scene.frames.length - 1)];

  return (
    <figure className="space-y-2">
      <div className="group relative">
        <SurfaceFrame surface={surface} location={scene.location}>
          <Image
            src={src}
            alt={scene.frameCaptions?.[frame] ?? scene.title}
            fill
            sizes="(max-width: 1024px) 100vw, 760px"
            className="object-cover object-top"
            // Captures are overwritten in place by a re-walk, so a cached
            // optimizer entry would serve last week's screenshot. The config
            // sets `minimumCacheTTL: 0`; this keeps the intent visible here.
            unoptimized={false}
          />
        </SurfaceFrame>
        <button
          type="button"
          onClick={() => onOpenFrame(scene.frames, scene.frameCaptions, frame)}
          className="absolute right-3 top-3 rounded border border-rule bg-paper/90 p-1.5 text-ink-muted opacity-0 backdrop-blur transition-opacity hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
          aria-label="Open capture full size"
        >
          <Maximize2 className="size-3.5" strokeWidth={1.75} aria-hidden />
        </button>
        {scene.video && (
          <a
            href={scene.video}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded border border-rule bg-paper/90 px-2 py-1 font-mono text-micro text-ink-muted backdrop-blur transition-colors hover:text-ink"
          >
            <Play className="size-3" strokeWidth={2} aria-hidden />
            video
          </a>
        )}
      </div>

      {multi && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {scene.frames.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setFrame(i)}
                aria-label={`Frame ${i + 1}`}
                aria-current={i === frame}
                className={cn(
                  "h-1.5 w-6 rounded-full transition-colors",
                  i === frame ? "bg-ink" : "bg-rule-strong hover:bg-ink-faint",
                )}
              />
            ))}
          </div>
          <span className="nums font-mono text-micro text-ink-faint">
            {frame + 1}/{scene.frames.length}
          </span>
        </div>
      )}

      {scene.frameCaptions?.[frame] && (
        <figcaption className="text-small text-ink-muted">{scene.frameCaptions[frame]}</figcaption>
      )}
    </figure>
  );
}
