# Run history and staleness

Every run appends a `RunManifest` to `runs.json`. This is the provenance record
and the baseline for drift detection. Skip it and the hub silently keeps
reporting the previous run's freshness forever — which is worse than reporting
nothing, because it's confidently wrong.

## Before a run: check what's there

```
latest run  → completedAt, target.sha
current app → git -C <codebase.local> log -1 --pretty=%H -- .
```

If the verdict is `fresh` and the sha hasn't moved, **there is nothing new to
capture.** Say so and confirm the user still wants to spend the time. Re-walking
an unchanged app produces a second identical set of captures and a run log entry
that implies work happened.

## After a run: append

Append-only. Never rewrite a historical entry — each is the baseline a later
check measures against, so editing one retroactively changes the answer to
"when did this drift?".

Set `target.sha` by asking the target repo directly, not by remembering what you
read earlier:

```bash
git -C <codebase.local> log -1 --pretty=%H -- .
git -C <codebase.local> rev-parse --abbrev-ref HEAD
git -C <codebase.local> status --porcelain        # non-empty → dirty: true
```

`watchPath` is the repo-relative subdirectory the app lives in, so diffs are
scoped to it. In a monorepo, `apps/ios` means a change to `apps/web` correctly
does *not* mark the iOS walkthrough stale.

Record `dirty: true` honestly when the tree had uncommitted changes. It means
the captures don't correspond exactly to any commit, and a reader deciding
whether to trust them needs to know.

Full shape: [`output-format.md § runs.json`](output-format.md).

## How the verdict is computed

Live, on every page render, in
[`run-history.ts`](../../../../../apps/hub/src/lib/run-history.ts). Never persisted.

| Verdict | Condition |
|---|---|
| `fresh` | 0 commits since the run **and** ≤ 30 days old |
| `stale` | 1–10 commits, or 0 commits but > 30 days |
| `very-stale` | > 10 commits, or > 90 days |
| `never` | no runs recorded |
| `unknown` | no readable local checkout |

Age counts independently of commits on purpose: an app nobody has touched in
four months still deserves a re-walk, because the world around it moved —
dependencies, data, and the reader's memory of it.

## Affected features

The hub also works out which features a diff plausibly touched, and lists them
as "may have changed". It matches changed file paths against tokens from each
feature's `location`, plus a set of patterns that mean "this affects
everything" — a theme file, an i18n bundle, a root layout, `AppDelegate.swift`,
`AndroidManifest.xml`.

It **over-reports by design.** Telling someone to re-check a feature that turned
out fine costs a minute. Failing to flag one that silently broke costs trust in
the whole hub. If you add a pattern, err toward the permissive side.
