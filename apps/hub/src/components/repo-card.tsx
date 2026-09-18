import Link from "next/link";
import { ArrowUpRight, Terminal } from "lucide-react";
import { GithubMark } from "@/components/brand/github-mark";
import { REPO } from "@/lib/adoption";
import { cn } from "@/lib/utils";

/**
 * The repository card.
 *
 * The hub's job is to make artifacts believable; this card's job is to make
 * the *method* reusable. Someone who reads a walkthrough here and wants the
 * same thing for their own app should not have to guess where the skill lives
 * or whether it is usable outside this repo.
 *
 * It states the install command inline rather than linking to a README,
 * because the shortest honest distance between "I want this" and "it is
 * running" is one line you can copy.
 */
export function RepoCard({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "flex flex-col gap-4 rounded-md border border-rule bg-paper-raised p-5 sm:flex-row sm:items-center sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="eyebrow">Open source</p>
        <h2 className="mt-1.5 font-serif text-[1.0625rem] leading-snug text-ink">
          <Link
            href={REPO.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-accent"
          >
            <GithubMark className="size-4 shrink-0 text-ink-faint" />
            {REPO.owner}/{REPO.name}
            <ArrowUpRight className="size-3.5 shrink-0 text-ink-faint" strokeWidth={1.75} aria-hidden />
          </Link>
        </h2>
        <p className="mt-1.5 max-w-[56ch] text-small text-ink-muted">{REPO.blurb}</p>
      </div>

      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        <code className="rounded border border-rule bg-paper-sunken px-3 py-2 font-mono text-label text-ink [overflow-wrap:anywhere]">
          /plugin marketplace add {REPO.marketplace}
        </code>
        <Link
          href="/use"
          className="inline-flex items-center gap-1.5 text-label font-medium text-ink transition-colors hover:text-accent"
        >
          <Terminal className="size-3.5" strokeWidth={1.75} aria-hidden />
          Use the skill on your own app
          <ArrowUpRight className="size-3" strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    </aside>
  );
}
