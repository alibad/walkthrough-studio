Run a walkthrough of an application: drive the real app, capture what you see,
and write the results into this repo's Walkthrough Studio hub.

**Read the skill first and follow it — do not improvise:**

```
plugins/walkthrough/skills/walkthrough/SKILL.md
```

It covers platform detection, driver selection (web / iOS / Android / desktop /
CLI), the pre-flight checks that stop you documenting the wrong app, the quality
invariants the hub enforces, and the exact JSON shapes to write. The per-platform
mechanics are in `drivers/` and the contracts are in `references/`.

Arguments passed to this command: $ARGUMENTS

Interpret them as the skill's Mode Detection section describes — empty means a
full run, a location or feature id means a single feature, `catalog` /
`personas` / `verify` / `pr` select those modes, and `--persona <id>` walks one
user's journey.

Two things that are non-negotiable, because the hub checks them and a reader
trusts them:

1. **Only assert what you observed.** Anything you didn't drive live is marked
   `verificationStatus: "synthetic"` or `"gated-write"`.
2. **Append a run manifest to `runs.json`** with the target repo's git sha.
   Without it, drift detection silently stops working for that project.
