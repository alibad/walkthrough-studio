# walkthrough

Walk an app end to end and publish what you actually saw — **web, iOS, Android,
desktop or CLI**.

An agent drives the real application the way a person would (clicking, typing,
tapping, running commands), captures each state, and writes a catalog,
per-feature walkthroughs, persona journeys, verified fixes and an append-only
run log. Every run is stamped with the target repo's git commit, so drift
between the documentation and the product is visible rather than assumed.

## Install

**Claude Code** — add the parent repo as a plugin marketplace, then install:

```
/plugin marketplace add <this-repo>
/plugin install walkthrough
```

Or copy this directory into a project's `.claude/skills/`.

**Codex** — copy `skills/walkthrough/` somewhere your agent reads, and add a
pointer to it in the project's `AGENTS.md`. A `/walkthrough` prompt is provided
in the parent repo at `.codex/prompts/walkthrough.md`.

**Anything else** — the skill is plain markdown with no runtime-specific
dependencies. Point your agent at `skills/walkthrough/SKILL.md`.

## Requirements

Only for the platforms you actually target:

| Platform | Needs |
|---|---|
| web | Playwright (MCP or the npm package), or headless Chrome |
| ios | macOS with Xcode and an iOS runtime |
| android | Android SDK platform-tools (`adb`) |
| desktop | Playwright for Electron; otherwise the OS accessibility layer |
| cli | a pseudo-terminal (`node-pty`) |

Plus somewhere to write the output. The companion hub reads it directly; without
one, the JSON and PNGs are still perfectly useful on their own.

## Use

```
/walkthrough                        full run — every feature, every persona
/walkthrough catalog                discover features only
/walkthrough /settings/billing      one feature
/walkthrough --persona new-user     one user's journey
/walkthrough verify                 before/after proof for recent fixes
/walkthrough pr                     a PR whose body shows what changed
```

## What makes it trustworthy

The output is meant to be believed without verification, so the skill is built
around one rule: **only assert what was observed.**

- Every step records the interaction that produced it.
- No two captures in a walkthrough may be byte-identical — identical bytes mean
  nothing happened between those steps.
- Anything described rather than driven is explicitly marked.
- It never edits the app it's documenting. A broken screen is recorded as
  broken, not patched into looking fine.

## Layout

```
skills/walkthrough/
  SKILL.md              start here
  references/           the JSON contract, quality invariants, mode runbooks
  drivers/              one guide per platform — mechanics and traps
```
