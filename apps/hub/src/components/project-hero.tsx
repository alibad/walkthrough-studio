import Image from "next/image";
import { ExternalLink, Folder, Play, Terminal } from "lucide-react";
import { isLocalHub } from "@/lib/capabilities";
import { PlatformBadge } from "@/components/platform-badge";
import { Plate } from "@/components/plate";
import { StalenessPill } from "@/components/status";
import { DRIVER_LABELS, effectiveDriver, platformProfile } from "@/lib/platforms";
import type { LabeledUrl, Project, ProjectSummary } from "@/lib/types";

/**
 * Project masthead: what the app is, where it lives, and how it's driven.
 *
 * The "how it's driven" part is the bit that's easy to skip and shouldn't be.
 * A reader arriving at an iOS project needs to know it was captured on an
 * iPhone 17 Pro simulator before they can judge anything below; a reader on a
 * CLI project needs to see the binary. So the target row is part of the
 * masthead, not buried in a details panel.
 */
export function ProjectHero({ summary }: { summary: ProjectSummary }) {
  const { project, staleness } = summary;
  const platform = project.target.platform;
  const profile = platformProfile(platform);
  const driver = effectiveDriver(platform, project.target.driver);
  const logoPath = summary.catalog?.brand?.logoPath?.replace(/^\/+/, "");

  return (
    <header className="border-b border-rule bg-paper-raised">
      <div className="mx-auto max-w-[76rem] px-6 py-10">
        {/* The platform plate sits beside the masthead rather than above the
            fold on its own: it answers "what kind of thing am I looking at"
            at a glance, which is the question a reader has before any of the
            text below means anything. */}
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
        <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <PlatformBadge platform={platform} />
          {project.tag && (
            <span className="text-micro font-medium text-ink-faint">{project.tag}</span>
          )}
          <StalenessPill staleness={staleness} className="ml-auto" />
        </div>

        <div className="mt-4 flex items-center gap-4">
          {logoPath && (
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-rule bg-paper p-1.5 shadow-plate">
              <Image
                src={`/walkthroughs/${project.slug}/${logoPath}`}
                alt={`${project.name} logo`}
                width={64}
                height={64}
                className="size-full object-contain"
                unoptimized
              />
            </div>
          )}
          <h1 className="display text-head-lg max-w-[24ch]">{project.name}</h1>
        </div>

        {(project.longDescription || project.description) && (
          <p className="mt-4 max-w-[62ch] text-body leading-relaxed text-ink-muted">
            {project.longDescription ?? project.description}
          </p>
        )}

        {/* How this app is reached and driven. */}
        <dl className="mt-7 flex flex-wrap gap-x-9 gap-y-4 border-t border-rule pt-5 text-small">
          <TargetRow project={project} />
          <div>
            <dt className="text-micro text-ink-faint">Driver</dt>
            <dd className="mt-0.5 text-ink" title={profile.blurb}>
              {project.meta?.driverLabel ?? DRIVER_LABELS[driver] ?? driver}
            </dd>
          </div>
          {/* Local only, deliberately.
           *
           * A checkout path answers "where do I run the walk from", which is a
           * question for the person running it and nobody else. Published, it
           * is at best noise and at worst a home directory — this row used to
           * print an absolute one, putting a username on a public page. The
           * registry now stores a repo-relative path, and this renders it only
           * where it means something. */}
          {isLocalHub() && project.codebase?.local && (
            <div className="min-w-0">
              <dt className="text-micro text-ink-faint">Checkout</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-[0.8125rem] text-ink">
                <Folder className="size-3 shrink-0 text-ink-faint" aria-hidden />
                <span className="truncate-start max-w-[28ch]">
                  {project.codebase.local}
                </span>
              </dd>
            </div>
          )}
          {project.codebase?.github && (
            <div>
              <dt className="text-micro text-ink-faint">Repository</dt>
              <dd className="mt-0.5">
                <a
                  href={githubUrl(project)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-ink transition-colors hover:text-brand"
                >
                  {project.codebase.github}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </dd>
            </div>
          )}
        </dl>

        </div>

          <Plate
            src={profile.art}
            width={512}
            height={512}
            sizes="200px"
            className="hidden h-auto w-[11rem] shrink-0 md:block"
          />
        </div>

        {/* Actions. Only rendered when the underlying thing exists. */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {openableUrls(project).map((entry) => (
            <a
              key={entry.url}
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm border border-rule bg-paper px-2.5 py-1.5 text-label font-medium text-ink transition-colors hover:border-rule-strong hover:bg-paper-sunken"
            >
              <Play className="size-3" aria-hidden />
              {entry.label}
            </a>
          ))}
        </div>
      </div>
    </header>
  );
}

function githubUrl(project: Project): string {
  const cb = project.codebase;
  if (!cb?.github) return "#";
  const branch = cb.githubBranch ?? "main";
  return cb.githubPath
    ? `https://github.com/${cb.github}/tree/${branch}/${cb.githubPath}`
    : `https://github.com/${cb.github}`;
}

/**
 * The target row. What "where does this app live" means depends entirely on
 * the platform, so each one gets its own presentation rather than a lowest
 * common denominator.
 */
function TargetRow({ project }: { project: Project }) {
  const t = project.target;

  switch (t.platform) {
    case "web": {
      const url = t.production ?? t.staging ?? t.local;
      if (!url) return null;
      return (
        <div className="min-w-0">
          <dt className="text-micro text-ink-faint">Base URL</dt>
          <dd className="mt-0.5 truncate font-mono text-[0.8125rem] text-ink">{url}</dd>
        </div>
      );
    }
    case "ios":
    case "android":
      return (
        <>
          {t.bundleId && (
            <div>
              <dt className="text-micro text-ink-faint">Bundle</dt>
              <dd className="mt-0.5 font-mono text-[0.8125rem] text-ink">{t.bundleId}</dd>
            </div>
          )}
          {t.device && (
            <div>
              <dt className="text-micro text-ink-faint">Device</dt>
              <dd className="mt-0.5 text-ink">{t.device}</dd>
            </div>
          )}
        </>
      );
    case "desktop":
      if (!t.executable && !t.electronMain) return null;
      return (
        <div className="min-w-0">
          <dt className="text-micro text-ink-faint">Executable</dt>
          <dd className="mt-0.5 font-mono text-[0.8125rem] text-ink">
            <span className="truncate-start block max-w-[34ch]">
              {t.executable ?? t.electronMain}
            </span>
          </dd>
        </div>
      );
    case "cli":
      if (!t.binary) return null;
      return (
        <div>
          <dt className="text-micro text-ink-faint">Binary</dt>
          <dd className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[0.8125rem] text-ink">
            <Terminal className="size-3 text-ink-faint" aria-hidden />
            {t.binary}
          </dd>
        </div>
      );
    default:
      return null;
  }
}

/** Web URLs worth offering as "open the app" buttons. */
function openableUrls(project: Project): LabeledUrl[] {
  if (project.target.platform !== "web") return [];
  const out: LabeledUrl[] = [];
  if (project.target.production) {
    out.push({ label: "Production", url: project.target.production });
  }
  if (project.target.staging) out.push({ label: "Staging", url: project.target.staging });
  if (project.target.local) out.push({ label: "Local", url: project.target.local });
  for (const entry of project.target.other ?? []) out.push(entry);
  return out;
}
