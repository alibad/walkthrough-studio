import { Suspense } from "react";
import { Library } from "@/components/constellation/library";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getAllProjectSummaries, getPersonas } from "@/lib/data";
import { constellationEdges, layoutConstellation } from "@/lib/constellation";
import type { PersonaSummary } from "@/lib/types";

export default function HomePage() {
  // Read on every request. The data is a handful of JSON files on local disk,
  // so caching would only buy a stale page — and staleness is the one thing
  // this app exists to make visible.
  const summaries = getAllProjectSummaries();

  const personasBySlug: Record<string, PersonaSummary[]> = {};
  for (const summary of summaries) {
    personasBySlug[summary.project.slug] = getPersonas(summary.project.slug, summary.catalog);
  }

  // Layout is pure, but persona portraits need the filesystem, so the fan is
  // attached here rather than inside the layout function.
  const nodes = layoutConstellation(summaries).map((node) => ({
    ...node,
    personas: (personasBySlug[node.slug] ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      portrait: p.portrait,
    })),
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex min-h-0 flex-1 flex-col">
        {/* `useSearchParams` in the library shell requires a Suspense boundary. */}
        <Suspense fallback={null}>
          <Library
            summaries={summaries}
            nodes={nodes}
            edges={constellationEdges(nodes)}
            personasBySlug={personasBySlug}
          />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
