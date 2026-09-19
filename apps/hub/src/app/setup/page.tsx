import type { Metadata } from "next";
import Link from "next/link";
import { Check, CircleHelp, X } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { VerifyPanel } from "./verify-panel";
import {
  getCapabilityModel,
  getRegistryCredentials,
  isLocalHub,
  type Capability,
  type CapabilityProvider,
} from "@/lib/capabilities";

export const metadata: Metadata = {
  title: "What it needs",
  description:
    "Every capability this system uses, which of them need an API key, and exactly what degrades when one is missing.",
};

/**
 * The configuration page.
 *
 * Written to answer the question people actually arrive with — "do I need an
 * API key?" — with the honest answer, which is *mostly no, and here is the
 * short list of exceptions*. The old answer was a stack trace six minutes into
 * a walk naming a variable, which tells you what is missing and nothing about
 * whether it mattered.
 *
 * The deployed copy of this page shows the model and not the machine. See the
 * note in lib/capabilities.ts for why that is the honest shape rather than a
 * limitation.
 */

const KIND_LABEL: Record<CapabilityProvider["kind"], string> = {
  host: "No key — the agent does it",
  api: "Needs a key",
  local: "Local tool",
};

function CapabilityCard({ capability }: { capability: Capability }) {
  const needsKey = capability.providers.some((p) => p.kind === "api");
  const hostCovers = capability.providers.some((p) => p.kind === "host" && !p.requiresHostImages);

  return (
    <article className="rounded-md border border-rule bg-paper-raised p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-title text-ink">{capability.name}</h3>
        <span className="text-micro uppercase tracking-[0.08em] text-ink-faint">
          {capability.required ? "Required" : "Optional"}
        </span>
      </div>

      <p className="mt-2 text-small text-ink-muted">{capability.for}</p>

      {hostCovers && (
        <p className="mt-2 text-small text-[#2f7d4f]">
          No key needed — the agent running the walk already does this.
        </p>
      )}

      <div className="mt-4">
        <p className="eyebrow">Satisfied by</p>
        <ul className="mt-2 flex flex-col gap-2.5">
          {capability.providers.map((p) => {
            return (
              <li key={p.id} className="border-l-2 border-rule pl-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-label font-medium text-ink">{p.name}</span>
                  <span className="text-micro text-ink-faint">{KIND_LABEL[p.kind]}</span>
                </div>
                {p.note && <p className="mt-0.5 text-small text-ink-muted">{p.note}</p>}
                {p.env && p.env.length > 0 && (
                  <p className="mt-1 font-mono text-micro text-ink-faint">{p.env.join(" · ")}</p>
                )}
                {p.install && (
                  <p className="mt-1 font-mono text-micro text-ink-faint">{p.install}</p>
                )}
                {p.requiresBinaries && (
                  <p className="mt-1 font-mono text-micro text-ink-faint">
                    needs {p.requiresBinaries.join(", ")} on PATH
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 border-t border-rule pt-3">
        <p className="eyebrow">Without it</p>
        <p className="mt-1 text-small text-ink-muted">{capability.without}</p>
      </div>

      {needsKey && capability.usedBy.length > 0 && (
        <p className="mt-3 font-mono text-micro text-ink-faint">{capability.usedBy.join("  ·  ")}</p>
      )}
    </article>
  );
}

export default function SetupPage() {
  const model = getCapabilityModel();
  const local = isLocalHub();
  const credentials = getRegistryCredentials();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader crumbs={[{ label: "What it needs" }]} />

      <main className="mx-auto w-full max-w-[76rem] flex-1 px-6 py-12">
        <header className="max-w-[64ch]">
          <p className="eyebrow">Configuration</p>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.75rem)]">
            {model.principle.headline}
          </h1>
          <p className="mt-4 text-body text-ink-muted">{model.principle.body}</p>
        </header>

        {/* ── Which host, and what that changes ───────────────────────────── */}
        <section className="mt-12">
          <div className="rule-h" />
          <h2 className="mt-6 font-serif text-head text-ink">It depends who is driving</h2>
          <p className="mt-2 max-w-[62ch] text-small text-ink-muted">
            The walk is run by an agent, and agents differ in exactly one way that matters here:
            whether they can hand back an image file. That single difference decides whether this
            repo needs an image provider at all.
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-rule-strong">
                  <th className="pb-2 pr-4 text-label font-medium text-ink">Host</th>
                  <th className="pb-2 pr-4 text-label font-medium text-ink">Makes images?</th>
                  <th className="pb-2 pr-4 text-label font-medium text-ink">Detected by</th>
                  <th className="pb-2 text-label font-medium text-ink">So</th>
                </tr>
              </thead>
              <tbody>
                {model.hosts.map((host) => (
                  <tr key={host.id} className="border-b border-rule align-top">
                    <td className="py-3 pr-4 text-small text-ink">{host.name}</td>
                    <td className="py-3 pr-4">
                      {host.canGenerateImages === true ? (
                        <span className="inline-flex items-center gap-1.5 text-small text-[#2f7d4f]">
                          <Check className="size-3.5" strokeWidth={2} aria-hidden /> Yes
                        </span>
                      ) : host.canGenerateImages === "ask" ? (
                        <span className="inline-flex items-center gap-1.5 text-small text-[#b8860b]">
                          <CircleHelp className="size-3.5" strokeWidth={2} aria-hidden /> Ask it
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-small text-ink-faint">
                          <X className="size-3.5" strokeWidth={2} aria-hidden /> No
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {host.detectEnv ? (
                        <code className="font-mono text-micro text-ink-muted">
                          {host.detectEnv}
                        </code>
                      ) : (
                        <span className="text-micro text-ink-faint">nothing</span>
                      )}
                      <p className="mt-1 max-w-[30ch] text-micro text-ink-faint">
                        {host.detectNote}
                      </p>
                    </td>
                    <td className="py-3 max-w-[34ch] text-small text-ink-muted">
                      {host.consequence}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 max-w-[62ch] text-small text-ink-muted">
            Detection is a hint and never a claim: a host that sets no marker is not assumed to
            lack a capability, and one that sets a marker can still be wrong about itself. Say it
            outright to settle it —{" "}
            <code className="font-mono text-micro text-ink">WALKTHROUGH_IMAGE_PROVIDER=host</code>{" "}
            to make the agent draw the plates,{" "}
            <code className="font-mono text-micro text-ink">=api</code> to force the provider, or{" "}
            <code className="font-mono text-micro text-ink">=none</code> to opt out of generated
            art entirely, after which its absence stops being reported as a gap.
          </p>
        </section>

        {/* ── This machine ───────────────────────────────────────────────── */}
        <section className="mt-12">
          <div className="rule-h" />
          <h2 className="mt-6 font-serif text-head text-ink">
            {local ? "On this machine" : "Checking your own machine"}
          </h2>

          {local ? (
            <>
              <p className="mt-2 max-w-[62ch] text-small text-ink-muted">
                This page holds no state of its own — it renders the model above and asks{" "}
                <code className="font-mono text-micro text-ink">pnpm doctor</code>{" "}
                for everything about this machine. That keeps one implementation of &ldquo;does this
                credential work&rdquo;, so the page and the command can never disagree about it.
              </p>
              <VerifyPanel />
            </>
          ) : (
            <div className="mt-4 max-w-[68ch] rounded-md border border-rule bg-paper-raised p-5">
              <p className="text-small text-ink-muted">
                This is the published hub. It holds no credentials and needs none — it reads
                committed artifacts and renders them, and never calls a model. So there is nothing
                here to report on, and a page that claimed otherwise would be reporting on someone
                else&rsquo;s laptop.
              </p>
              <p className="mt-3 text-small text-ink-muted">
                Run it against your own checkout to see live status, including a button that
                verifies each key against the real endpoint:
              </p>
              <pre className="mt-3 overflow-x-auto rounded border border-rule bg-paper-sunken p-3 font-mono text-[0.75rem] leading-relaxed text-ink-muted">
                {"pnpm doctor        # the same report, in the terminal\npnpm dev           # then open /setup"}
              </pre>
            </div>
          )}
        </section>

        {/* ── The capabilities ───────────────────────────────────────────── */}
        <section className="mt-12">
          <div className="rule-h" />
          <h2 className="mt-6 font-serif text-head text-ink">Every capability, and its fallback</h2>
          <p className="mt-2 max-w-[62ch] text-small text-ink-muted">
            One of these is required. The rest degrade — and degrading means the page says what is
            missing, never that it quietly publishes something weaker and lets you assume it is
            complete.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {model.capabilities.map((capability) => (
              <CapabilityCard key={capability.id} capability={capability} />
            ))}
          </div>
        </section>

        {/* ── Target-app credentials ─────────────────────────────────────── */}
        {credentials.length > 0 && (
          <section className="mt-12">
            <div className="rule-h" />
            <h2 className="mt-6 font-serif text-head text-ink">Credentials the registry asks for</h2>
            <p className="mt-2 max-w-[62ch] text-small text-ink-muted">
              <code className="font-mono text-micro text-ink">projects.json</code> is committed, so
              it names a variable and never holds a value. A missing one does not stop a walk: the
              gated feature is recorded as pending with the reason, and a finding is filed. It is
              never unblocked by editing the app being walked.
            </p>

            <ul className="mt-5 flex flex-col gap-3">
              {credentials.map((cred) => (
                <li
                  key={`${cred.project}-${cred.name}`}
                  className="rounded-sm bg-paper-raised p-4"
                >
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <code className="font-mono text-small text-ink">{cred.name}</code>
                    <span className="locator">{cred.project}</span>
                    <span className="text-micro text-ink-faint">{cred.role}</span>
                  </div>
                  {cred.note && <p className="mt-1.5 text-small text-ink-muted">{cred.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── What never happens ─────────────────────────────────────────── */}
        <section className="mt-12">
          <div className="rule-h" />
          <h2 className="mt-6 font-serif text-head text-ink">Where a key is, and is not</h2>
          <ul className="mt-4 flex max-w-[64ch] flex-col gap-2.5 text-small text-ink-muted">
            {[
              "A key lives in .env.local on the machine that runs the walk. That file is gitignored and is the only place a value exists.",
              "The hub never calls a model. Nothing it serves needs a credential, in development or in production.",
              "No key is ever sent to the browser. This page renders variable names and states; the values stay in the process that reads them.",
              "No command in this repo prints a key — not a prefix, not a length. A fingerprint of a key is still a fact about a key, and this output gets pasted into issues.",
              "projects.json names variables with a $VAR placeholder because it is committed. A literal password in it is the one configuration mistake that cannot be undone by rotating a file.",
            ].map((line) => (
              <li key={line} className="border-l-2 border-rule pl-3">
                {line}
              </li>
            ))}
          </ul>

          <p className="mt-6 text-small text-ink-muted">
            Installing the skill on your own app:{" "}
            <Link
              href="/use"
              className="text-ink underline decoration-rule-strong underline-offset-2 transition-colors hover:text-accent"
            >
              use it on your own app
            </Link>
            .
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
