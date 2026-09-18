"use client";

/**
 * The library — chart view and list view over the same data.
 *
 * The chart is the front door because a library of apps is a *space* you
 * browse, and a table is not that. But a chart is a bad way to answer "which
 * of these is stale" across twenty apps, so the list stays one click away and
 * the preference is remembered per session. Neither view is a lesser version
 * of the other; they answer different questions.
 *
 * Selection lives in the URL (`?app=slug`) so a chart with a panel open is a
 * linkable state — the thing the old globe got right and the reason its deep
 * links were worth preserving.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, Orbit } from "lucide-react";
import type { ConstellationNode, PersonaSummary, ProjectSummary } from "@/lib/types";
import type { ConstellationEdge } from "@/lib/constellation";
import { Dashboard } from "@/components/dashboard";
import { ConstellationChart } from "./chart";
import { AppPanel } from "./app-panel";

type View = "chart" | "list";

const VIEW_KEY = "walkthrough-studio:library-view";

interface LibraryProps {
  summaries: ProjectSummary[];
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
  /** Personas per project slug, resolved server-side. */
  personasBySlug: Record<string, PersonaSummary[]>;
}

export function Library({ summaries, nodes, edges, personasBySlug }: LibraryProps) {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("app");

  // Default to the chart, but honour a previous choice. Read in an effect
  // rather than during render so the server and first client paint agree —
  // reading localStorage during render is a hydration mismatch waiting to
  // happen.
  const [view, setView] = useState<View>("chart");
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === "list" || saved === "chart") setView(saved);
  }, []);

  const chooseView = useCallback((next: View) => {
    setView(next);
    window.localStorage.setItem(VIEW_KEY, next);
  }, []);

  const select = useCallback(
    (slug: string | null) => {
      router.replace(slug ? `/?app=${encodeURIComponent(slug)}` : "/", { scroll: false });
    },
    [router],
  );

  // Escape closes the panel. Registered once for the whole view rather than on
  // the panel, so it works while the pointer is anywhere on the chart.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, select]);

  const active = summaries.find((s) => s.project.slug === selected) ?? null;
  const activeNode = nodes.find((n) => n.slug === selected) ?? null;

  return (
    // The chart view fills the viewport rather than sizing itself: a map you
    // have to scroll is not a map. The header is fixed height and the chart
    // takes whatever is left, letterboxed by the SVG's own viewBox.
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1180px] shrink-0 items-end justify-between gap-6 px-6 pt-8">
        <div>
          <p className="eyebrow">The library</p>
          <h1 className="display mt-2 text-balance">
            {summaries.length === 0
              ? "Nothing documented yet"
              : `${summaries.length} ${summaries.length === 1 ? "app" : "apps"} on the chart`}
          </h1>
          <p className="mt-2.5 max-w-[54ch] text-small text-ink-muted">
            Every app sits in the territory of the platform it is documented on. A star&rsquo;s
            outer ring is what has been catalogued; the filled centre is what has actually been
            walked.
          </p>
        </div>
        <ViewToggle view={view} onChange={chooseView} />
      </div>

      {view === "chart" ? (
        <div className="relative mt-2 flex min-h-0 flex-1">
          <div className="relative mx-auto min-h-[26rem] w-full max-w-[1180px] px-2">
            <ConstellationChart
              nodes={nodes}
              edges={edges}
              selected={selected}
              onSelect={select}
            />
          </div>

          {summaries.length === 0 && <EmptyChartPrompt />}

          {active && activeNode && (
            <AppPanel
              summary={active}
              node={activeNode}
              personas={personasBySlug[active.project.slug] ?? []}
              onClose={() => select(null)}
            />
          )}
        </div>
      ) : (
        <div className="mt-2 overflow-y-auto">
          <Dashboard summaries={summaries} />
        </div>
      )}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded border border-rule bg-paper-raised p-1"
      role="tablist"
      aria-label="Library view"
    >
      {(
        [
          { id: "chart" as View, label: "Chart", Icon: Orbit },
          { id: "list" as View, label: "List", Icon: LayoutGrid },
        ]
      ).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={view === id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-label transition-colors ${
            view === id
              ? "bg-ink text-paper"
              : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
          }`}
        >
          <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The empty state sits *over* the chart rather than replacing it.
 *
 * An empty library still has something to show — the five territories are the
 * shape of what this tool can document, and seeing them is a better
 * introduction than a blank page with a command on it.
 */
function EmptyChartPrompt() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto mat max-w-[38ch] text-center">
        <p className="eyebrow">Empty chart</p>
        <h2 className="mt-2 font-serif text-head">Five territories, no apps</h2>
        <p className="mt-2 text-small text-ink-muted">
          Register the first app and it will appear in the territory of its platform.
        </p>
        <code className="mt-4 block rounded bg-paper-sunken px-3 py-2 font-mono text-label text-ink">
          pnpm new-project
        </code>
        <p className="mt-4 text-label text-ink-faint">
          Or read the{" "}
          <Link href="/" className="underline decoration-rule-strong underline-offset-2">
            walkthrough skill
          </Link>{" "}
          to point an agent at an app.
        </p>
      </div>
    </div>
  );
}
