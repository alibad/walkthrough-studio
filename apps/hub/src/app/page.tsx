import { Suspense } from "react";
import { Library } from "@/components/constellation/library";
import { RepoCard } from "@/components/repo-card";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getAllProjectSummaries, getPersonas } from "@/lib/data";
import { buildProductAtlas } from "@/lib/product-atlas";
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

  const products = buildProductAtlas(summaries, personasBySlug);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex min-h-0 flex-1 flex-col">
        {/* `useSearchParams` in the library shell requires a Suspense boundary. */}
        <Suspense fallback={null}>
          <Library products={products} />
        </Suspense>

        {/* The card sits below the chart rather than above it: the library is
            what a visitor came for, and the invitation to reuse the method only
            makes sense once they have seen what it produces. */}
        <div className="mx-auto w-full max-w-[1440px] shrink-0 px-6 pb-10 pt-8">
          <RepoCard />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
