# PR mode — a pull request that shows what changed for the user

Branch, commit, capture before/after for the affected features, push, and open a
PR with the captures embedded in the body. End to end: from a dirty tree to a
real PR URL.

The value is specific: a reviewer reading a diff sees what the code now says. A
reviewer reading a before/after capture sees what the *user* now experiences.
Those are different reviews, and only one of them catches "this is technically
correct and looks wrong".

## Sequence

1. **Check the tree.** `git status`. If clean and no `--vs` given, there's
   nothing to document — stop and say so.

2. **Determine the base.** `--base`, else the default branch. Compute the
   merge-base: `git merge-base HEAD origin/main`. That commit is the
   **before** state — not `HEAD~1`, which is wrong the moment the branch has
   more than one commit.

3. **Work out the affected features.** `git diff --name-only <merge-base>` and
   map paths to features via the catalog, using the same over-reporting
   heuristic as staleness. `--routes` / `--locations` overrides it when the
   heuristic guesses badly.

4. **Branch** if on the default branch. Never commit user work to `main`
   without being asked.

5. **Capture after** — the current tree, the affected features only.

6. **Capture before** — a worktree at the merge-base:
   ```bash
   git worktree add /tmp/before $(git merge-base HEAD origin/main)
   ```
   Install dependencies in the worktree if the lockfile moved between the two
   commits; otherwise the old code runs against new packages and you're
   capturing a state that never existed.

7. **Commit** the captures, push, and `gh pr create` with the body.

## The body

Lead with the user-visible change, not the implementation:

```markdown
## What changed for the user

Filing a note offline now keeps its original order when the queue flushes.

| Before | After |
|---|---|
| ![before](url) | ![after](url) |

## Why

<the actual reason, one or two sentences>

## Walked

- `notes-list` · iphone · 4 steps
```

**Use video for motion and a still for static change.** A layout fix is a still;
a fix to a transition, a loading sequence, or a streaming response needs the
clip — a still of an animation is a still of one arbitrary frame.

Encode as h264 + `yuv420p` for a video, or the platform's viewer won't play it.

## Constraints

- **`--draft`** when the change isn't ready for review.
- **`--no-pr`** stops after the captures commit — offline review.
- Never enable auto-merge unless the user explicitly asked.
- Attribution lines in the commit message and PR body follow whatever the
  session's own instructions specify.
