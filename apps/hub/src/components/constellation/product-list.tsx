"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PLATFORM_PROFILES } from "@/lib/platforms";
import { ATLAS_TERRITORIES, type AtlasProduct } from "@/lib/product-atlas";

export function ProductAtlasList({ products }: { products: AtlasProduct[] }) {
  return (
    <div className="mx-auto max-w-[1180px] space-y-12 px-6 pb-24">
      {ATLAS_TERRITORIES.map((territory) => {
        const territoryProducts = products.filter((product) => product.territory === territory.id);
        if (territoryProducts.length === 0) return null;
        return (
          <section key={territory.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
              <h2 className="font-serif text-head">{territory.name}</h2>
              <p className="font-serif text-small italic text-ink-muted">{territory.motto}</p>
            </div>
            <div className="divide-y divide-rule">
              {territoryProducts.map((product) => (
                <article
                  key={product.id}
                  className="grid gap-4 py-5 md:grid-cols-[1.2fr_0.8fr_0.45fr] md:items-center"
                >
                  <div>
                    <h3 className="font-serif text-title">{product.name}</h3>
                    <p className="mt-1 max-w-[65ch] text-small leading-relaxed text-ink-muted">
                      {product.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {product.variants.map((variant) => (
                      <Link
                        key={variant.slug}
                        href={`/${variant.slug}`}
                        className="group inline-flex items-center gap-2 rounded-full border border-rule bg-paper-raised px-3 py-1.5 text-label text-ink-muted transition-colors hover:border-ink hover:text-ink"
                      >
                        {PLATFORM_PROFILES[variant.platform].label}
                        <ArrowRight
                          className="size-3 transition-transform group-hover:translate-x-0.5"
                          strokeWidth={1.6}
                          aria-hidden
                        />
                      </Link>
                    ))}
                  </div>

                  <div className="md:text-right">
                    <p className="nums font-serif text-title">
                      {product.walkedCount}/{product.featureCount}
                    </p>
                    <p className="mt-0.5 font-mono text-micro text-ink-faint">features walked</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

