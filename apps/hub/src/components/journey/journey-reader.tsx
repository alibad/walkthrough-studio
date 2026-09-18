"use client";

/**
 * The journey reader.
 *
 * Scenes and moments are interleaved into one sequence and read top to
 * bottom. There is no step rail and no "next" button, on purpose: a feature
 * walkthrough is a reference you jump around in, but a journey is a narrative
 * and paginating it would let a reader arrive at the payoff without the setup
 * that makes it mean anything.
 *
 * The one navigation affordance is a scene index in the sticky header, which
 * scrolls rather than pages — so the document stays whole.
 */

import { useCallback, useMemo, useState } from "react";
import type { JourneyMoment, JourneyScene, PersonaJourney, Surface } from "@/lib/types";
import { DEFAULT_SURFACE_IDS, resolveSurface } from "@/lib/surfaces";
import { Lightbox } from "@/components/lightbox";
import { Scene } from "./scene";
import { Moment } from "./moment";

type Item =
  | { kind: "scene"; scene: JourneyScene; index: number }
  | { kind: "moment"; moment: JourneyMoment };

export function JourneyReader({
  journey,
  surfaces,
}: {
  journey: PersonaJourney;
  /** The catalog's custom surfaces, so a project-defined surface resolves. */
  surfaces?: Surface[];
}) {
  const [lightbox, setLightbox] = useState<{
    srcs: string[];
    labels?: string[];
    index: number;
  } | null>(null);

  const openFrame = useCallback(
    (srcs: string[], labels: string[] | undefined, index: number) => {
      setLightbox({ srcs, labels, index });
    },
    [],
  );

  /**
   * Weave moments between scenes.
   *
   * `afterScene` is an index into the scene list, so a moment with
   * `afterScene: -1` opens the journey. Built as a single pass over scenes
   * with a lookup rather than by splicing, because splicing while iterating
   * is how off-by-ones get written.
   */
  const items = useMemo<Item[]>(() => {
    const byAfter = new Map<number, JourneyMoment[]>();
    for (const moment of journey.moments ?? []) {
      const bucket = byAfter.get(moment.afterScene);
      if (bucket) bucket.push(moment);
      else byAfter.set(moment.afterScene, [moment]);
    }

    const out: Item[] = [];
    for (const moment of byAfter.get(-1) ?? []) out.push({ kind: "moment", moment });
    journey.scenes.forEach((scene, index) => {
      out.push({ kind: "scene", scene, index });
      for (const moment of byAfter.get(index) ?? []) out.push({ kind: "moment", moment });
    });
    return out;
  }, [journey.moments, journey.scenes]);

  return (
    <div>
      <div className="divide-y divide-rule">
        {items.map((item) =>
          item.kind === "moment" ? (
            <Moment key={`moment-${item.moment.id}`} moment={item.moment} />
          ) : (
            <Scene
              key={item.scene.id}
              scene={item.scene}
              index={item.index}
              surface={surfaceForScene(journey, item.scene, surfaces)}
              onOpenFrame={openFrame}
            />
          ),
        )}
      </div>

      {lightbox && (
        <Lightbox
          srcs={lightbox.srcs}
          labels={lightbox.labels}
          index={lightbox.index}
          title={journey.headline}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox((l) => (l ? { ...l, index } : null))}
        />
      )}
    </div>
  );
}

/**
 * The surface a scene was captured on.
 *
 * Falls back scene → journey → platform default. A scene that overrides the
 * journey's surface is the normal case for a mobile detour inside a desktop
 * journey, and getting this wrong means a phone capture rendered in browser
 * chrome — which silently misstates what was driven.
 */
function surfaceForScene(
  journey: PersonaJourney,
  scene: JourneyScene,
  custom: Surface[] | undefined,
): Surface {
  const id =
    scene.surface ?? journey.surface ?? DEFAULT_SURFACE_IDS[journey.platform][0] ?? "desktop";
  return resolveSurface(id, custom, journey.platform);
}
