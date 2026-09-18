import { cn } from "@/lib/utils";
import { surfaceAspect } from "@/lib/surfaces";
import type { Surface } from "@/lib/types";

/**
 * Chrome drawn around a capture, selected by the surface's `frame` kind.
 *
 * Why this exists: a 393×852 PNG shown bare reads as a layout bug. The same
 * PNG inside a phone outline reads as a phone. The frame isn't decoration —
 * it's the piece of information that tells a reader what they're looking at,
 * and it's the reason a mobile capture, a terminal capture and a desktop
 * window capture can sit in the same grid without confusing anyone.
 *
 * Two constraints shaped the implementation:
 *
 *  1. **Hairline ink, not a device render.** Every frame is 1px ink on paper
 *     with small radii. A glossy aluminium bezel would be the loudest thing
 *     on a page whose entire job is to show someone else's screenshot.
 *
 *  2. **The frame prints the location.** The browser address rule, the window
 *     title bar and the terminal prompt all display the step's `location`.
 *     That's the same string the schema stores, so the chrome doubles as a
 *     label and a reader always knows *where* in the app they are.
 *
 * `children` should fill the inner screen box — pass a positioned `<Image fill>`
 * or an `<img className="size-full object-cover" />`.
 */
export function SurfaceFrame({
  surface,
  location,
  children,
  className,
  /** Drop the chrome and render only the screen box. */
  bare = false,
}: {
  surface: Surface;
  location?: string;
  children: React.ReactNode;
  className?: string;
  bare?: boolean;
}) {
  const aspect = surfaceAspect(surface);

  if (bare || surface.frame === "none") {
    return (
      <div
        className={cn("mat overflow-hidden rounded-sm", className)}
        style={{ aspectRatio: aspect }}
      >
        <div className="relative size-full">{children}</div>
      </div>
    );
  }

  switch (surface.frame) {
    case "phone":
      return <PhoneFrame aspect={aspect} className={className}>{children}</PhoneFrame>;
    case "tablet":
      return <TabletFrame aspect={aspect} className={className}>{children}</TabletFrame>;
    case "browser":
      return (
        <BrowserFrame aspect={aspect} location={location} className={className}>
          {children}
        </BrowserFrame>
      );
    case "desktop-window":
      return (
        <WindowFrame aspect={aspect} title={location} className={className}>
          {children}
        </WindowFrame>
      );
    case "terminal":
      return (
        <TerminalFrame aspect={aspect} command={location} className={className}>
          {children}
        </TerminalFrame>
      );
    default:
      return (
        <div
          className={cn("mat overflow-hidden rounded-sm", className)}
          style={{ aspectRatio: aspect }}
        >
          <div className="relative size-full">{children}</div>
        </div>
      );
  }
}

// ── Browser ─────────────────────────────────────────────────────────────────

function BrowserFrame({
  aspect,
  location,
  children,
  className,
}: {
  aspect: string;
  location?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-md border border-rule-strong bg-paper-raised shadow-plate",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-rule bg-paper-sunken px-3 py-2">
        <div aria-hidden className="flex shrink-0 gap-1.5">
          <span className="size-2 rounded-full border border-rule-strong" />
          <span className="size-2 rounded-full border border-rule-strong" />
          <span className="size-2 rounded-full border border-rule-strong" />
        </div>
        {/* The address rule carries the real route. Empty-state is a plain
            rule so the chrome still reads as a browser without a location. */}
        {location ? (
          <span className="min-w-0 flex-1 truncate rounded-sm border border-rule bg-paper px-2 py-0.5 font-mono text-[0.6875rem] leading-relaxed text-ink-muted">
            {location}
          </span>
        ) : (
          <span aria-hidden className="h-4 flex-1 rounded-sm border border-rule bg-paper" />
        )}
      </div>
      <div className="relative mat border-0" style={{ aspectRatio: aspect }}>
        {children}
      </div>
    </figure>
  );
}

// ── Phone ───────────────────────────────────────────────────────────────────

function PhoneFrame({
  aspect,
  children,
  className,
}: {
  aspect: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("relative", className)}>
      <div className="rounded-[1.75rem] border border-rule-strong bg-paper-raised p-[0.4375rem] shadow-plate">
        <div
          className="relative mat overflow-hidden rounded-[1.375rem]"
          style={{ aspectRatio: aspect }}
        >
          {children}
          {/* Notch. Sits above the capture: the status bar region of a real
              screenshot is near-empty, so occluding it costs nothing and the
              silhouette is what makes this read as a phone at thumbnail size. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1.5 z-10 h-[0.9375rem] w-[4.25rem] -translate-x-1/2 rounded-full border border-rule-strong bg-paper-raised"
          />
        </div>
      </div>
      {/* Side rails — two short ticks. Cheap, and they finish the silhouette. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-px top-[22%] h-8 w-px rounded bg-rule-strong"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-px top-[18%] h-12 w-px rounded bg-rule-strong"
      />
    </figure>
  );
}

// ── Tablet ──────────────────────────────────────────────────────────────────

function TabletFrame({
  aspect,
  children,
  className,
}: {
  aspect: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("", className)}>
      <div className="rounded-xl border border-rule-strong bg-paper-raised p-2 shadow-plate">
        <div
          className="relative mat overflow-hidden rounded-lg"
          style={{ aspectRatio: aspect }}
        >
          {children}
        </div>
      </div>
    </figure>
  );
}

// ── Desktop window ──────────────────────────────────────────────────────────

function WindowFrame({
  aspect,
  title,
  children,
  className,
}: {
  aspect: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-md border border-rule-strong bg-paper-raised shadow-plate",
        className,
      )}
    >
      <div className="relative flex items-center gap-2 border-b border-rule bg-paper-sunken px-3 py-1.5">
        <div aria-hidden className="flex shrink-0 gap-1.5">
          <span className="size-2 rounded-full border border-rule-strong" />
          <span className="size-2 rounded-full border border-rule-strong" />
          <span className="size-2 rounded-full border border-rule-strong" />
        </div>
        {/* Centred title, the way a native window title bar sets it. */}
        <span className="min-w-0 flex-1 truncate text-center text-label font-medium text-ink-muted">
          {title ?? ""}
        </span>
        <span aria-hidden className="w-[3.25rem] shrink-0" />
      </div>
      <div className="relative mat border-0" style={{ aspectRatio: aspect }}>
        {children}
      </div>
    </figure>
  );
}

// ── Terminal ────────────────────────────────────────────────────────────────

function TerminalFrame({
  aspect,
  command,
  children,
  className,
}: {
  aspect: string;
  command?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-md border border-rule-strong bg-paper-raised shadow-plate",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-rule bg-paper-sunken px-3 py-1.5">
        <div aria-hidden className="flex shrink-0 gap-1.5">
          <span className="size-2 rounded-full border border-rule-strong" />
          <span className="size-2 rounded-full border border-rule-strong" />
          <span className="size-2 rounded-full border border-rule-strong" />
        </div>
        {command && (
          <span className="min-w-0 flex-1 truncate font-mono text-[0.6875rem] text-ink-muted">
            <span className="text-brand">$</span> {command.replace(/^\$\s*/, "")}
          </span>
        )}
      </div>
      {/* The one dark surface in the whole app. A terminal capture IS dark —
          matting it on paper would put a light border around a black image
          and read as a mistake. */}
      <div
        className="relative overflow-hidden bg-[#1a1815]"
        style={{ aspectRatio: aspect }}
      >
        {children}
      </div>
    </figure>
  );
}
