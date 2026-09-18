/**
 * The constellation — where an app sits on the library chart.
 *
 * The hub this grew out of drew its library as a Mapbox globe, with every
 * project pinned to its client's real head office. It was the best-looking
 * thing in the app and it could not survive generalization: it needed a
 * hand-curated latitude per project, a keyed Mapbox token, and the premise
 * that a documented app *has* a geographic home. Wikipedia does not. Neither
 * does anyone's CLI.
 *
 * So the substrate here is the only spatial fact this tool genuinely knows
 * about an app: **which platforms it runs on.** Five territories, one per
 * platform. An app documented on one platform sits inside that territory; an
 * app documented on several sits at the centroid of the ones it spans, which
 * puts a React Native app physically between iOS and Android and a desktop
 * Electron app between web and desktop. The chart earns its shape from the
 * data instead of decorating it.
 *
 * Two properties this file guarantees, both of which matter more than they
 * sound:
 *
 * 1. **Deterministic.** Position is a pure function of the slug and the
 *    platform set. The chart must not reshuffle between two renders of the
 *    same library, or it stops being a map you can learn and becomes an
 *    animation you have to re-read every time.
 * 2. **Stable under growth.** Adding an app perturbs only its own territory.
 *    Positions come from a per-territory sunflower seeded by slug hash, not
 *    from a global force simulation, so app #9 does not move app #2.
 */

import type { ConstellationNode, Platform, ProjectSummary } from "./types";
import { PLATFORMS } from "./types";
import { isFeatureWalked } from "./coverage";

export interface Territory {
  id: Platform;
  label: string;
  /** Centre in normalized 0..1 chart space. */
  cx: number;
  cy: number;
  /** Radius available for placing apps, in the same normalized space. */
  r: number;
}

/**
 * Territory centres, arranged as a ring rather than a grid.
 *
 * The ring is not arbitrary: iOS and Android are placed adjacent so that the
 * midpoint of a cross-platform mobile app reads as "mobile" and not as a
 * random point in the middle of the chart. Web sits widest because it is the
 * platform most libraries are mostly made of, and `cli` and `desktop` anchor
 * the bottom so the chart has visual weight where the eye settles.
 */
export const TERRITORIES: Record<Platform, Territory> = {
  web: { id: "web", label: "Web", cx: 0.26, cy: 0.36, r: 0.17 },
  ios: { id: "ios", label: "iOS", cx: 0.62, cy: 0.20, r: 0.13 },
  android: { id: "android", label: "Android", cx: 0.81, cy: 0.44, r: 0.13 },
  desktop: { id: "desktop", label: "Desktop", cx: 0.63, cy: 0.76, r: 0.14 },
  cli: { id: "cli", label: "Terminal", cx: 0.21, cy: 0.71, r: 0.13 },
};

/** FNV-1a. Small, dependency-free, and stable across runs and machines. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hash → float in [0, 1). */
const unit = (s: string) => hash(s) / 0x100000000;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Lay out every app on the chart.
 *
 * Apps are grouped by the exact set of platforms they span, so everything in
 * one group shares a centroid and can be spread around it without colliding
 * with a neighbouring group. Within a group, placement is a sunflower
 * (golden-angle) spiral — even coverage with no clumping at the centre, and
 * `sqrt` radius so a group of twelve does not pile up in the middle.
 */
export function layoutConstellation(summaries: ProjectSummary[]): ConstellationNode[] {
  const groups = new Map<string, ProjectSummary[]>();
  for (const summary of summaries) {
    const key = (summary.platforms.length > 0 ? summary.platforms : [summary.project.target.platform]).join("+");
    const bucket = groups.get(key);
    if (bucket) bucket.push(summary);
    else groups.set(key, [summary]);
  }

  const nodes: ConstellationNode[] = [];

  for (const [key, members] of groups) {
    const platforms = key.split("+") as Platform[];
    const territories = platforms.map((p) => TERRITORIES[p]).filter(Boolean);
    if (territories.length === 0) continue;

    const cx = territories.reduce((n, t) => n + t.cx, 0) / territories.length;
    const cy = territories.reduce((n, t) => n + t.cy, 0) / territories.length;
    // A group spanning several territories sits in the gap between them, which
    // is tighter than a territory's own interior — so shrink its spread.
    const spread =
      (territories.reduce((n, t) => n + t.r, 0) / territories.length) *
      (territories.length > 1 ? 0.45 : 1);

    // Sort by slug so the order members are drawn in is stable regardless of
    // the order the registry happens to list them.
    const ordered = [...members].sort((a, b) => a.project.slug.localeCompare(b.project.slug));

    ordered.forEach((summary, i) => {
      const slug = summary.project.slug;
      // A lone app sits dead centre in its territory; a crowd spirals out.
      const t = ordered.length === 1 ? 0 : Math.sqrt((i + 0.4) / ordered.length);
      const angle = i * GOLDEN_ANGLE + unit(slug) * Math.PI * 2;
      const jitter = 0.85 + unit(`${slug}:r`) * 0.3;

      const features = summary.catalog?.features ?? [];
      const walked = features.filter(isFeatureWalked).length;

      nodes.push({
        slug,
        name: summary.project.name,
        platforms,
        x: clamp01(cx + Math.cos(angle) * spread * t * jitter),
        y: clamp01(cy + Math.sin(angle) * spread * t * jitter),
        coverage: features.length === 0 ? 0 : walked / features.length,
        featureCount: features.length,
        walkedCount: walked,
        personaCount: summary.personaCount,
        staleness: summary.staleness.verdict,
        personas: [],
      });
    });
  }

  return nodes;
}

const clamp01 = (n: number) => Math.min(0.96, Math.max(0.04, n));

export interface ConstellationEdge {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** True when the edge crosses between territories rather than within one. */
  bridge: boolean;
}

/**
 * The lines that make it read as a constellation rather than a scatter plot.
 *
 * Two kinds, and the distinction is the whole point of the chart:
 *
 * - **Within a territory**, each app links to its nearest neighbour. This is
 *   pure figure-drawing — it turns three dots into a shape the eye can hold.
 * - **A bridge** links a multi-platform app back to each territory it spans.
 *   These are the informative lines: they are the only visual evidence that
 *   one app is documented on two platforms.
 *
 * Nearest-neighbour rather than a full mesh because a mesh of n apps is
 * n²/2 lines and stops being legible at about five.
 */
export function constellationEdges(nodes: ConstellationNode[]): ConstellationEdge[] {
  const edges: ConstellationEdge[] = [];

  // Bridges: multi-platform apps tethered to each territory centre.
  for (const node of nodes) {
    if (node.platforms.length < 2) continue;
    for (const platform of node.platforms) {
      const t = TERRITORIES[platform];
      if (t) edges.push({ from: { x: node.x, y: node.y }, to: { x: t.cx, y: t.cy }, bridge: true });
    }
  }

  // Figure lines: nearest neighbour inside each platform-set group.
  const byKey = new Map<string, ConstellationNode[]>();
  for (const node of nodes) {
    const key = node.platforms.join("+");
    const bucket = byKey.get(key);
    if (bucket) bucket.push(node);
    else byKey.set(key, [node]);
  }

  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const seen = new Set<string>();
    for (const a of group) {
      let best: ConstellationNode | null = null;
      let bestD = Infinity;
      for (const b of group) {
        if (a === b) continue;
        const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (!best) continue;
      // Dedupe the a→b / b→a pair.
      const pair = [a.slug, best.slug].sort().join("|");
      if (seen.has(pair)) continue;
      seen.add(pair);
      edges.push({ from: { x: a.x, y: a.y }, to: { x: best.x, y: best.y }, bridge: false });
    }
  }

  return edges;
}

/** Territories that actually have an app in them. */
export function occupiedTerritories(nodes: ConstellationNode[]): Territory[] {
  const live = new Set<Platform>();
  for (const node of nodes) for (const p of node.platforms) live.add(p);
  return PLATFORMS.filter((p) => live.has(p)).map((p) => TERRITORIES[p]);
}
