"use client";

/**
 * Full-bleed capture viewer.
 *
 * Deliberately hand-rolled rather than a dialog primitive: a capture needs the
 * whole viewport with no padding, no card, and no max-width, plus arrow-key
 * navigation across frames. Fighting a dialog primitive's layout for that
 * costs more than the thirty lines it saves.
 *
 * Takes **resolved** `srcs` rather than a slug and relative paths. Feature
 * walkthroughs store paths relative to the project directory while journeys
 * resolve theirs in the data layer, and a component that accepts both ends up
 * with two ways to be wrong about a URL.
 */

import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Lightbox({
  srcs,
  index,
  title,
  labels,
  onClose,
  onNavigate,
}: {
  srcs: string[];
  index: number;
  /** Used for the dialog label and the image alt text. */
  title: string;
  /** Per-frame caption, aligned 1:1 with `srcs`. */
  labels?: string[];
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const go = useCallback(
    (delta: number) => {
      onNavigate((index + delta + srcs.length) % srcs.length);
    },
    [index, srcs.length, onNavigate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    // Lock the page behind the overlay so a trackpad flick doesn't scroll the
    // document while the viewer is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [go, onClose]);

  const caption = labels?.[index];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} capture`}
      className="fixed inset-0 z-50 flex flex-col bg-ink/92 backdrop-blur-sm"
    >
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3">
        <p className="truncate font-mono text-label text-paper/70">{srcs[index]}</p>
        <div className="flex shrink-0 items-center gap-3">
          {srcs.length > 1 && (
            <span className="nums text-label text-paper/70">
              {index + 1} / {srcs.length}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-paper/70 transition-colors hover:text-paper"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="relative flex min-h-0 flex-1 cursor-zoom-out items-center justify-center px-4"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- intrinsic
            sizing is the point here: the capture should display at whatever
            aspect it was taken at, letterboxed, with no layout shift. */}
        <img
          src={srcs[index]}
          alt={caption ?? `${title} capture ${index + 1}`}
          className="max-h-full max-w-full object-contain"
        />
      </button>

      {caption && (
        <p className="shrink-0 px-6 pb-4 pt-3 text-center text-small text-paper/80">{caption}</p>
      )}
      {!caption && <div className="shrink-0 pb-4" />}

      {srcs.length > 1 && (
        <>
          <NavButton side="left" onClick={() => go(-1)} />
          <NavButton side="right" onClick={() => go(1)} />
        </>
      )}
    </div>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous frame" : "Next frame"}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full border border-paper/20 bg-ink/60 p-2.5 text-paper/80 transition-colors hover:bg-ink/80 hover:text-paper",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
