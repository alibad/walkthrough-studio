"use client";

/**
 * The library chart.
 *
 * An engraved celestial map of every app in the library, positioned by the
 * platforms it is documented on (see `lib/constellation.ts` for why platforms
 * and not geography).
 *
 * Three decisions worth stating, because each of them is the opposite of the
 * obvious choice:
 *
 * 1. **All five territories always draw, even empty ones.** The tempting
 *    version shows only what you have. But a library with one app in it would
 *    then be a single dot on a blank field, which reads as a broken chart
 *    rather than as an honest one. Drawing the empty territories as ink
 *    outlines says "these are the five places an app can live, and you have
 *    documented one" — which is both truthful and legible on day one.
 * 2. **No animation library.** The intro is CSS keyframes on
 *    `stroke-dashoffset` and `opacity`. The hub has seven dependencies and a
 *    chart that draws itself is not worth an eighth.
 * 3. **Ink on paper, not stars in space.** A dark starfield is the reflex for
 *    anything called a constellation, and it would fight the one light
 *    register this theme commits to. An antique celestial chart *is* ink on
 *    cream paper, so the metaphor survives intact and the screenshots this
 *    hub mats stay the only bright rectangles on the page.
 */

import { useState } from "react";
import type { ConstellationNode, Platform } from "@/lib/types";
import { TERRITORIES, type ConstellationEdge } from "@/lib/constellation";
import { PLATFORM_PROFILES } from "@/lib/platforms";

/** Chart space. Normalized 0..1 positions multiply into this box. */
const W = 1000;
const H = 700;

const px = (x: number) => x * W;
const py = (y: number) => y * H;

interface ChartProps {
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
}

export function ConstellationChart({ nodes, edges, selected, onSelect }: ChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const occupied = new Set<Platform>();
  for (const node of nodes) for (const p of node.platforms) occupied.add(p);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      // `absolute inset-0` so the box is the parent's, not the drawing's.
      // Sized by `h-full w-full` alone, the width wins and the SVG grows
      // taller than the viewport instead of letterboxing into it.
      className="absolute inset-0 size-full select-none"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Library chart — apps positioned by the platforms they are documented on"
    >
      <defs>
        {/* Radial fade so a territory's plate dissolves into the paper
            instead of sitting in a hard-edged box. */}
        <radialGradient id="territory-fade">
          <stop offset="55%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="territory-mask">
          <rect width={W} height={H} fill="black" />
          {Object.values(TERRITORIES).map((t) => (
            <circle
              key={t.id}
              cx={px(t.cx)}
              cy={py(t.cy)}
              r={t.r * W * 0.9}
              fill="url(#territory-fade)"
            />
          ))}
        </mask>
      </defs>

      {/* ── Graticule ─────────────────────────────────────────────────────
          The faint ruled grid of a printed chart. Purely atmospheric, and
          deliberately below everything else in both z-order and contrast. */}
      <g
        className="constellation-graticule"
        stroke="var(--rule)"
        strokeWidth="0.5"
        fill="none"
        opacity="0.5"
      >
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`v${i}`} x1={(i + 1) * (W / 10)} y1="0" x2={(i + 1) * (W / 10)} y2={H} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={(i + 1) * (H / 7)} x2={W} y2={(i + 1) * (H / 7)} />
        ))}
      </g>

      {/* ── Territories ───────────────────────────────────────────────────── */}
      {Object.values(TERRITORIES).map((t, i) => {
        const live = occupied.has(t.id);
        const profile = PLATFORM_PROFILES[t.id];
        const r = t.r * W;
        return (
          <g
            key={t.id}
            className="constellation-territory"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <circle
              cx={px(t.cx)}
              cy={py(t.cy)}
              r={r}
              fill="none"
              stroke={live ? "var(--rule-strong)" : "var(--rule)"}
              strokeWidth={live ? 1 : 0.8}
              strokeDasharray="2 6"
            />
            <text
              x={px(t.cx)}
              y={py(t.cy) + r + 22}
              textAnchor="middle"
              className="constellation-territory-label"
              fill={live ? "var(--ink-muted)" : "var(--ink-faint)"}
            >
              {profile.short.toUpperCase()}
            </text>
            {!live && (
              <text
                x={px(t.cx)}
                y={py(t.cy) + 4}
                textAnchor="middle"
                className="constellation-territory-empty"
                fill="var(--ink-faint)"
              >
                unpopulated
              </text>
            )}
          </g>
        );
      })}

      {/* ── Constellation lines ───────────────────────────────────────────
          Bridges (a multi-platform app tethered to each territory it spans)
          are the only lines carrying information, so they get the accent
          colour; figure lines are neutral ink. */}
      <g className="constellation-edges">
        {edges.map((edge, i) => (
          <line
            key={i}
            x1={px(edge.from.x)}
            y1={py(edge.from.y)}
            x2={px(edge.to.x)}
            y2={py(edge.to.y)}
            stroke={edge.bridge ? "var(--brand)" : "var(--rule-strong)"}
            strokeWidth={edge.bridge ? 0.9 : 0.7}
            strokeDasharray={edge.bridge ? "4 4" : undefined}
            opacity={edge.bridge ? 0.55 : 0.8}
          />
        ))}
      </g>

      {/* ── Apps ──────────────────────────────────────────────────────────── */}
      {nodes.map((node, i) => (
        <AppStar
          key={node.slug}
          node={node}
          index={i}
          active={selected === node.slug}
          dimmed={selected !== null && selected !== node.slug}
          hovered={hovered === node.slug}
          onHover={setHovered}
          onSelect={onSelect}
        />
      ))}
    </svg>
  );
}

/**
 * One app, drawn as an engraved star.
 *
 * Size encodes walked coverage rather than feature count, because the number
 * that matters when scanning a library is "how much of this app is actually
 * documented" — a 40-feature catalog with two walks should not outweigh a
 * 6-feature catalog that is finished. The unwalked remainder shows as the gap
 * between the outer ring (catalogued) and the filled disc (walked), so an
 * under-documented app looks hollow, which is the point.
 */
function AppStar({
  node,
  index,
  active,
  dimmed,
  hovered,
  onHover,
  onSelect,
}: {
  node: ConstellationNode;
  index: number;
  active: boolean;
  dimmed: boolean;
  hovered: boolean;
  onHover: (slug: string | null) => void;
  onSelect: (slug: string | null) => void;
}) {
  const cx = px(node.x);
  const cy = py(node.y);
  const outer = 20 + Math.min(node.featureCount, 24) * 0.9;
  // The filled disc is capped well inside the ring. At 100% coverage an
  // uncapped disc exactly fills its own outline, so a fully-documented app
  // renders as a plain blob and the ring — the thing that makes "hollow means
  // under-documented" legible — disappears at precisely the moment it should
  // read as complete.
  const inner = outer * (0.2 + Math.min(Math.max(node.coverage, 0), 1) * 0.42);
  const lifted = active || hovered;

  return (
    <g
      // A focus outline on an SVG <g> draws a rectangle around the group's
      // bounding box, which includes the label and the portrait fan — an ugly
      // box around a star. Suppressed here and replaced by routing keyboard
      // focus through the same `lifted` treatment as hover, so the indicator
      // is the star growing rather than a rect around it.
      className="constellation-star cursor-pointer outline-none"
      style={{ animationDelay: `${450 + index * 120}ms` }}
      opacity={dimmed ? 0.35 : 1}
      onMouseEnter={() => onHover(node.slug)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(node.slug)}
      onBlur={() => onHover(null)}
      onClick={() => onSelect(active ? null : node.slug)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(active ? null : node.slug);
        }
      }}
      aria-label={`${node.name} — ${node.walkedCount} of ${node.featureCount} features walked`}
    >
      {/* Catalogued extent. */}
      <circle
        cx={cx}
        cy={cy}
        r={outer}
        fill="none"
        stroke={lifted ? "var(--ink)" : "var(--ink-muted)"}
        strokeWidth={lifted ? 1.8 : 1.3}
      />
      {/* Radiating hairlines — the engraving that makes it a star and not a
          bubble chart. Eight is enough to read; more turns to mush at size. */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        const r0 = outer + 3;
        const r1 = outer + (lifted ? 11 : 7);
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * r0}
            y1={cy + Math.sin(a) * r0}
            x2={cx + Math.cos(a) * r1}
            y2={cy + Math.sin(a) * r1}
            stroke="var(--ink-muted)"
            strokeWidth="1.1"
            opacity={lifted ? 1 : 0.65}
          />
        );
      })}
      {/* Walked coverage. */}
      <circle cx={cx} cy={cy} r={inner} fill={active ? "var(--brand)" : "var(--ink)"} />

      <text
        x={cx}
        y={cy + outer + 30}
        textAnchor="middle"
        className="constellation-star-label"
        fill="var(--ink)"
      >
        {node.name}
      </text>
      <text
        x={cx}
        y={cy + outer + 46}
        textAnchor="middle"
        className="constellation-star-meta"
        fill="var(--ink-muted)"
      >
        {node.featureCount === 0
          ? "nothing walked yet"
          : `${node.walkedCount}/${node.featureCount} walked`}
        {node.personaCount > 0 &&
          ` · ${node.personaCount} ${node.personaCount === 1 ? "persona" : "personas"}`}
      </text>

      {/* Persona portraits, fanned above the star.
          Positioned in pixel space rather than given coordinates of their own:
          a persona has no location, and inventing one would be the same
          dishonesty the geographic globe committed. */}
      {node.personas.length > 0 && (
        <PersonaFan cx={cx} cy={cy - outer - 26} personas={node.personas} lifted={lifted} />
      )}
    </g>
  );
}

function PersonaFan({
  cx,
  cy,
  personas,
  lifted,
}: {
  cx: number;
  cy: number;
  personas: ConstellationNode["personas"];
  lifted: boolean;
}) {
  const shown = personas.slice(0, 5);
  const r = lifted ? 24 : 20;
  const gap = r * 1.55;
  const startX = cx - ((shown.length - 1) * gap) / 2;

  return (
    <g className="constellation-fan">
      {shown.map((persona, i) => {
        const x = startX + i * gap;
        const clip = `persona-clip-${persona.id}-${i}`;
        return (
          <g key={persona.id}>
            <defs>
              <clipPath id={clip}>
                <circle cx={x} cy={cy} r={r} />
              </clipPath>
            </defs>
            {persona.portrait ? (
              <image
                href={persona.portrait}
                x={x - r}
                y={cy - r}
                width={r * 2}
                height={r * 2}
                clipPath={`url(#${clip})`}
                preserveAspectRatio="xMidYMin slice"
              />
            ) : (
              <>
                <circle cx={x} cy={cy} r={r} fill="var(--paper-sunken)" />
                <text
                  x={x}
                  y={cy + 4}
                  textAnchor="middle"
                  className="constellation-fan-initial"
                  fill="var(--ink-muted)"
                  style={{ fontSize: r * 0.8 }}
                >
                  {persona.name.trim().charAt(0).toUpperCase()}
                </text>
              </>
            )}
            <circle
              cx={x}
              cy={cy}
              r={r}
              fill="none"
              stroke="var(--paper)"
              strokeWidth="2"
            />
            <circle cx={x} cy={cy} r={r} fill="none" stroke="var(--ink-muted)" strokeWidth="1" />
          </g>
        );
      })}
      {personas.length > shown.length && (
        <text
          x={startX + shown.length * gap}
          y={cy + 4}
          textAnchor="middle"
          className="constellation-fan-initial"
          fill="var(--ink-muted)"
        >
          +{personas.length - shown.length}
        </text>
      )}
    </g>
  );
}
