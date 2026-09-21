import type { PersonaSummary, Platform, ProjectSummary } from "./types";

export type AtlasTerritoryId =
  | "personal-growth"
  | "practice-wellbeing"
  | "learning-discovery"
  | "planning-work"
  | "applied-tools";

export interface AtlasTerritory {
  id: AtlasTerritoryId;
  name: string;
  motto: string;
  x: number;
  y: number;
}

export interface AtlasProductVariant {
  slug: string;
  name: string;
  platform: Platform;
  summary: ProjectSummary;
  personas: PersonaSummary[];
}

export interface AtlasProduct {
  id: string;
  name: string;
  description: string;
  territory: AtlasTerritoryId;
  x: number;
  y: number;
  variants: AtlasProductVariant[];
  platforms: Platform[];
  featureCount: number;
  walkedCount: number;
  screenshotCount: number;
  personaCount: number;
  issueCount: number;
  coverage: number;
}

export const ATLAS_TERRITORIES: AtlasTerritory[] = [
  {
    id: "practice-wellbeing",
    name: "Practice & Wellbeing",
    motto: "A calmer, more capable you",
    x: 0.2,
    y: 0.13,
  },
  {
    id: "learning-discovery",
    name: "Learning & Discovery",
    motto: "Knowledge in motion",
    x: 0.64,
    y: 0.12,
  },
  {
    id: "planning-work",
    name: "Planning & Work",
    motto: "A more intentional life",
    x: 0.12,
    y: 0.54,
  },
  {
    id: "personal-growth",
    name: "Personal Growth",
    motto: "A more conscious you",
    x: 0.48,
    y: 0.56,
  },
  {
    id: "applied-tools",
    name: "Applied Tools",
    motto: "Small bricks, larger worlds",
    x: 0.75,
    y: 0.56,
  },
];

interface ProductDefinition {
  id: string;
  name: string;
  description: string;
  territory: AtlasTerritoryId;
  slugs: string[];
  x: number;
  y: number;
}

/**
 * The atlas taxonomy is intentionally about the human purpose of a product,
 * not its implementation technology. Platform-specific walkthrough records
 * remain intact as variants inside each product.
 */
export const PRODUCT_ATLAS_DEFINITIONS: ProductDefinition[] = [
  {
    id: "breath-quest",
    name: "Breath Quest",
    description: "Wellness-focused play controlled by breath, claps, and other embodied input.",
    territory: "practice-wellbeing",
    slugs: ["breath-quest"],
    x: 0.12,
    y: 0.31,
  },
  {
    id: "handstand-quest",
    name: "Handstand Quest",
    description: "AI-guided training for strength, balance, and a measurable handstand practice.",
    territory: "practice-wellbeing",
    slugs: ["handstand-quest-web", "handstand-quest-ios"],
    x: 0.25,
    y: 0.28,
  },
  {
    id: "yoga-quest",
    name: "Yoga Quest",
    description: "A native practice studio and web class library for thoughtful yoga progression.",
    territory: "practice-wellbeing",
    slugs: ["yoga-quest-web", "yoga-quest"],
    x: 0.4,
    y: 0.24,
  },
  {
    id: "globe-quest",
    name: "Globe Quest",
    description: "Language, culture, and practical guidance for arriving in a new country.",
    territory: "learning-discovery",
    slugs: ["globe-quest"],
    x: 0.61,
    y: 0.28,
  },
  {
    id: "wikipedia",
    name: "Wikipedia",
    description: "The shipped reference walk for searching, reading, and inspecting revision history.",
    territory: "learning-discovery",
    slugs: ["wikipedia"],
    x: 0.75,
    y: 0.27,
  },
  {
    id: "system-designer",
    name: "System Designer",
    description: "Interactive learning for system design, ML systems, and GenAI architecture.",
    territory: "learning-discovery",
    slugs: ["system-designer"],
    x: 0.63,
    y: 0.43,
  },
  {
    id: "polytyper",
    name: "Polytyper",
    description: "A multilingual typing, translation, and language-practice hub.",
    territory: "learning-discovery",
    slugs: ["polytyper"],
    x: 0.78,
    y: 0.43,
  },
  {
    id: "doneos",
    name: "DoneOS",
    description: "One accountable execution system for human and AI work.",
    territory: "planning-work",
    slugs: ["doneos"],
    x: 0.12,
    y: 0.7,
  },
  {
    id: "calendar-clarity",
    name: "Calendar Clarity",
    description: "A calmer calendar with focused color, event actions, and less visual noise.",
    territory: "planning-work",
    slugs: ["calendar-clarity"],
    x: 0.25,
    y: 0.66,
  },
  {
    id: "scribe-quest",
    name: "Scribe Quest",
    description: "Turn important conversations into summaries, relationship context, and follow-up.",
    territory: "planning-work",
    slugs: ["scribe-quest-web", "scribe-quest-ios", "scribe-quest-android"],
    x: 0.17,
    y: 0.82,
  },
  {
    id: "plan-quest",
    name: "Plan Quest",
    description: "Turn aspirations into milestones, priorities, timelines, and decisions.",
    territory: "planning-work",
    slugs: ["plan-quest"],
    x: 0.31,
    y: 0.82,
  },
  {
    id: "inner-quest",
    name: "Inner Quest",
    description: "A private Personal OS for character, relationships, career, and wellbeing.",
    territory: "personal-growth",
    slugs: ["inner-quest"],
    x: 0.48,
    y: 0.73,
  },
  {
    id: "leela-quest",
    name: "Leela Quest",
    description: "The ancient Game of Leela adapted for guided self-discovery and reflection.",
    territory: "personal-growth",
    slugs: ["leela-quest-web", "leela-quest-ios", "leela-quest-android"],
    x: 0.61,
    y: 0.74,
  },
  {
    id: "openstage",
    name: "Openstage",
    description: "A cue-driven presentation platform for live events, training, and community stages.",
    territory: "applied-tools",
    slugs: ["openstage"],
    x: 0.75,
    y: 0.68,
  },
  {
    id: "autobounds",
    name: "AutoBounds",
    description: "AI-assisted field-boundary mapping and export for agricultural teams.",
    territory: "applied-tools",
    slugs: ["autobounds"],
    x: 0.86,
    y: 0.81,
  },
];

const PLATFORM_ORDER: Platform[] = ["web", "ios", "android", "desktop", "cli"];

export function buildProductAtlas(
  summaries: ProjectSummary[],
  personasBySlug: Record<string, PersonaSummary[]>,
): AtlasProduct[] {
  const bySlug = new Map(summaries.map((summary) => [summary.project.slug, summary]));

  return PRODUCT_ATLAS_DEFINITIONS.flatMap((definition) => {
    const variants = definition.slugs.flatMap((slug) => {
      const summary = bySlug.get(slug);
      return summary
        ? [
            {
              slug,
              name: summary.project.name,
              platform: summary.project.target.platform,
              summary,
              personas: personasBySlug[slug] ?? [],
            } satisfies AtlasProductVariant,
          ]
        : [];
    });

    if (variants.length === 0) return [];

    const platforms = new Set<Platform>();
    for (const variant of variants) {
      platforms.add(variant.platform);
      for (const platform of variant.summary.platforms) platforms.add(platform);
    }

    const featureCount = variants.reduce((sum, variant) => sum + variant.summary.featureCount, 0);
    const walkedCount = variants.reduce((sum, variant) => sum + variant.summary.walkedCount, 0);
    const screenshotCount = variants.reduce(
      (sum, variant) => sum + variant.summary.screenshotCount,
      0,
    );
    const issueCount = variants.reduce((sum, variant) => sum + variant.summary.issueCount, 0);
    const personaIds = new Set(
      variants.flatMap((variant) => variant.personas.map((persona) => persona.id)),
    );

    return [
      {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        territory: definition.territory,
        x: definition.x,
        y: definition.y,
        variants,
        platforms: PLATFORM_ORDER.filter((platform) => platforms.has(platform)),
        featureCount,
        walkedCount,
        screenshotCount,
        personaCount: personaIds.size,
        issueCount,
        coverage: featureCount === 0 ? 0 : walkedCount / featureCount,
      },
    ];
  });
}
