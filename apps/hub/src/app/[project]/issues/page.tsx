import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Prose } from "@/components/prose";
import { getCatalog, getIssues, getProject } from "@/lib/data";
import { formatLocation } from "@/lib/platforms";
import type { CapturedIssue } from "@/lib/types";

/**
 * The issues a walk found, in full.
 *
 * The health banner on the project page summarises these into one line, which
 * is right for a banner and useless for acting on them — it truncates at six,
 * drops every description, and links nowhere. A reader who wants to know what
 * "the /admin gate is skipped" actually means had no way to find out.
 *
 * So: one page, every issue, full text, grouped by severity, each one pointing
 * at the feature it was found in.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ project: string }>;
}): Promise<Metadata> {
  const { project } = await params;
  const p = getProject(project);
  return { title: p ? `Findings — ${p.name}` : "Findings" };
}

const SEVERITY_ORDER: CapturedIssue["severity"][] = ["blocker", "major", "minor", "polish"];

const SEVERITY_COPY: Record<CapturedIssue["severity"], { label: string; note: string; tone: string }> = {
  blocker: {
    label: "Blocking",
    note: "Stops a feature being used, or exposes something that should be closed.",
    tone: "border-l-[3px] border-l-[#b4462f]",
  },
  major: {
    label: "Major",
    note: "Works, but a user would notice and mind.",
    tone: "border-l-[3px] border-l-[#b8860b]",
  },
  minor: { label: "Minor", note: "Small and real.", tone: "border-l-[3px] border-l-rule-strong" },
  polish: { label: "Polish", note: "Worth doing when nearby.", tone: "border-l-[3px] border-l-rule" },
};

export default async function IssuesPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  const p = getProject(project);
  if (!p) notFound();

  const catalog = getCatalog(project);
  const all = getIssues(project);
  const open = all.filter((i) => (i.status ?? "open") === "open");
  const closed = all.filter((i) => (i.status ?? "open") !== "open");
  const platform = catalog?.platform ?? "web";

  const featureName = (id?: string) =>
    catalog?.features.find((f) => f.featureId === id)?.featureName ?? id;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader crumbs={[{ label: p.name, href: `/${project}` }, { label: "Findings" }]} />

      <main className="mx-auto w-full max-w-[76rem] flex-1 px-6 py-10">
        <Link
          href={`/${project}`}
          className="inline-flex items-center gap-1.5 text-label text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.75} aria-hidden />
          {p.name}
        </Link>

        <header className="mt-4 max-w-[62ch]">
          <p className="eyebrow">Findings</p>
          <h1 className="display mt-2 text-[clamp(1.75rem,3.5vw,2.5rem)]">
            {open.length} open {open.length === 1 ? "finding" : "findings"}
          </h1>
          <p className="mt-3 text-body text-ink-muted">
            Recorded while walking, and deliberately <em>not</em> repaired — a walkthrough observes
            the product as the team committed it. Each one names where it was found so it can be
            reproduced.
          </p>
        </header>

        {all.length === 0 && (
          <p className="mt-10 text-small text-ink-faint">
            No findings recorded for this project yet.
          </p>
        )}

        {SEVERITY_ORDER.map((severity) => {
          const group = open.filter((i) => i.severity === severity);
          if (group.length === 0) return null;
          const copy = SEVERITY_COPY[severity];
          return (
            <section key={severity} className="mt-10">
              <div className="flex flex-wrap items-baseline gap-3 border-b border-rule pb-2">
                <h2 className="font-serif text-head text-ink">{copy.label}</h2>
                <span className="nums text-title text-ink-faint">{group.length}</span>
                <span className="text-small text-ink-faint">{copy.note}</span>
              </div>

              <ul className="mt-5 flex flex-col gap-5">
                {group.map((issue) => (
                  <li
                    key={issue.id}
                    id={issue.id}
                    className={`rounded-sm bg-paper-raised p-5 ${copy.tone}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <h3 className="font-serif text-title leading-tight text-ink">{issue.title}</h3>
                      <code className="font-mono text-micro text-ink-faint">{issue.id}</code>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {issue.location && (
                        <span className="locator">{formatLocation(issue.location, platform)}</span>
                      )}
                      {issue.featureId && (
                        <Link
                          href={`/${project}/features/${issue.featureId}`}
                          className="text-label text-ink-muted underline decoration-rule-strong underline-offset-2 transition-colors hover:text-ink"
                        >
                          {featureName(issue.featureId)}
                        </Link>
                      )}
                      {issue.surface && <span className="text-label text-ink-faint">{issue.surface}</span>}
                    </div>

                    {issue.detail && (
                      <Prose className="mt-3 text-small">{issue.detail}</Prose>
                    )}

                    {issue.evidence && (
                      <pre className="mt-3 overflow-x-auto rounded border border-rule bg-paper-sunken p-3 font-mono text-[0.75rem] leading-relaxed text-ink-muted">
                        {issue.evidence}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {closed.length > 0 && (
          <section className="mt-12">
            <h2 className="border-b border-rule pb-2 font-serif text-head text-ink">
              Closed
              <span className="nums ml-2.5 font-sans text-title text-ink-faint">{closed.length}</span>
            </h2>
            <ul className="mt-4 flex flex-col gap-2">
              {closed.map((issue) => (
                <li key={issue.id} className="flex flex-wrap items-baseline gap-3 border-t border-rule pt-2.5">
                  <span className="text-small text-ink-muted line-through">{issue.title}</span>
                  <span className="text-label text-ink-faint">{issue.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
