import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ATLAS_TERRITORIES,
  PRODUCT_ATLAS_DEFINITIONS,
} from "../apps/hub/src/lib/product-atlas";

const registry = JSON.parse(
  readFileSync(new URL("../apps/hub/projects.json", import.meta.url), "utf8"),
) as { projects: Array<{ slug: string }> };

test("the atlas groups every platform record into exactly one product", () => {
  const variantSlugs = PRODUCT_ATLAS_DEFINITIONS.flatMap((product) => product.slugs);
  const registrySlugs = registry.projects.map((project) => project.slug);

  assert.equal(PRODUCT_ATLAS_DEFINITIONS.length, 15);
  assert.equal(new Set(variantSlugs).size, variantSlugs.length);
  assert.deepEqual([...variantSlugs].sort(), [...registrySlugs].sort());
});

test("the five territories express human purpose rather than implementation platform", () => {
  assert.deepEqual(
    ATLAS_TERRITORIES.map((territory) => territory.id).sort(),
    [
      "applied-tools",
      "learning-discovery",
      "personal-growth",
      "planning-work",
      "practice-wellbeing",
    ],
  );

  const territoryOf = (id: string) =>
    PRODUCT_ATLAS_DEFINITIONS.find((product) => product.id === id)?.territory;

  assert.equal(territoryOf("breath-quest"), "practice-wellbeing");
  assert.equal(territoryOf("scribe-quest"), "planning-work");
  assert.equal(territoryOf("system-designer"), "learning-discovery");
  assert.equal(territoryOf("inner-quest"), "personal-growth");
  assert.equal(territoryOf("openstage"), "applied-tools");
});

test("multi-platform apps are represented once with their variants nested", () => {
  const slugsFor = (id: string) =>
    PRODUCT_ATLAS_DEFINITIONS.find((product) => product.id === id)?.slugs;

  assert.deepEqual(slugsFor("yoga-quest"), ["yoga-quest-web", "yoga-quest"]);
  assert.deepEqual(slugsFor("scribe-quest"), [
    "scribe-quest-web",
    "scribe-quest-ios",
    "scribe-quest-android",
  ]);
  assert.deepEqual(slugsFor("leela-quest"), [
    "leela-quest-web",
    "leela-quest-ios",
    "leela-quest-android",
  ]);
});
