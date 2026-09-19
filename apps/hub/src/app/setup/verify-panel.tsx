"use client";

import { useState } from "react";
import { Check, CircleAlert, CircleDashed, Loader2, X } from "lucide-react";

/**
 * "Set" and "working" are different facts, and only the second one is useful.
 *
 * A revoked key, a rotated key, a key with a trailing newline and a key for
 * the wrong resource all look identical to a page that checks for presence.
 * Every one of them fails at the first real request — which, in this repo, is
 * after a walk has already run.
 *
 * So the page reports nothing about the machine on its own, and every claim it
 * makes comes from here: a real request per provider against a free
 * list-models endpoint, run only when somebody asks for it. The server half of
 * this is a shell-out to `pnpm doctor`, so the page and the command cannot
 * disagree about whether a key works.
 */

type ProviderState =
  | "ready"
  | "partial"
  | "ask"
  | "missing"
  | "rejected"
  | "unreachable"
  | "unknown";

interface VerifyProvider {
  id: string;
  name: string;
  kind: string;
  state: ProviderState;
  detail?: string;
  unverified?: boolean;
}

interface VerifyCapability {
  id: string;
  name: string;
  state: string;
  providers: VerifyProvider[];
}

interface VerifyReport {
  host: { name: string; evidence: string };
  envFilePresent: boolean;
  capabilities: VerifyCapability[];
  error?: string;
}

const ICON: Record<ProviderState, typeof Check> = {
  ready: Check,
  partial: CircleAlert,
  ask: CircleAlert,
  missing: CircleDashed,
  rejected: X,
  unreachable: X,
  unknown: CircleDashed,
};

const TONE: Record<ProviderState, string> = {
  ready: "text-[#2f7d4f]",
  partial: "text-[#b8860b]",
  ask: "text-[#b8860b]",
  missing: "text-ink-faint",
  rejected: "text-[#b4462f]",
  unreachable: "text-[#b4462f]",
  unknown: "text-ink-faint",
};

/**
 * "Not configured" is right for a key and wrong for a browser. A provider that
 * is a local tool is absent or half-present, not misconfigured, and telling
 * someone to configure Chromium sends them looking for a setting that does not
 * exist.
 */
function verdict(state: ProviderState, kind: string): string {
  const isCredential = kind === "api";
  switch (state) {
    case "ready":
      return "working";
    case "partial":
      return isCredential ? "works, but incomplete" : "installed, but not ready";
    case "ask":
      return "ask the agent";
    case "missing":
      if (kind === "host") return "cannot do this";
      return isCredential ? "not configured" : "not available";
    case "rejected":
      return "refused";
    case "unreachable":
      return "unreachable";
    default:
      return "unknown";
  }
}

export function VerifyPanel() {
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/verify", { method: "POST" });
      const body = (await res.json()) as VerifyReport;
      if (!res.ok || body.error) {
        setError(body.error ?? `The check failed with HTTP ${res.status}.`);
        setReport(null);
      } else {
        setReport(body);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check could not be run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-md border border-rule bg-paper-raised p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="max-w-[54ch]">
          <h3 className="font-serif text-title text-ink">Is it actually working?</h3>
          <p className="mt-1.5 text-small text-ink-muted">
            Makes one real request per configured provider against a free list-models endpoint.
            Nothing is generated and nothing is charged. Identical to{" "}
            <code className="font-mono text-micro text-ink">pnpm doctor</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={check}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-2 rounded-sm border border-rule-strong px-3.5 py-2 text-label font-medium text-ink transition-colors hover:bg-paper-sunken disabled:opacity-60"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {busy ? "Checking…" : report ? "Check again" : "Check credentials"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-sm border-l-[3px] border-l-[#b4462f] bg-paper-sunken px-3 py-2 text-small text-ink-muted">
          {error}
        </p>
      )}

      {report && (
        <div className="mt-5">
          <p className="text-label text-ink-faint">
            Host: {report.host.name} · {report.host.evidence} ·{" "}
            {report.envFilePresent ? ".env.local found" : "no .env.local"}
          </p>

          <ul className="mt-3 flex flex-col gap-3">
            {report.capabilities.map((cap) => (
              <li key={cap.id}>
                <p className="text-label font-medium text-ink">{cap.name}</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {cap.providers.map((p) => {
                    const Icon = ICON[p.state] ?? CircleDashed;
                    return (
                      <li key={p.id} className="flex items-start gap-2">
                        <Icon
                          className={`mt-[3px] size-3.5 shrink-0 ${TONE[p.state] ?? "text-ink-faint"}`}
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span className="text-small text-ink-muted">
                          <span className="text-ink">{p.name}</span>{" "}
                          <span className={TONE[p.state] ?? "text-ink-faint"}>
                            {verdict(p.state, p.kind)}
                          </span>
                          {p.detail && <span className="text-ink-faint"> — {p.detail}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
