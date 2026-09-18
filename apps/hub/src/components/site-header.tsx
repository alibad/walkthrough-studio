import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
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
      <div className="mx-auto flex h-14 max-w-[76rem] items-center gap-3 px-6">
        <Link
          href="/"
          className="shrink-0 rounded-sm transition-opacity hover:opacity-70"
          aria-label="Walkthrough Studio home"
        >
          <Logo size="sm" showStudio={crumbs.length === 0} />
        </Link>

        {crumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1.5 text-small"
          >
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
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

        <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>
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
        <p className="shrink-0">Walkthrough Studio</p>
      </div>
    </footer>
  );
}
