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
import { Film, X } from "lucide-react";

export function StoryPlayer({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = useState(false);

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
        className="flex items-center gap-2 rounded-full border border-ink bg-ink px-4 py-2 text-label text-paper transition-colors hover:bg-ink/90"
      >
        <Film className="size-3.5" strokeWidth={1.75} aria-hidden />
        Watch the story
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} — story video`}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/92 p-4 backdrop-blur-sm sm:p-8"
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
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the
              narration is generated from the scene text already on this page,
              so the transcript is the page itself. */}
          <video
            src={src}
            controls
            autoPlay
            playsInline
            className="max-h-[78vh] w-full max-w-[1600px] rounded bg-black"
          />
          <p className="max-w-[70ch] text-center text-label text-paper/70">
            Real captures. The voice-over is synthesized from the scene narrative on this page —
            it is not the product&rsquo;s own audio.
          </p>
        </div>
      )}
    </>
  );
}
