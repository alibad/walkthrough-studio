import { assetExists, assetUrl, getProject, getWalkthrough } from "./data";
import { PLATFORM_PROFILES } from "./platforms";
import type { Platform } from "./types";

/**
 * The example walkthroughs on the home page.
 *
 * Chosen by hand for range (a web deck, a terminal, two native phones, two
 * learning apps), but every word and picture on the card is read from the
 * walkthrough file on disk, so a re-walk updates the card. A pick whose file or
 * first screenshot has gone missing is dropped rather than drawn broken.
 */
const PICKS: { slug: string; featureId: string; surface: string }[] = [
  { slug: "openstage", featureId: "deck-scroll", surface: "desktop" },
  { slug: "doneos", featureId: "generated-contract", surface: "terminal" },
  { slug: "scribe-quest-ios", featureId: "native-conversation-capture", surface: "iphone" },
  { slug: "system-designer", featureId: "capacity-planning-lab", surface: "desktop" },
  { slug: "leela-quest-android", featureId: "native-first-run", surface: "android" },
  { slug: "globe-quest", featureId: "world-explorer", surface: "desktop" },
];

export interface HomeExample {
  href: string;
  product: string;
  platform: Platform;
  platformLabel: string;
  headline: string;
  image: string;
  alt: string;
  steps: number;
  capturedAt: string | null;
  phone: boolean;
}

export function getHomeExamples(): HomeExample[] {
  const out: HomeExample[] = [];
  for (const pick of PICKS) {
    const project = getProject(pick.slug);
    const walk = getWalkthrough(pick.slug, pick.featureId, pick.surface);
    const first = walk?.steps?.[0];
    if (!project || !walk || !first?.screenshotFilename) continue;
    if (!assetExists(pick.slug, first.screenshotFilename)) continue;
    const platform = walk.platform;
    out.push({
      href: `/${pick.slug}/features/${pick.featureId}`,
      product: project.name.split(" · ")[0],
      platform,
      platformLabel: platform === "cli" ? "Terminal" : PLATFORM_PROFILES[platform].short,
      headline: walk.headline || walk.featureName,
      image: assetUrl(pick.slug, first.screenshotFilename),
      alt: first.screenshotAlt || `${walk.featureName}, first captured step`,
      steps: walk.steps.length,
      capturedAt: walk.capturedAt ?? walk.generatedAt ?? null,
      phone: platform === "ios" || platform === "android",
    });
  }
  return out;
}
