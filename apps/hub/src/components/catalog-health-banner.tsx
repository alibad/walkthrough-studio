import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import { Prose } from "@/components/prose";
import { cn } from "@/lib/utils";
import type { CatalogHealthReport } from "@/lib/catalog-health";

/**
 * Quality findings for a project's documentation.
 *
 * This is the app criticizing its own contents, and it's the reason the rest
 * can be believed. A hub that only ever renders what it was given is a
 * publishing tool; one that says "these three captures are byte-identical, so
 * nothing happened between those steps" is a check.
 *
 * Findings are shown in full, not collapsed behind a count. If there are so
 * many that the list is unwieldy, the answer is to fix them.
 */
export function CatalogHealthBanner({
  health,
  slug,
  openIssueCount = 0,
  className,
}: {
  health: CatalogHealthReport;
  /** Project slug, so a finding can link to the page that explains it. */
  slug?: string;
  /** Issues recorded during capture, as opposed to checks on the artifacts. */
  openIssueCount?: number;
  className?: string;
}) {
  const warnings = health.issues.filter((i) => i.severity === "warning");
  const notes = health.issues.filter((i) => i.severity === "info");

  if (health.issues.length === 0) {
    // Only worth asserting when there's something to assert *about*.
    if (health.totals.steps === 0) return null;
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-md border border-ok/25 bg-ok-wash px-4 py-3 text-small text-ok",
          className,
        )}
      >
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">Checks pass.</span> {health.totals.steps} steps,
          all with distinct captures and a recorded interaction.
        </p>
      </div>
    );
  }

  return (
    <section
      className={cn("rounded-md border border-rule bg-paper-raised", className)}
      aria-label="Documentation quality findings"
    >
      <header className="flex items-baseline justify-between gap-4 border-b border-rule px-4 py-3">
        <h2 className="font-serif text-title">Quality findings</h2>
        <p className="text-micro text-ink-faint nums">
          {warnings.length > 0 && (
            <span className="font-medium text-alert">
              {warnings.length} to fix
            </span>
          )}
          {warnings.length > 0 && notes.length > 0 && <span> · </span>}
          {notes.length > 0 && <span>{notes.length} to consider</span>}
        </p>
      </header>

      <ul className="divide-y divide-rule">
        {[...warnings, ...notes].map((issue) => (
          <li key={`${issue.kind}-${issue.title}`} className="flex gap-3 px-4 py-3.5">
            {issue.severity === "warning" ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alert" aria-hidden />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-note" aria-hidden />
            )}
            <div className="min-w-0">
              <h3 className="text-small font-semibold text-ink">{issue.title}</h3>
              <Prose className="mt-1 text-small">{issue.detail}</Prose>
              {/* The summary truncates at six findings and drops every
                  description, which is right for a banner and useless for
                  acting on them. Anyone who reads "the /admin gate is skipped"
                  and wants to know what that means needs somewhere to go. */}
              {issue.kind === "open-issues" && slug && (
                <Link
                  href={`/${slug}/issues`}
                  className="mt-2 inline-flex items-center gap-1.5 text-label font-medium text-ink transition-colors hover:text-accent"
                >
                  {openIssueCount > 0
                    ? `Read all ${openIssueCount} findings`
                    : "Read all findings"}
                  <ArrowRight className="size-3.5" strokeWidth={1.75} aria-hidden />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      {health.totals.steps > 0 && (
        <footer className="border-t border-rule bg-paper-sunken/50 px-4 py-2.5 text-micro text-ink-faint">
          Scanned {health.totals.steps} steps ·{" "}
          <span className="nums">{health.totals.liveSteps}</span> captured live
          {health.totals.syntheticSteps > 0 && (
            <>
              {" "}
              · <span className="nums">{health.totals.syntheticSteps}</span> described
              only
            </>
          )}
        </footer>
      )}
    </section>
  );
}
