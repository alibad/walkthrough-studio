import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Markdown → readable plain text.
 *
 * For the two places markdown must NOT be rendered as markdown: a clamped
 * card teaser, where `<Prose>`'s block children fight `line-clamp`, and a
 * `<meta>` description, where a social preview would print the asterisks.
 *
 * Everywhere else, render through `<Prose>`. Dropping a raw markdown string
 * into a `<p>` is how `**whose**` ended up visible on a persona card.
 */
export function plainText(markdown: string | undefined): string {
  if (!markdown) return "";
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-+*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
