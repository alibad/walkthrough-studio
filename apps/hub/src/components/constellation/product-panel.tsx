"use client";

import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { PLATFORM_PROFILES } from "@/lib/platforms";
import type { AtlasProduct } from "@/lib/product-atlas";

export function ProductPanel({
  product,
  onClose,
}: {
  product: AtlasProduct;
  onClose: () => void;
}) {
  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-20 max-h-[70dvh] overflow-y-auto border border-rule bg-paper-raised shadow-plate md:absolute md:inset-x-3 md:bottom-3 md:mt-0 md:max-h-none md:overflow-visible"
      aria-label={`${product.name} product summary`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute left-3 top-3 z-10 rounded-sm p-1 text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
      >
        <X className="size-4" strokeWidth={1.6} aria-hidden />
      </button>

      <div className="grid min-h-[8.75rem] gap-0 md:grid-cols-[1.55fr_0.9fr_0.7fr_1.1fr]">
        <section className="flex items-center gap-5 px-6 py-5 pl-12 md:border-r md:border-rule">
          <CoverageGlyph coverage={product.coverage} />
          <div className="min-w-0">
            <p className="eyebrow">Selected product</p>
            <h2 className="mt-1 font-serif text-head-lg leading-tight">{product.name}</h2>
            <p className="mt-1.5 max-w-[48ch] text-small leading-relaxed text-ink-muted">
              {product.description}
            </p>
          </div>
        </section>

        <section className="border-t border-rule px-5 py-5 md:border-r md:border-t-0">
          <p className="eyebrow">Platforms</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {product.platforms.map((platform) => {
              const variant =
                product.variants.find((candidate) => candidate.platform === platform) ??
                product.variants[0];
              return (
                <Link
                  key={platform}
                  href={`/${variant.slug}`}
                  className="rounded-full border border-rule-strong bg-paper px-2.5 py-1 font-mono text-micro text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                >
                  {PLATFORM_PROFILES[platform].short}
                </Link>
              );
            })}
          </div>
          <p className="mt-3 text-micro leading-relaxed text-ink-faint">
            Choose a platform to open its evidence record.
          </p>
        </section>

        <section className="border-t border-rule px-5 py-5 md:border-r md:border-t-0">
          <p className="eyebrow">Coverage</p>
          <p className="nums mt-3 font-serif text-head leading-none">
            {product.walkedCount}/{product.featureCount}
          </p>
          <p className="mt-1 text-micro text-ink-muted">features walked</p>
          <p className="mt-3 font-mono text-micro text-ink-faint">
            {product.screenshotCount} frames · {product.personaCount}{" "}
            {product.personaCount === 1 ? "persona" : "personas"}
          </p>
        </section>

        <section className="border-t border-rule px-5 py-5 md:border-t-0">
          <p className="eyebrow">Inside this product</p>
          <ul className="mt-2 space-y-1.5">
            {product.variants.map((variant) => (
              <li key={variant.slug}>
                <Link
                  href={`/${variant.slug}`}
                  className="group flex items-center justify-between gap-3 text-small text-ink-muted transition-colors hover:text-ink"
                >
                  <span>{PLATFORM_PROFILES[variant.platform].label}</span>
                  <ArrowRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={1.6}
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}

function CoverageGlyph({ coverage }: { coverage: number }) {
  const circumference = 2 * Math.PI * 24;
  const dash = Math.max(0, Math.min(coverage, 1)) * circumference;
  return (
    <span className="hidden size-20 shrink-0 sm:block" aria-hidden>
      <svg viewBox="0 0 72 72" className="size-full">
        <circle cx="36" cy="36" r="30" fill="var(--paper)" stroke="var(--rule-strong)" />
        <circle cx="36" cy="36" r="24" fill="none" stroke="var(--rule)" strokeWidth="5" />
        <circle
          cx="36"
          cy="36"
          r="24"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="5"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 36 36)"
        />
        <circle cx="36" cy="36" r={9 + coverage * 7} fill="var(--ink)" />
      </svg>
    </span>
  );
}
