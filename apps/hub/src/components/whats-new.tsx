import { GitCommitHorizontal, RefreshCw } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { StalenessPill } from "@/components/status";
import { Plate } from "@/components/plate";
import type { Catalog, StalenessReport } from "@/lib/types";

/**
 * "What changed in the app since we last walked it?"
 *
 * The answer is a diff, so it's shown as one: commits, and which features
 * those commits plausibly touched. This is the card that turns a
 * documentation site into something with a maintenance signal — without it
 * you have a set of screenshots with no way to know if they're fiction.
 *
 * The affected-features list deliberately over-reports. Telling someone to
 * re-check a feature that turned out to be fine costs them a minute; failing
 * to flag one that silently broke costs them their trust in the whole hub.
 */
export function WhatsNew({
  slug,
  staleness,
  catalog,
  className,
}: {
  slug: string;
  staleness: StalenessReport;
  catalog: Catalog | null;
  className?: string;
}) {
  const featureName = (id: string) =>
    catalog?.features.find((f) => f.featureId === id)?.featureName ?? id;

  const hasDrift = staleness.commitsSince > 0;

  return (
    <section
      className={cn("rounded-md border border-rule bg-paper-raised", className)}
      aria-label="Changes since the last walkthrough"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <h2 className="font-serif text-title">Since the last walkthrough</h2>
        <StalenessPill staleness={staleness} />
      </header>

      <div className="px-4 py-3.5">
        {staleness.verdict === "never" && (
          <div className="flex items-start gap-4">
            <Plate
              src="/art/state-never-walked.png"
              width={1400}
              height={933}
              sizes="150px"
              className="hidden h-auto w-[9.5rem] shrink-0 self-center opacity-90 sm:block"
            />
            <p className="text-small leading-relaxed text-ink-muted">
            No walkthrough has been recorded for this app yet.
            {staleness.currentShaShort && (
              <>
                {" "}
                The target is currently at{" "}
                <code className="font-mono text-[0.8125rem] text-ink">
                  {staleness.currentShaShort}
                </code>
                .
              </>
            )}{" "}
            Run <code className="font-mono text-[0.8125rem] text-ink">/walkthrough</code> to
            capture one.
            </p>
          </div>
        )}

        {staleness.verdict === "unknown" && (
          <p className="text-small leading-relaxed text-ink-muted">
            Can&apos;t measure drift — {staleness.reason ?? "no readable local checkout"}. Set{" "}
            <code className="font-mono text-[0.8125rem] text-ink">codebase.local</code> in{" "}
            <code className="font-mono text-[0.8125rem] text-ink">projects.json</code> to a
            git checkout and this card starts working.
          </p>
        )}

        {(staleness.verdict === "fresh" ||
          staleness.verdict === "stale" ||
          staleness.verdict === "very-stale") && (
          <>
            <dl className="flex flex-wrap gap-x-8 gap-y-3 text-small">
              <div>
                <dt className="text-micro text-ink-faint">Walked at</dt>
                <dd className="mt-0.5 font-mono text-[0.8125rem] text-ink">
                  {staleness.lastRunShaShort ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-micro text-ink-faint">App now at</dt>
                <dd className="mt-0.5 font-mono text-[0.8125rem] text-ink">
                  {staleness.currentShaShort ?? "—"}
                  {staleness.dirty && (
                    <span
                      className="ml-1.5 text-warn"
                      title="The working tree has uncommitted changes"
                    >
                      +dirty
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-micro text-ink-faint">Commits since</dt>
                <dd className="mt-0.5 text-[0.8125rem] text-ink nums">
                  {staleness.commitsSince}
                </dd>
              </div>
              {staleness.ageDays !== null && (
                <div>
                  <dt className="text-micro text-ink-faint">Age</dt>
                  <dd className="mt-0.5 text-[0.8125rem] text-ink nums">
                    {Math.round(staleness.ageDays)} days
                  </dd>
                </div>
              )}
            </dl>

            {!hasDrift && (
              <p className="mt-3.5 text-small text-ink-muted">
                The app hasn&apos;t changed since this was captured.
              </p>
            )}

            {hasDrift && (
              <>
                <ul className="mt-4 space-y-2 border-t border-rule pt-3.5">
                  {staleness.commits.slice(0, 6).map((commit) => (
                    <li key={commit.sha} className="flex gap-2.5 text-small">
                      <GitCommitHorizontal
                        className="mt-0.5 size-3.5 shrink-0 text-ink-faint"
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="text-ink">{commit.subject}</span>
                        <span className="ml-2 font-mono text-micro text-ink-faint">
                          {commit.shaShort}
                        </span>
                      </span>
                    </li>
                  ))}
                  {staleness.commits.length > 6 && (
                    <li className="pl-6 text-micro text-ink-faint nums">
                      + {staleness.commits.length - 6} more
                    </li>
                  )}
                </ul>

                {staleness.affectedFeatures.length > 0 && (
                  <div className="mt-4 border-t border-rule pt-3.5">
                    <p className="mb-2 text-micro font-medium text-ink-muted">
                      Features these commits may have changed
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {staleness.affectedFeatures.map((id) => (
                        <li key={id}>
                          <Link
                            href={`/${slug}/features/${id}`}
                            className="inline-flex items-center gap-1 rounded-sm border border-warn/30 bg-warn-wash px-1.5 py-0.5 text-micro font-medium text-warn transition-colors hover:border-warn/60"
                          >
                            <RefreshCw className="size-2.5" aria-hidden />
                            {featureName(id)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
