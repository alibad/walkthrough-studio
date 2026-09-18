import { cn } from "@/lib/utils";

/**
 * The Walkthrough Studio mark.
 *
 * Three offset plates — a captured screen, and the two behind it. It depicts
 * the thing the product actually makes: an ordered stack of states you can
 * step through. The vermilion dot marks the current one.
 *
 * Drawn to survive 16px: the two rear plates contribute only their top and
 * right edges, so at favicon size the glyph resolves to one clear frame with
 * a red dot rather than three muddled rectangles. Strokes use `currentColor`
 * so the mark inherits ink from whatever it sits in.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-6", className)}
    >
      {/* Rear plate — edges only. */}
      <path
        d="M11 4.75h17.25v13.5"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Middle plate — edges only, one step nearer. */}
      <path
        d="M7.5 9.25h17.25v13.5"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Front plate — the current state. */}
      <rect
        x="3.1"
        y="13.6"
        width="18.3"
        height="13.8"
        rx="1.9"
        fill="var(--paper-raised, #fffefc)"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {/* The "you are here" dot. The single use of the accent in the mark. */}
      <circle cx="7.2" cy="17.7" r="1.45" fill="var(--brand, #b4462f)" />
      {/* Two content rules — dropped below ~20px by the consumer if needed. */}
      <path
        d="M11.2 17.7h6.6M6.6 22.4h11.2"
        stroke="currentColor"
        strokeOpacity="0.32"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Mark plus wordmark. The name is set in the serif with the second word in
 * muted ink — one lockup, two weights of attention.
 */
export function Logo({
  className,
  size = "default",
  showStudio = true,
}: {
  className?: string;
  size?: "default" | "sm";
  showStudio?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      <Mark className={size === "sm" ? "size-5" : "size-6"} />
      <span
        className={cn(
          "font-serif leading-none tracking-[-0.015em]",
          size === "sm" ? "text-[0.9375rem]" : "text-[1.0625rem]",
        )}
      >
        Walkthrough
        {showStudio && <span className="text-ink-faint"> Studio</span>}
      </span>
    </span>
  );
}
