"use client";

/**
 * The library — chart view and list view over the same data.
 *
 * The chart is the front door because a library of apps is a *space* you
 * browse, and a table is not that. But a chart is a bad way to answer "which
 * of these is stale" across twenty apps, so the list stays one click away.
 * Every visit opens on the chart; selecting List is deliberately temporary so
 * an old browser preference cannot quietly replace the library's front door.
 *
 * Selection lives in the URL (`?app=slug`) so a chart with a panel open is a
 * linkable state — the thing the old globe got right and the reason its deep
 * links were worth preserving.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, Orbit } from "lucide-react";
import type { AtlasProduct } from "@/lib/product-atlas";
import { ConstellationChart } from "./chart";
import { ProductPanel } from "./product-panel";
import { ProductAtlasList } from "./product-list";

type View = "chart" | "list";

interface LibraryProps {
  products: AtlasProduct[];
}

export function Library({ products }: LibraryProps) {
  const router = useRouter();
  const params = useSearchParams();
  const selectedParam = params.get("app");
  const active =
    products.find(
      (product) =>
        product.id === selectedParam ||
        product.variants.some((variant) => variant.slug === selectedParam),
    ) ?? null;
  const selected = active?.id ?? null;

  // The chart is the product's front door on every surface. List remains a
  // temporary alternate view, but it never changes what the next visit opens.
  const [view, setView] = useState<View>("chart");

  const chooseView = useCallback((next: View) => {
    setView(next);
  }, []);

  const select = useCallback(
    (slug: string | null) => {
      router.replace(slug ? `/?app=${encodeURIComponent(slug)}` : "/", { scroll: false });
    },
    [router],
  );

  // Escape closes the panel. Registered once for the whole view rather than on
  // the panel, so it works while the pointer is anywhere on the chart.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, select]);

  return (
    // The chart view fills the viewport rather than sizing itself: a map you
    // have to scroll is not a map. The header is fixed height and the chart
    // takes whatever is left, letterboxed by the SVG's own viewBox.
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1440px] shrink-0 flex-col items-start gap-5 px-6 pt-8 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <p className="eyebrow">The library</p>
          <h1 className="display mt-2 text-balance">Cartographic Product Atlas</h1>
          <p className="mt-2.5 max-w-[66ch] text-small text-ink-muted">
            {products.length} products across five human territories. Platform-specific evidence
            lives inside each product; an outer ring is what has been catalogued and the filled
            centre is what has actually been walked.
          </p>
        </div>
        <ViewToggle view={view} onChange={chooseView} />
      </div>

      {view === "chart" ? (
        <div className="relative mx-auto mt-5 w-full max-w-[1440px] px-4 pb-8">
          <div className="relative">
            <ConstellationChart
              products={products}
              selected={selected}
              onSelect={select}
            />
            {active && <ProductPanel product={active} onClose={() => select(null)} />}
          </div>

          {products.length === 0 && <EmptyChartPrompt />}
        </div>
      ) : (
        <div className="mt-5 overflow-y-auto">
          <ProductAtlasList products={products} />
        </div>
      )}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div
      className="flex shrink-0 self-end items-center gap-1 rounded border border-rule bg-paper-raised p-1 sm:self-auto"
      role="tablist"
      aria-label="Library view"
    >
      {(
        [
          { id: "chart" as View, label: "Chart", Icon: Orbit },
          { id: "list" as View, label: "List", Icon: LayoutGrid },
        ]
      ).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={view === id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-label transition-colors ${
            view === id
              ? "bg-ink text-paper"
              : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
          }`}
        >
          <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The empty state sits *over* the chart rather than replacing it.
 *
 * An empty library still has something to show — the five territories are the
 * shape of what this tool can document, and seeing them is a better
 * introduction than a blank page with a command on it.
 */
function EmptyChartPrompt() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto mat max-w-[38ch] text-center">
        <p className="eyebrow">Empty chart</p>
        <h2 className="mt-2 font-serif text-head">Five territories, no products</h2>
        <p className="mt-2 text-small text-ink-muted">
          Register the first product and it will appear in the territory of its human purpose.
        </p>
        <code className="mt-4 block rounded bg-paper-sunken px-3 py-2 font-mono text-label text-ink">
          pnpm new-project
        </code>
      </div>
    </div>
  );
}
