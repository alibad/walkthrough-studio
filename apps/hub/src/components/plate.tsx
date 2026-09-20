import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * A generated illustration plate.
 *
 * ── How a plate's ground is removed, and why it works this way ─────────────
 *
 * The plates are ink on warm paper. Dropped in unprocessed, each shows as a
 * rectangle a shade off from the page. There are two ways to deal with that,
 * and this system uses both — for different plates, for a specific reason.
 *
 * **Object studies carry a real alpha channel.** `scripts/optimize-art.mjs`
 * bakes it in: RGB pinned to ink, alpha = inverted luminance. These need
 * `blend="none"` (the default) and composite correctly anywhere.
 *
 * **Photographic plates stay opaque and use `blend="multiply"`.** The hero
 * interior, the persona portraits and scenes all contain bright areas that are
 * *part of the picture* — a window, a white shirt — and keying those out would
 * punch holes in the image. They live inside a `.mat` well, which is a framed
 * print by design, and multiply against the mat's background is right there.
 *
 * `blend="multiply"` is only safe INSIDE an element with its own background.
 * `mix-blend-mode` blends against the backdrop within the nearest stacking
 * context, and the hub's content wrapper sets `z-index: 1`, which creates one —
 * so a multiplied plate with no background beneath it renders as an opaque
 * white box. That bug is exactly why object studies get baked alpha instead.
 *
 * Plates are `aria-hidden` by default: they're decorative, and a screen reader
 * announcing "a pair of brass vernier calipers" before every category heading
 * is noise. Pass `alt` only when a plate carries information the surrounding
 * text doesn't.
 */
export function Plate({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
  sizes,
  blend = "none",
}: {
  src: string;
  /** Omit for decorative plates — the default. */
  alt?: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
  /** Only use "multiply" inside an element that has its own background. */
  blend?: "none" | "multiply";
}) {
  return (
    <Image
      src={src}
      alt={alt ?? ""}
      aria-hidden={alt ? undefined : true}
      width={width}
      height={height}
      priority={priority}
      sizes={sizes}
      className={cn(blend === "multiply" && "mix-blend-multiply", className)}
    />
  );
}

/**
 * The small square plate beside a category heading or platform label.
 *
 * Sized in a fixed box with `object-contain` because the generated plates
 * don't share a subject scale — a printing press fills more of its frame than
 * a key does. Containing them in an identical box keeps a column of headings
 * optically even without hand-cropping fourteen images.
 */
export function PlateIcon({
  src,
  className,
  size = 44,
}: {
  src: string;
  className?: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt=""
        width={size * 2}
        height={size * 2}
        className="size-full object-contain"
      />
    </span>
  );
}

/**
 * A plate illustrating an empty, blocked or otherwise inert state. Centred,
 * capped, with the explanatory copy beneath it.
 */
export function StatePlate({
  src,
  title,
  children,
  className,
  maxWidth = 380,
}: {
  src: string;
  title: string;
  children?: React.ReactNode;
  className?: string;
  maxWidth?: number;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      {/* Inline width because `maxWidth` is a runtime prop — Tailwind can't
          generate an arbitrary class for a value it never sees. */}
      <span className="block w-full" style={{ maxWidth }}>
        <Plate
          src={src}
          width={900}
          height={600}
          sizes={`${maxWidth}px`}
          className="h-auto w-full"
        />
      </span>
      <h3 className="mt-5 font-serif text-title">{title}</h3>
      {children && (
        <div className="mt-2 max-w-[46ch] text-small leading-relaxed text-ink-muted">
          {children}
        </div>
      )}
    </div>
  );
}
