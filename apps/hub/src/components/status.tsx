import { CircleDashed, FileWarning, PenLine, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Plate } from "@/components/plate";
import type {
  CaptureStatus,
  StalenessReport,
  StalenessVerdict,
  VerificationStatus,
} from "@/lib/types";

/**
 * Status chrome for the whole app.
 *
 * The colour budget is spent here and almost nowhere else. Four registers,
 * each desaturated into the printed palette so they read as marginal
 * annotations rather than as a traffic light:
 *
 *   ok     moss    — nothing needs doing
 *   warn   ochre   — drifting
 *   alert  red     — wrong, or claimed-but-unproven
 *   note   slate   — informational
 */

type Tone = "ok" | "warn" | "alert" | "note" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  ok: "border-ok/25 bg-ok-wash text-ok",
  warn: "border-warn/25 bg-warn-wash text-warn",
  alert: "border-alert/25 bg-alert-wash text-alert",
  note: "border-note/25 bg-note-wash text-note",
  neutral: "border-rule bg-paper-sunken text-ink-muted",
};

function Pill({
  tone,
  children,
  className,
  title,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-micro font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Staleness ───────────────────────────────────────────────────────────────

/**
 * Verdict copy lives here, not in `lib/run-history.ts`.
 *
 * That module computes staleness by shelling out to git, so it transitively
 * imports `node:child_process`. This file is a client component — importing
 * anything from there drags the whole server module into the browser bundle
 * and fails the build. Display strings are presentation; keeping them next to
 * the component that renders them is both correct and the thing that makes the
 * boundary impossible to violate by accident.
 */
const STALENESS_COPY: Record<StalenessVerdict, { label: string; hint: string }> = {
  fresh: { label: "Fresh", hint: "No changes to the app since the last walkthrough." },
  stale: { label: "Stale", hint: "The app has moved since the last walkthrough." },
  "very-stale": {
    label: "Very stale",
    hint: "Substantial drift since the last walkthrough — re-walk before trusting it.",
  },
  never: { label: "Never walked", hint: "No walkthrough has been captured yet." },
  // Not "Unknown": a bare word leaves the reader wondering whether the app is
  // fine, broken, or unchecked. The pill now states the actual situation, and
  // the hint explains the consequence.
  unknown: {
    label: "Drift not tracked",
    hint: "No local checkout to diff against, so we can't tell whether the app has changed since this walk.",
  },
};

const STALENESS_TONE: Record<StalenessVerdict, Tone> = {
  fresh: "ok",
  stale: "warn",
  "very-stale": "alert",
  never: "neutral",
  unknown: "neutral",
};

/**
 * "Has the app moved since we walked it?"
 *
 * Shows the *evidence*, not just the verdict — "3 commits" is checkable,
 * "stale" is an opinion. The tooltip carries the reasoning so the badge can
 * stay one line wide in a dense grid.
 */
export function StalenessPill({
  staleness,
  className,
  showDetail = true,
}: {
  staleness: StalenessReport;
  className?: string;
  showDetail?: boolean;
}) {
  const copy = STALENESS_COPY[staleness.verdict];
  const tone = STALENESS_TONE[staleness.verdict];

  const detail = (() => {
    if (!showDetail) return null;
    if (staleness.verdict === "never") return null;
    if (staleness.verdict === "unknown") return null;
    if (staleness.commitsSince > 0) {
      return `${staleness.commitsSince} commit${staleness.commitsSince === 1 ? "" : "s"} since`;
    }
    if (staleness.ageDays !== null) {
      const days = Math.round(staleness.ageDays);
      if (days < 1) return "walked today";
      return `${days}d ago`;
    }
    return null;
  })();

  return (
    <Pill tone={tone} className={className} title={staleness.reason ?? copy.hint}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          tone === "ok" && "bg-ok",
          tone === "warn" && "bg-warn",
          tone === "alert" && "bg-alert",
          tone === "note" && "bg-note",
          tone === "neutral" && "bg-ink-faint",
        )}
      />
      {copy.label}
      {detail && <span className="font-normal opacity-70 nums">· {detail}</span>}
    </Pill>
  );
}

// ── Capture status ──────────────────────────────────────────────────────────

const CAPTURE_TONE: Record<CaptureStatus, Tone> = {
  done: "ok",
  pending: "neutral",
  blocked: "alert",
  skipped: "neutral",
};

const CAPTURE_LABEL: Record<CaptureStatus, string> = {
  done: "Walked",
  pending: "Not yet",
  blocked: "Blocked",
  skipped: "Skipped",
};

export function CaptureStatusChip({
  status,
  surfaceLabel,
  className,
}: {
  status: CaptureStatus;
  surfaceLabel?: string;
  className?: string;
}) {
  return (
    <Pill tone={CAPTURE_TONE[status]} className={className}>
      {surfaceLabel && <span className="opacity-60">{surfaceLabel}</span>}
      {CAPTURE_LABEL[status]}
    </Pill>
  );
}

// ── Verification ────────────────────────────────────────────────────────────

/**
 * The honesty badge, and the most important component in the app.
 *
 * `live-walked` renders *nothing*. That's deliberate: real capture is the
 * baseline promise, and decorating it with a green tick would make the
 * unmarked case ambiguous. Only departures from the promise get a mark, so a
 * page with no badges is a page you can trust end to end.
 */
export function VerificationBadge({
  status,
  className,
}: {
  status?: VerificationStatus;
  className?: string;
}) {
  if (!status || status === "live-walked") return null;

  if (status === "synthetic") {
    return (
      <Pill
        tone="warn"
        className={className}
        title="Described from source or documentation — this state was never captured from a running app."
      >
        <PenLine className="size-3" aria-hidden />
        Described, not walked
      </Pill>
    );
  }

  return (
    <Pill
      tone="note"
      className={className}
      title="The surface was reached, but the action was deliberately not taken because it would change real data."
    >
      <ShieldAlert className="size-3" aria-hidden />
      Not executed
    </Pill>
  );
}

/** Whole-walkthrough or whole-catalog synthetic notice. */
export function SyntheticNotice({
  reason,
  className,
}: {
  reason?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-sm border border-warn/25 bg-warn-wash px-4 py-3.5 text-small text-warn",
        className,
      )}
    >
      {/* A measured line drawing rather than a tonal object study — the plate
          makes the distinction the copy is making: this is a plan of the app,
          not a picture of it. */}
      <Plate
        src="/art/state-synthetic.png"
        width={1400}
        height={933}
        sizes="128px"
        className="hidden h-auto w-32 shrink-0 self-center opacity-80 sm:block"
      />
      <div className="flex min-w-0 items-start gap-2.5">
        <FileWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="leading-relaxed">
          <span className="font-semibold">Mapped from source, not captured.</span>{" "}
          {reason ??
            "Nothing here was driven against a running app, so treat it as a plan rather than as evidence."}
        </p>
      </div>
    </div>
  );
}

/** Small inline marker for a project with no runs at all. */
export function NeverWalked({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-micro font-medium text-ink-faint",
        className,
      )}
    >
      <CircleDashed className="size-3" aria-hidden />
      Never walked
    </span>
  );
}
