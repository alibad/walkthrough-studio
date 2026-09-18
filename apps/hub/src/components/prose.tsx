"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

/**
 * Renders markdown from walkthrough content (step descriptions, overviews,
 * tips, key features). Safe by default — React-Markdown escapes raw HTML.
 *
 * `inline` mode strips outer paragraph spacing for use inside list items or
 * short blurbs. `block` mode keeps standard paragraph rhythm.
 */
export function Prose({
  children,
  inline = false,
  className,
}: {
  children: string | null | undefined;
  inline?: boolean;
  className?: string;
}) {
  if (!children) return null;

  // Inline mode wraps in <span> so it's safe to embed inside phrasing-only
  // parents like <h2> / <p> without producing invalid HTML.
  const Wrapper = inline ? "span" : "div";

  return (
    <Wrapper
      className={cn(
        "prose-walkthrough",
        inline ? "prose-inline" : "prose-block",
        className,
      )}
    >
      <ReactMarkdown
        components={{
          // Inline mode: collapse <p> to a plain span so we don't get margin.
          p: inline
            ? ({ children }) => <>{children}</>
            : ({ children }) => (
                <p className="leading-relaxed text-inherit [&:not(:last-child)]:mb-3">
                  {children}
                </p>
              ),
          strong: ({ children }) => (
            <strong className="font-semibold text-ink">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="font-mono text-[0.9em] px-1 py-0.5 rounded bg-paper-sunken text-ink">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline decoration-brand/40 hover:decoration-brand underline-offset-2"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 space-y-1 text-inherit">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-1 text-inherit">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => (
            <h3 className="text-title font-semibold mt-4 mb-2">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="text-title font-semibold mt-4 mb-2">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="text-body font-semibold mt-3 mb-1.5">{children}</h4>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </Wrapper>
  );
}
