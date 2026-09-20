import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { GithubMark } from "@/components/brand/github-mark";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { INSTALL_PATHS, INVARIANT_PROMISES, REPO } from "@/lib/adoption";

export const metadata: Metadata = {
  // The root layout already appends the suite name via a title template.
  title: "Use it on your own app",
  description:
    "Install the walkthrough skill in Claude Code, Codex or any agent with a shell, and publish what it captures to your own hub.",
};

/**
 * The adoption page.
 *
 * Everything else in this hub is evidence about one app. This page is the
 * only one addressed to a reader who wants the method rather than the
 * artifacts, so it is written as instructions and not as a pitch: three
 * install paths, what the thing guarantees, and where the guarantees are
 * enforced so a sceptic can go and read them.
 */
export default function UsePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader crumbs={[{ label: "Use it on your own app" }]} />

      <main className="mx-auto w-full max-w-[76rem] flex-1 px-6 py-12">
        <header className="max-w-[62ch]">
          <p className="eyebrow">Adopt the pattern</p>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.75rem)]">
            Point it at your app and publish what it saw
          </h1>
          <p className="mt-4 text-body text-ink-muted">
            The walkthrough skill is a directory of markdown and a capture layer that refuses to
            publish a misleading artifact. Neither is specific to this repository — install the
            plugin, run it against your own product, and the same contract applies.
          </p>
          <p className="mt-3 text-small text-ink-faint">
            MIT licensed ·{" "}
            <Link
              href={REPO.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-ink-muted underline decoration-rule-strong underline-offset-2 transition-colors hover:text-accent"
            >
              <GithubMark className="size-3.5" />
              {REPO.owner}/{REPO.name}
              <ArrowUpRight className="size-3" strokeWidth={1.75} aria-hidden />
            </Link>
          </p>
        </header>

        {/* ── Install paths ──────────────────────────────────────────────── */}
        <section className="mt-12">
          <div className="rule-h" />
          <h2 className="mt-6 font-serif text-head text-ink">Three ways in</h2>
          <p className="mt-2 max-w-[60ch] text-small text-ink-muted">
            The skill is runtime-agnostic by construction: it describes what to do, and the
            drivers describe how to do it per platform. Pick whichever matches your setup.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {INSTALL_PATHS.map((path) => (
              <article
                key={path.id}
                className="flex flex-col rounded-md border border-rule bg-paper-raised p-5"
              >
                <h3 className="font-serif text-[1.0625rem] text-ink">{path.runtime}</h3>
                <p className="mt-1.5 text-small text-ink-muted">{path.summary}</p>

                <ol className="mt-4 flex flex-1 flex-col gap-3.5">
                  {path.steps.map((step, i) => (
                    <li key={step.label} className="flex flex-col gap-1.5">
                      <span className="flex items-baseline gap-2 text-label font-medium text-ink">
                        <span className="nums text-ink-faint">{i + 1}</span>
                        {step.label}
                      </span>
                      {step.command && (
                        <code className="block rounded border border-rule bg-paper-sunken px-2.5 py-1.5 font-mono text-[0.75rem] leading-relaxed text-ink [overflow-wrap:anywhere]">
                          {step.command}
                        </code>
                      )}
                      {step.detail && (
                        <span className="text-[0.8125rem] leading-relaxed text-ink-faint">
                          {step.detail}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>

        {/* ── What it guarantees ─────────────────────────────────────────── */}
        <section className="mt-14">
          <div className="rule-h" />
          <h2 className="mt-6 font-serif text-head text-ink">What it refuses to get wrong</h2>
          <p className="mt-2 max-w-[64ch] text-small text-ink-muted">
            These are enforced in one place, for every capture backend, and each is{" "}
            <em>verified by measurement</em> rather than trusted from a configuration flag — a
            backend that accepts a Retina setting and writes 1x pixels fails the walk at the first
            capture. Each run records which of them it actually proved, in its run manifest.
          </p>

          <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {INVARIANT_PROMISES.map((inv) => (
              <div key={inv.id} className="border-t border-rule pt-3.5">
                <dt className="text-label font-medium text-ink">{inv.label}</dt>
                <dd className="mt-1 text-small text-ink-muted">{inv.promise}</dd>
                <dd className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-faint">
                  Without it: {inv.breaks}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Where to look ──────────────────────────────────────────────── */}
        <section className="mt-14">
          <div className="rule-h" />
          <h2 className="mt-6 font-serif text-head text-ink">Read it before you trust it</h2>
          <p className="mt-2 max-w-[64ch] text-small text-ink-muted">
            A tool that claims its output is trustworthy should be easy to audit. These are the
            files worth opening first.
          </p>

          <ul className="mt-5 flex flex-col gap-3">
            {[
              {
                path: "plugins/walkthrough/skills/walkthrough/SKILL.md",
                what: "The skill itself — what an agent is told to do, and what it is told never to do.",
              },
              {
                path: "scripts/lib/capture/invariants.mjs",
                what: "The invariants and their assertions. Every check carries the failure that motivated it.",
              },
              {
                path: "scripts/lib/capture/session.mjs",
                what: "Where the invariants are applied, identically, regardless of which backend is running.",
              },
              {
                path: "scripts/lib/capture/driver-contract.mjs",
                what: "The backend interface. Implement it and declare your capabilities; the session verifies them.",
              },
              {
                path: "docs/findings/capture-backends-2026-09-18.md",
                what: "The measurements behind the architecture: which backends can meet which invariant, and how that was tested.",
              },
              {
                path: "scripts/verify-capture-layer.mjs",
                what: "Run the same walk through every backend and watch the guarantees hold — or fail out loud.",
              },
            ].map((row) => (
              <li key={row.path} className="flex flex-col gap-1 border-t border-rule pt-3 sm:flex-row sm:items-baseline sm:gap-4">
                <Link
                  href={`${REPO.url}/blob/main/${row.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="locator shrink-0 transition-colors hover:text-accent"
                >
                  {row.path}
                </Link>
                <span className="text-small text-ink-muted">{row.what}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Pointing the hub at your app ───────────────────────────────── */}
        <section className="mt-14">
          <div className="rule-h" />
          <h2 className="mt-6 font-serif text-head text-ink">Your own hub</h2>
          <p className="mt-2 max-w-[64ch] text-small text-ink-muted">
            The skill writes JSON and PNGs into{" "}
            <code className="font-mono text-[0.8125rem] text-ink-muted">
              apps/hub/public/walkthroughs/&#123;slug&#125;/
            </code>
            . The hub reads them straight off disk with no build step and no request-time
            generation, so a walk is visible the moment it finishes.
          </p>
          <ol className="mt-5 flex flex-col gap-3.5">
            {[
              { label: "Register your app", command: "pnpm new-project" },
              { label: "Install a browser for the default backend", command: "npx playwright install chromium" },
              { label: "Walk it", command: "/walkthrough" },
              { label: "Read it", command: "pnpm dev" },
            ].map((step, i) => (
              <li key={step.label} className="flex flex-wrap items-baseline gap-3 border-t border-rule pt-3">
                <span className="nums text-label text-ink-faint">{i + 1}</span>
                <span className="text-label font-medium text-ink">{step.label}</span>
                <code className="rounded border border-rule bg-paper-sunken px-2.5 py-1 font-mono text-[0.75rem] text-ink">
                  {step.command}
                </code>
              </li>
            ))}
          </ol>
          <p className="mt-5 max-w-[64ch] text-[0.8125rem] leading-relaxed text-ink-faint">
            No Playwright browser on the machine? The capture layer falls back to a Chrome you
            already have, over the DevTools protocol, with no npm dependency — and says so in the
            run manifest, because that backend cannot record video and you should know which
            artifacts came from which.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
