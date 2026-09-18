import { Globe, Monitor, Smartphone, Tablet, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { platformProfile } from "@/lib/platforms";
import type { Platform } from "@/lib/types";

const ICONS = {
  globe: Globe,
  smartphone: Smartphone,
  monitor: Monitor,
  terminal: Terminal,
  tablet: Tablet,
} as const;

export function PlatformIcon({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  const Icon = ICONS[platformProfile(platform).icon];
  return <Icon className={cn("size-3.5 shrink-0", className)} aria-hidden />;
}

/**
 * The platform chip. Deliberately quiet — ink on sunken paper, no colour.
 *
 * Platform is a *category*, not a status, so it must not compete with the
 * staleness pill next to it. Colour in this design system means "pay attention
 * to this"; a project being an iOS app is not news.
 */
export function PlatformBadge({
  platform,
  className,
  showLabel = true,
}: {
  platform: Platform;
  className?: string;
  showLabel?: boolean;
}) {
  const profile = platformProfile(platform);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-rule bg-paper-sunken px-1.5 py-0.5 text-micro font-medium text-ink-muted",
        className,
      )}
      title={profile.label}
    >
      <PlatformIcon platform={platform} className="size-3" />
      {showLabel && profile.short}
    </span>
  );
}
