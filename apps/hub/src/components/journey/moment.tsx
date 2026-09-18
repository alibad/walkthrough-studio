/**
 * A moment shot — the persona away from the screen.
 *
 * This is the one component in the hub that renders something nobody
 * observed. Every other image here is a capture of software that was actually
 * driven; a moment is generated illustration of a person in a place, and
 * inventing a picture of a real user's morning is exactly the kind of claim
 * this repo's one rule exists to prevent.
 *
 * It earns its place anyway, for a reason worth writing down: a journey made
 * entirely of captures reads as a UI inventory even when the narrative is
 * good, because every frame is a rectangle of someone else's chrome. The
 * moments are what make it a story about a person.
 *
 * The compromise is that it is *always labelled*. The eyebrow says
 * "illustration" on every single one, unconditionally — not behind a hover,
 * not in a tooltip, not only when a flag is set. If that label is ever made
 * optional, this component has become a liability.
 */

import Image from "next/image";
import type { JourneyMoment } from "@/lib/types";

export function Moment({ moment }: { moment: JourneyMoment }) {
  return (
    <figure className="relative py-4">
      <div className="relative mx-auto aspect-[3/2] w-full max-w-[1180px] overflow-hidden">
        <Image
          src={moment.image}
          alt={moment.caption}
          fill
          sizes="(max-width: 1180px) 100vw, 1180px"
          className="object-cover"
        />
        {/* Paper-side vignette, so the plate dissolves into the page instead
            of ending on a hard rectangle edge. It is NOT a scrim for the
            caption: an earlier version pulled the caption up over the image
            with a negative margin, and because the fully-opaque part of this
            gradient is thinner than the pull, the first line of every caption
            straddled the image edge and the eyebrow vanished behind the
            plate. The caption now sits below, on clean paper. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, var(--paper) 0%, color-mix(in srgb, var(--paper) 60%, transparent) 12%, transparent 30%)",
          }}
        />
      </div>
      <figcaption className="mx-auto mt-1 max-w-[48ch] px-6 text-center">
        <p className="eyebrow">Illustration</p>
        <p className="mt-2 font-serif text-head italic leading-snug text-ink text-balance">
          &ldquo;{moment.caption}&rdquo;
        </p>
      </figcaption>
    </figure>
  );
}
