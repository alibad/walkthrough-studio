import { Bot, Camera, GitBranch, Layers } from "lucide-react";
import { DRIVER_LABELS } from "@/lib/platforms";
import type { RunManifest } from "@/lib/types";

/**
 * The run log — every capture run, newest first.
 *
 * This is the provenance record. A screenshot is only trustworthy to the
 * extent you know when it was taken, against which commit, by what, and with
 * what configuration. All four live here, and each run is immutable once
 * written, so the log is also the audit trail.
 */
export function RunLog({ runs }: { runs: RunManifest[] }) {
  if (runs.length === 0) {
    return (
      <p className="py-12 text-center text-small text-ink-muted">
        No runs recorded. Every walkthrough should append a manifest to{" "}
        <code className="font-mono text-[0.8125rem] text-ink">runs.json</code> — that&apos;s
        what makes drift detection work.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {runs.map((run, index) => (
        <li key={run.id}>
          <RunCard run={run} isLatest={index === 0} />
        </li>
      ))}
    </ol>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startedAt: string, completedAt: string): string | null {
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function RunCard({ run, isLatest }: { run: RunManifest; isLatest: boolean }) {
  const duration = formatDuration(run.startedAt, run.completedAt);

  return (
    <article className="rounded-md border border-rule bg-paper-raised">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h4 className="text-small font-medium text-ink nums">
            {formatDate(run.completedAt)}
          </h4>
          {isLatest && (
            <span className="rounded-sm border border-ok/25 bg-ok-wash px-1.5 py-0.5 text-micro font-medium text-ok">
              latest
            </span>
          )}
          {duration && (
            <span className="text-micro text-ink-faint">took {duration}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-micro text-ink-faint">
          {run.agent && (
            <span className="inline-flex items-center gap-1">
              <Bot className="size-3" aria-hidden />
              {run.agent}
            </span>
          )}
          <span>{DRIVER_LABELS[run.config.driver] ?? run.config.driver}</span>
        </div>
      </header>

      <div className="flex flex-wrap gap-x-8 gap-y-3 px-4 py-3 text-small">
        <div>
          <p className="text-micro text-ink-faint">Target commit</p>
          <p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[0.8125rem] text-ink">
            <GitBranch className="size-3 text-ink-faint" aria-hidden />
            {run.target.shaShort}
            {run.target.branch && (
              <span className="font-sans text-micro text-ink-faint">
                on {run.target.branch}
              </span>
            )}
            {run.target.dirty && (
              <span
                className="font-sans text-micro text-warn"
                title="Captured against a dirty working tree"
              >
                +dirty
              </span>
            )}
          </p>
          {run.target.commitSubject && (
            <p className="mt-1 max-w-[52ch] truncate text-micro text-ink-faint">
              {run.target.commitSubject}
            </p>
          )}
        </div>

        <div>
          <p className="text-micro text-ink-faint">Surfaces</p>
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-[0.8125rem] text-ink">
            <Layers className="size-3 text-ink-faint" aria-hidden />
            {run.config.surfaces.join(" · ")}
            {run.config.locales && run.config.locales.length > 0 && (
              <span className="text-micro text-ink-faint">
                / {run.config.locales.join(" · ")}
              </span>
            )}
          </p>
        </div>

        <div>
          <p className="text-micro text-ink-faint">Coverage</p>
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-[0.8125rem] text-ink nums">
            <Camera className="size-3 text-ink-faint" aria-hidden />
            {run.coverage.features.length} features · {run.coverage.screenshots} captures
            {(run.coverage.issues ?? 0) > 0 && (
              <span className="text-warn">· {run.coverage.issues} issues</span>
            )}
          </p>
        </div>

        {run.config.capturedAgainst && (
          <div>
            <p className="text-micro text-ink-faint">Captured against</p>
            <p className="mt-0.5 font-mono text-[0.8125rem] text-ink">
              {run.config.capturedAgainst}
            </p>
          </div>
        )}
      </div>

      {run.config.notes && (
        <p className="border-t border-rule bg-paper-sunken/50 px-4 py-2.5 text-small text-ink-muted">
          {run.config.notes}
        </p>
      )}
    </article>
  );
}
