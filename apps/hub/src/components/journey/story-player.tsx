"use client";

/**
 * "Watch the story" — the narrated MP4 for a journey.
 *
 * Opens in an overlay rather than playing inline, because the video is a
 * two-minute committed watch and an inline player invites a reader to start
 * it, scroll away, and hear narration over a page they are no longer looking
 * at.
 *
 * The narration is synthesized speech over real captures. That distinction is
 * printed under the player, not buried in a tooltip: the *images* are
 * evidence of what the software did, the *voice* is not evidence of anything,
 * and a viewer who assumes they are hearing a product's own voice-over has
 * been misled by us.
 */

import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * `kind` decides what this claims about the clip, and the two claims are not
 * interchangeable — one is an assembled film with a synthetic voice, the other
 * is the browser's own recording of the walk with no audio at all. Captioning
 * a silent recording with a line about its voice-over is a lie the player
 * tells on the page's behalf, so the caption is chosen here rather than fixed.
 */
export function StoryPlayer({
  src,
  title,
  kind = "story",
  label,
  detail,
  variant = "button",
  className,
}: {
  src: string;
  title: string;
  kind?: "story" | "recording";
  label?: string;
  detail?: string;
  variant?: "button" | "card" | "overlay";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const isRecording = kind === "recording";
  const buttonLabel = label ?? (isRecording ? "Play the recorded walk" : "Play the story film");
  const buttonDetail =
    detail ?? (isRecording ? "Unedited screen recording" : "Narrated from real captures");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group/video text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
          variant === "button" &&
            "inline-flex items-center gap-3 rounded-md border border-ink bg-ink px-4 py-2.5 text-paper shadow-plate hover:-translate-y-px hover:bg-ink/90 hover:shadow-plate-lift",
          variant === "card" &&
            "flex w-full items-center gap-3 rounded-md border border-brand/30 bg-brand-wash px-3.5 py-3 text-brand-deep shadow-plate hover:-translate-y-px hover:border-brand/55 hover:shadow-plate-lift",
          variant === "overlay" &&
            "absolute inset-x-3 bottom-3 z-10 flex items-center gap-2.5 rounded-md border border-paper/20 bg-ink/92 px-3 py-2.5 text-paper shadow-plate backdrop-blur hover:-translate-y-px hover:bg-ink",
          className,
        )}
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full transition-transform group-hover/video:scale-105",
            variant === "card" ? "bg-brand text-paper" : "bg-paper text-ink",
          )}
          aria-hidden
        >
          <Play className="ml-0.5 size-3.5 fill-current" strokeWidth={1.75} />
        </span>
        <span className="min-w-0">
          <span className="block text-label font-semibold leading-tight">{buttonLabel}</span>
          <span
            className={cn(
              "mt-0.5 block text-micro leading-tight",
              variant === "card" ? "text-brand-deep/70" : "text-paper/65",
            )}
          >
            {buttonDetail}
          </span>
        </span>
      </button>

      {/* `backdrop-filter` on an ancestor of a native video surface can make
          Chromium on macOS promote a black compositor layer even while the
          video is decoded and playing. Keep this overlay opaque instead. */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} — ${isRecording ? "walk recording" : "story video"}`}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink p-4 sm:p-8"
        >
          <div className="flex w-full max-w-[1600px] items-center justify-between gap-4">
            <p className="truncate font-serif text-title text-paper">{title}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-sm p-1 text-paper/70 transition-colors hover:text-paper"
            >
              <X className="size-5" />
            </button>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a walk
              recording has no audio to caption, and the narrated variant is
              generated from the scene text already on this page, so the
              transcript is the page itself. */}
          <video
            src={src}
            controls
            autoPlay
            playsInline
            className="max-h-[78vh] w-full max-w-[1600px] rounded bg-black"
          />
          <p className="max-w-[70ch] text-center text-label text-paper/70">
            {isRecording
              ? "The browser's own recording of this walk, unedited and silent. Nothing was staged for it and nothing was cut."
              : "Real captures. The voice-over is synthesized from the scene narrative on this page — it is not the product's own audio."}
          </p>
        </div>
      )}
    </>
  );
}
