# Verify mode — proving a fix holds

Walk the team's recent bug fixes and capture proof. The output is `fixes.json`
with before/after pairs, which is the most directly useful artifact this tool
produces for a release review.

## Find candidates

```bash
git log --grep='^fix' --since='30 days ago' --pretty='%h %aI %s'
gh issue list --label bug --state closed --limit 30
```

Plus any entry already in `fixes.json` with `status: "unverified"`.

For each candidate, find the files it touched (`git show --stat <sha>`) and map
them to features via the catalog. A fix touching files you can't map to any
feature is worth flagging — it may be a feature the catalog is missing.

## Capture the pair

The before-state needs the code as it was. Use a worktree rather than mutating
the user's checkout:

```bash
git worktree add /tmp/before <fix-sha>^
# build and run the app from /tmp/before, capture, then:
git worktree remove /tmp/before
```

A worktree is safer than `git stash` or a detached checkout: it can't lose
uncommitted work, and the user's environment keeps running while you capture.

For a web app that means a second dev server on another port — build the
worktree with its own install if the dependency tree moved between the two
commits. For mobile, build and install the old binary, capture, then reinstall
current.

**Capture the same surface, the same size, the same data.** A before/after pair
where the two differ in viewport or logged-in user proves nothing — the reader
can't tell which difference is the fix.

If you genuinely can't reconstruct the before-state — a data migration ran, the
fix was to a third-party service — record the fix with only an after-capture and
`status: "unverified"`. That's honest. Inventing a before-state is not.

## Only the team's fixes go in `fixes.json`

If *you* installed a package, restarted a service, or changed an env var during
the run, that's a run side-effect. It belongs in the run summary's "actions
taken", not in the verified-fixes registry.

Every entry must trace to a commit, a closed issue, or a prior run. `fixes.json`
is a record of the product improving, not of the agent's housekeeping.

## Regressions

If the bug is back, say so: `status: "regressed"`, with the after-capture showing
the current broken state. Then file it in `issues.json` too. A regression found
this way is the highest-value thing a verify run can produce, and burying it
because it's awkward defeats the point.
