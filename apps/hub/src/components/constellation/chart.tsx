"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PLATFORM_PROFILES } from "@/lib/platforms";
import {
  ATLAS_TERRITORIES,
  type AtlasProduct,
  type AtlasTerritoryId,
} from "@/lib/product-atlas";

interface ChartProps {
  products: AtlasProduct[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

const TERRITORY_COPY: Record<AtlasTerritoryId, { align: string }> = {
  "practice-wellbeing": { align: "left-[11%] top-[13%]" },
  "learning-discovery": { align: "left-[57%] top-[12%]" },
  "planning-work": { align: "left-[10%] top-[55%]" },
  "personal-growth": { align: "left-[45%] top-[57%]" },
  "applied-tools": { align: "left-[82%] top-[56%]" },
};

const MOBILE_TERRITORY_COLORS: Record<
  AtlasTerritoryId,
  { background: string; border: string }
> = {
  "practice-wellbeing": { background: "#edf3e7", border: "#cad6c0" },
  "learning-discovery": { background: "#e9f2f6", border: "#c4d7df" },
  "planning-work": { background: "#f8efdf", border: "#dfceb1" },
  "personal-growth": { background: "#f7e7e3", border: "#dfc3bc" },
  "applied-tools": { background: "#efebf3", border: "#d3c9dc" },
};

export function ConstellationChart({ products, selected, onSelect }: ChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <section
      className="atlas-shell relative overflow-hidden rounded-sm border border-rule bg-paper"
      aria-label="Cartographic product atlas"
    >
      <div className="relative hidden aspect-[36/19] min-h-[34rem] md:block">
        <Image
          src="/art/product-atlas-map.png"
          alt=""
          fill
          priority
          sizes="(max-width: 1440px) 100vw, 1440px"
          className="object-fill mix-blend-multiply"
        />

        <AtlasRoutes products={products} selected={selected} hovered={hovered} />

        {ATLAS_TERRITORIES.map((territory) => (
          <div
            key={territory.id}
            className={cn("pointer-events-none absolute z-[2]", TERRITORY_COPY[territory.id].align)}
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-ink/80 lg:text-[10px]">
              {territory.name}
            </p>
            <p className="mt-0.5 font-serif text-[10px] italic text-ink-muted lg:text-xs">
              {territory.motto}
            </p>
          </div>
        ))}

        <div className="absolute inset-0 z-[3]">
          {products.map((product) => (
            <ProductNode
              key={product.id}
              product={product}
              active={selected === product.id}
              hovered={hovered === product.id}
              dimmed={selected !== null && selected !== product.id}
              onHover={setHovered}
              onSelect={onSelect}
            />
          ))}
        </div>

        <AtlasLegend />
      </div>

      <MobileAtlas products={products} selected={selected} onSelect={onSelect} />
    </section>
  );
}

function AtlasRoutes({
  products,
  selected,
  hovered,
}: {
  products: AtlasProduct[];
  selected: string | null;
  hovered: string | null;
}) {
  const active = selected ?? hovered;
  const groups = ATLAS_TERRITORIES.map((territory) =>
    products.filter((product) => product.territory === territory.id),
  );

  return (
    <svg
      viewBox="0 0 1000 528"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-[1] size-full"
      aria-hidden
    >
      {groups.flatMap((group) =>
        group.slice(0, -1).map((product, index) => {
          const next = group[index + 1];
          const isActive = active === product.id || active === next.id;
          const x1 = product.x * 1000;
          const y1 = product.y * 528;
          const x2 = next.x * 1000;
          const y2 = next.y * 528;
          const bend = Math.max(10, Math.abs(x2 - x1) * 0.13);
          return (
            <path
              key={`${product.id}-${next.id}`}
              d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - bend} ${x2} ${y2}`}
              fill="none"
              stroke={isActive ? "var(--brand)" : "var(--ink-faint)"}
              strokeWidth={isActive ? 1.15 : 0.75}
              strokeDasharray="2 4"
              opacity={isActive ? 0.75 : 0.42}
            />
          );
        }),
      )}
    </svg>
  );
}

function ProductNode({
  product,
  active,
  hovered,
  dimmed,
  onHover,
  onSelect,
}: {
  product: AtlasProduct;
  active: boolean;
  hovered: boolean;
  dimmed: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}) {
  const lifted = active || hovered;
  const circumference = 2 * Math.PI * 27;
  const dash = Math.max(0, Math.min(product.coverage, 1)) * circumference;
  const glyphSize = 58 + Math.min(product.featureCount, 30) * 0.45;

  return (
    <button
      type="button"
      onClick={() => onSelect(active ? null : product.id)}
      onMouseEnter={() => onHover(product.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(product.id)}
      onBlur={() => onHover(null)}
      aria-pressed={active}
      aria-label={`${product.name}: ${product.walkedCount} of ${product.featureCount} features walked; ${product.platforms.map((platform) => PLATFORM_PROFILES[platform].short).join(", ")}`}
      className={cn(
        "atlas-product absolute z-[4] -translate-x-1/2 -translate-y-1/2 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        lifted && "z-[6] -translate-y-[54%]",
        dimmed && "opacity-[0.35]",
      )}
      style={{ left: `${product.x * 100}%`, top: `${product.y * 100}%` }}
    >
      <span
        className={cn(
          "relative mx-auto block transition-transform duration-200",
          lifted && "scale-110",
        )}
        style={{ width: glyphSize, height: glyphSize }}
      >
        <svg viewBox="0 0 72 72" className="size-full overflow-visible" aria-hidden>
          <circle cx="36" cy="36" r="30" fill="var(--paper)" stroke="var(--rule-strong)" />
          <circle cx="36" cy="36" r="27" fill="none" stroke="var(--rule)" strokeWidth="4" />
          <circle
            cx="36"
            cy="36"
            r="27"
            fill="none"
            stroke={active ? "var(--brand)" : "var(--ink)"}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform="rotate(-90 36 36)"
          />
          <circle
            cx="36"
            cy="36"
            r={9 + Math.min(product.coverage, 1) * 7}
            fill={active ? "var(--brand)" : "var(--ink)"}
          />
          {[0, 90, 180, 270].map((angle) => {
            const radians = (angle * Math.PI) / 180;
            return (
              <line
                key={angle}
                x1={36 + Math.cos(radians) * 32}
                y1={36 + Math.sin(radians) * 32}
                x2={36 + Math.cos(radians) * 36}
                y2={36 + Math.sin(radians) * 36}
                stroke="var(--ink-muted)"
                strokeWidth="1"
              />
            );
          })}
        </svg>
      </span>

      <span className="mt-1 block whitespace-nowrap font-serif text-[11px] leading-none text-ink lg:text-[13px]">
        {product.name}
      </span>

      {product.platforms.length > 1 && (
        <span className="mt-1 flex justify-center gap-1">
          {product.platforms.map((platform) => (
            <span
              key={platform}
              className="rounded-full border border-rule-strong bg-paper/90 px-1.5 py-0.5 font-mono text-[7px] leading-none text-ink-muted lg:text-[8px]"
            >
              {PLATFORM_PROFILES[platform].short}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

function AtlasLegend() {
  return (
    <div className="absolute bottom-3 left-1/2 z-[5] flex -translate-x-1/2 items-center gap-4 rounded border border-rule bg-paper/90 px-3 py-2 shadow-plate backdrop-blur-sm">
      <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-ink-faint">How to read</p>
      <LegendMark filled label="Walked" />
      <LegendMark label="Catalogued" />
      <span className="hidden items-center gap-1.5 font-serif text-[10px] text-ink-muted lg:flex">
        <span className="size-2 rounded-full border border-rule-strong bg-paper" />
        Platform facet
      </span>
    </div>
  );
}

function LegendMark({ filled = false, label }: { filled?: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5 font-serif text-[10px] text-ink-muted">
      <span className={cn("size-3 rounded-full border border-ink", filled ? "bg-ink" : "bg-paper")} />
      {label}
    </span>
  );
}

function MobileAtlas({ products, selected, onSelect }: ChartProps) {
  return (
    <div className="space-y-3 bg-paper-sunken/35 p-3 md:hidden">
      {ATLAS_TERRITORIES.map((territory) => {
        const territoryProducts = products.filter((product) => product.territory === territory.id);
        const colors = MOBILE_TERRITORY_COLORS[territory.id];
        return (
          <section
            key={territory.id}
            className="overflow-hidden rounded-sm border px-4 py-4"
            style={{ backgroundColor: colors.background, borderColor: colors.border }}
          >
            <div className="border-b border-rule pb-2">
              <h2 className="font-mono text-micro uppercase tracking-[0.22em]">{territory.name}</h2>
              <p className="mt-1 font-serif text-small italic text-ink-muted">{territory.motto}</p>
            </div>
            <div className="mt-2 divide-y divide-rule">
              {territoryProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onSelect(selected === product.id ? null : product.id)}
                  className={cn(
                    "flex min-h-14 w-full items-center justify-between gap-4 rounded-sm px-2 py-3 text-left transition-colors hover:bg-paper/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
                    selected === product.id && "bg-paper/70",
                  )}
                  aria-pressed={selected === product.id}
                >
                  <span>
                    <span className="block font-serif text-title">{product.name}</span>
                    <span className="mt-1 block text-micro text-ink-muted">
                      {product.platforms.map((platform) => PLATFORM_PROFILES[platform].short).join(" · ")}
                    </span>
                  </span>
                  <span className="font-mono text-micro text-ink-faint">
                    {product.walkedCount}/{product.featureCount}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
