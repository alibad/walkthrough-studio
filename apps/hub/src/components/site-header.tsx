import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { GithubMark } from "@/components/brand/github-mark";
import { Logo } from "@/components/brand/logo";
import { REPO } from "@/lib/adoption";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The one piece of persistent chrome.
 *
 * A hairline rule and a lockup — no nav bar, no sidebar. The hub is a
 * document, and a document's navigation is its breadcrumbs plus the links in
 * its body. Anything more would be a frame competing with the plates.
 */
export function SiteHeader({
  crumbs = [],
  action,
  className,
}: {
  crumbs?: Crumb[];
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur-sm",
        className,
      )}
    >
      {/* The wordmark and the crumbs read as one line, so they are sized and
          led identically and the gaps around each chevron are symmetric.
          Before: the crumbs were `text-small` with default leading against the
          serif wordmark's `leading-none`, which put their baselines 4.1px apart,
          and `gap-3` outside the nav against `gap-1.5` inside it made every
          chevron hug the crumb to its right instead of sitting between the two.
          Both were measured in the browser, not eyeballed — if you touch the
          gaps or the type here, measure again rather than trusting the look at
          one zoom level. */}
      <div className="mx-auto flex h-14 max-w-[76rem] items-center gap-2 px-6">
        {/* `flex` on the anchor is load-bearing, not tidying. As a plain block
            it wrapped the inline-flex lockup in a line box, and the lockup
            baseline-aligned to that line box's strut — which is sized by the
            inherited body leading, not by anything in the lockup. The mark and
            wordmark therefore sat 3.5px above the centre of the header while
            the breadcrumb beside them sat exactly on it. Making the anchor a
            flex container removes the inline formatting context and the strut
            with it. */}
        <Link
          href="/"
          className="flex shrink-0 items-center rounded-sm transition-opacity hover:opacity-70"
          aria-label="Walkthrough Studio home"
        >
          <Logo size="sm" showStudio={crumbs.length === 0} />
        </Link>

        {crumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-2 text-[0.9375rem] leading-none"
          >
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-2">
                <ChevronRight className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="truncate text-ink-muted transition-colors hover:text-ink"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-ink" aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {action}
          {/* Persistent, quiet, and on every page: a reader who decides
              mid-walkthrough that they want this for their own app should not
              have to navigate home to find out how. */}
          <Link
            href="/use"
            className="hidden text-label text-ink-muted transition-colors hover:text-ink sm:inline"
          >
            Use it on your app
          </Link>
          <Link
            href={REPO.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center rounded-sm text-ink-faint transition-colors hover:text-ink"
            aria-label={`${REPO.owner}/${REPO.name} on GitHub`}
          >
            <GithubMark className="size-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Page footer. Credits the capture contract, which is the useful bit. */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-rule bg-paper-sunken/40", className)}>
      <div className="mx-auto flex max-w-[76rem] flex-col gap-3 px-6 py-8 text-small text-ink-faint sm:flex-row sm:items-center sm:justify-between">
        <p>
          Captures are written by the{" "}
          <code className="font-mono text-[0.8125rem] text-ink-muted">walkthrough</code> skill
          and read straight off disk. Nothing here is generated at request time.
        </p>
        <p className="flex shrink-0 items-center gap-3">
          <Link
            href="/use"
            className="text-ink-muted underline decoration-rule-strong underline-offset-2 transition-colors hover:text-ink"
          >
            Use it on your own app
          </Link>
          <span aria-hidden>·</span>
          <Link
            href={REPO.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-muted underline decoration-rule-strong underline-offset-2 transition-colors hover:text-ink"
          >
            {REPO.owner}/{REPO.name}
          </Link>
        </p>
      </div>
    </footer>
  );
}
