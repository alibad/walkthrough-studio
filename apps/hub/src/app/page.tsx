import type { Metadata } from "next";
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION } from "@/lib/site";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Library } from "@/components/constellation/library";
import {
  HqFamilyFooter,
  HqHills,
  HqQuestbar,
  HqStones,
  HqSunset,
} from "@/components/hq-path/hq-path";
import { REPO } from "@/lib/adoption";
import { getAllProjectSummaries, getPersonas } from "@/lib/data";
import { getHomeExamples } from "@/lib/home-examples";
import { PLATFORM_PROFILES } from "@/lib/platforms";
import { buildProductAtlas } from "@/lib/product-atlas";
import { PLATFORMS, type PersonaSummary } from "@/lib/types";
// The kit CSS, this site's Path layer, the family fonts and the day/night
// script load for every page from the root layout.

export const metadata: Metadata = { title: { absolute: SITE_TITLE },description:SITE_DESCRIPTION,alternates:{canonical:SITE_URL},openGraph:{title:SITE_TITLE,description:SITE_DESCRIPTION,url:SITE_URL,type:"website",images:[`${SITE_URL}/art/og-card.png`]} };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const capturedOn = (iso: string | null) => {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

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
  const examples = getHomeExamples();
  const walked = products.reduce((sum, product) => sum + product.walkedCount, 0);
  const platforms = PLATFORMS.filter((platform) =>
    products.some((product) => product.platforms.includes(platform)),
  );

  return (
    <div className="hqp-page wt-home" data-hqp-t="pattern">
      <HqQuestbar
        product="Walkthrough Studio"
        logo="/brand/mark.svg"
        territory="pattern"
        links={[
          { label: "Atlas", href: "#atlas" },
          { label: "How it works", href: "#how" },
          { label: "Examples", href: "#examples" },
          { label: "GitHub", href: REPO.url },
        ]}
        cta={{ label: "Use it on your app", href: "/use" }}
      />

      <main>
        {/* The hero: the promise first, then the hand-drawn atlas laid out
            under the sun as the hero art. The atlas is the site's own identity
            and stays fully interactive (chart, list, product panel). */}
        <section className="hqp-hero wt-hero" id="atlas">
          <div className="wt-hero-in">
            <div className="wt-hero-copy">
              <p className="hqp-eyebrow">Walkthrough Studio · an AI pattern</p>
              <h1 className="hqp-display">
                Walk any app.
                <br />
                Publish what you <em>saw.</em>
              </h1>
              <p className="hqp-lede">
                An AI coding skill opens your real app on the web, a phone, the desktop or the
                terminal, walks every feature, and publishes the screens it captured.
              </p>
              <div className="hqp-ctas">
                <Link className="hqp-btn hqp-btn-solid" href="/use">
                  Use it on your app
                </Link>
                <a className="hqp-btn hqp-btn-ghost" href="#examples">
                  See real walkthroughs
                </a>
              </div>
            </div>

            <div className="wt-atlas">
              {/* `useSearchParams` in the library shell requires a Suspense boundary. */}
              <Suspense fallback={null}>
                <Library
                  products={products}
                  intro={
                    <div className="wt-atlas-intro">
                      <p className="hqp-eyebrow">
                        The atlas · {products.length} products
                      </p>
                      <p>
                        Five territories. The ring is what has been catalogued, the filled centre
                        what has been walked. Pick a product to open its walkthroughs.
                      </p>
                    </div>
                  }
                />
              </Suspense>
            </div>
          </div>
          <HqHills />
        </section>

        <section className="hqp-section wt-how" id="how">
          <div className="hqp-inner">
            <div className="hqp-head">
              <div>
                <p className="hqp-eyebrow">How it works</p>
                <h2 className="hqp-display">
                  From one command <br />
                  to <em>evidence.</em>
                </h2>
              </div>
              <p className="hqp-lede">
                It walks the running product, not a mockup, and refuses to publish a screen that
                could mislead.
              </p>
            </div>
            <HqStones
              steps={[
                {
                  title: "Install the skill",
                  text: (
                    <>
                      In Claude Code, Codex or any agent with a shell.{" "}
                      <code className="wt-code">/plugin marketplace add {REPO.marketplace}</code>
                    </>
                  ),
                },
                {
                  title: "Walk your app",
                  text: (
                    <>
                      Run <code className="wt-code">/walkthrough</code>. It lists every feature,
                      shows you the plan and the time, then captures each step on every platform
                      your app runs on.
                    </>
                  ),
                },
                {
                  title: "Publish and re-walk",
                  text: "The hub reads the captures straight off disk and shows how far your code has moved since the last walk.",
                },
              ]}
            />
            <div className="wt-checks">
              <p className="hqp-eyebrow">Every capture must pass</p>
              <div className="hqp-chips">
                <span>Retina pixels</span>
                <span>Nothing in motion</span>
                <span>Time pinned</span>
                <span>A fresh context per feature</span>
                <span>A real phone, not a narrow window</span>
                <span>Console and network kept</span>
                <span>No two captures alike</span>
              </div>
            </div>
          </div>
        </section>

        <section className="hqp-section hqp-tint" id="examples">
          <div className="hqp-inner">
            <div className="hqp-head">
              <div>
                <p className="hqp-eyebrow">Real walkthroughs</p>
                <h2 className="hqp-display">
                  Captured from the
                  <br />
                  <em>running</em> product.
                </h2>
              </div>
              <dl className="wt-stats">
                <div>
                  <dt>{products.length}</dt>
                  <dd>products on the atlas</dd>
                </div>
                <div>
                  <dt>{walked}</dt>
                  <dd>features walked</dd>
                </div>
                <div>
                  <dt>{platforms.length}</dt>
                  <dd>
                    platforms:{" "}
                    {platforms
                      .map((platform) =>
                        platform === "cli" ? "terminal" : PLATFORM_PROFILES[platform].short,
                      )
                      .join(", ")}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="hqp-cards wt-examples">
              {examples.map((example) => (
                <Link key={example.href} href={example.href} className="hqp-card wt-example">
                  <div className={example.phone ? "hqp-shot wt-shot wt-shot-phone" : "hqp-shot wt-shot"}>
                    <div className="wt-shot-frame">
                      <Image
                        src={example.image}
                        alt={example.alt}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 420px"
                      />
                    </div>
                  </div>
                  <div className="hqp-body">
                    <p className="wt-meta">
                      {example.product} · {example.platformLabel}
                    </p>
                    <h3>{example.headline}</h3>
                    <p className="wt-when">
                      {example.steps} {example.steps === 1 ? "step" : "steps"}
                      {capturedOn(example.capturedAt) && <> · captured {capturedOn(example.capturedAt)}</>}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="hqp-section wt-final">
          <div className="hqp-inner wt-final-in">
            <div>
              <p className="hqp-eyebrow">Open source · {REPO.license} licensed</p>
              <h2 className="hqp-display">
                Walk your <em>own</em> app.
              </h2>
              <p className="hqp-lede">{REPO.blurb}</p>
            </div>
            <div className="wt-final-side">
              <code className="wt-cmd">/plugin marketplace add {REPO.marketplace}</code>
              <div className="hqp-ctas">
                <Link className="hqp-btn hqp-btn-ember" href="/use">
                  Use it on your app
                </Link>
                <a
                  className="hqp-btn hqp-btn-ghost"
                  href={REPO.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read the code
                </a>
              </div>
              <p className="wt-small">
                A key is only needed for what the agent cannot do itself.{" "}
                <Link href="/setup">What it needs</Link>
              </p>
            </div>
          </div>
        </section>
      </main>

      <HqSunset />
      <HqFamilyFooter
        current="Walkthroughs"
        territory="pattern"
        extra={[
          { label: "Use it on your app", href: "/use" },
          { label: "What it needs", href: "/setup" },
          { label: `${REPO.owner}/${REPO.name}`, href: REPO.url },
        ]}
      />
    </div>
  );
}
