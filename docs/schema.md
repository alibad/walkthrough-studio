# Schema — and why it's shaped this way

The contract is
[`apps/hub/src/lib/types.ts`](../apps/hub/src/lib/types.ts). The author-facing
version, with examples, is
[`references/output-format.md`](../plugins/walkthrough/skills/walkthrough/references/output-format.md).
This file explains the *design*, which the other two deliberately don't.

## The problem it solves

The first version was web-shaped:

```ts
interface Project  { url: string }
interface Step     { route: string }
interface Walk     { viewport: "desktop" | "mobile" }
```

Every one of those breaks on a non-web app. An iOS app has no URL and no routes.
A macOS utility has neither, plus windows instead of pages. A CLI has commands.
And `"desktop" | "mobile"` can't express an iPad, a watch, or an 80-column
terminal without a schema change each time.

Three replacements:

### `url` → `ProjectTarget`

A discriminated bag of "how a driver reaches this app", keyed by platform: base
URLs for web, a bundle id and simulator device for mobile, an executable for
desktop, a binary for a CLI. Plus an optional `LaunchRecipe` so the agent can
bring the app up itself.

The hub only ever *displays* these. It never launches anything — that's the
skill's job, and keeping the hub read-only means a page render can't start a
process.

### `route` → `location`

One plain string whose **semantics depend on the platform**, documented on the
field itself:

| Platform | `location` | Example |
|---|---|---|
| `web` | URL path | `/settings/billing` |
| `ios` | screen id or deep link | `SettingsScreen` |
| `android` | activity or route | `com.acme/.SettingsActivity` |
| `desktop` | window and pane path | `Preferences › Network` |
| `cli` | the invocation | `acme deploy --dry-run` |

**Why one string rather than a tagged union** (`{ kind: "route", value: "…" }`):
ergonomics. Every step, feature, persona, fix and issue carries a location, and
they're all written by hand or by an agent into JSON. A tagged union triples the
typing and the chance of a mistake, to encode a fact the project already
declares once in `target.platform`.

The cost is that a location is opaque to generic code. Staleness detection needs
tokens from it to guess which files affect which feature, so
[`run-history.ts`](../apps/hub/src/lib/run-history.ts) has a `locationTokens()`
that handles all five vocabularies — splitting camelCase, dropping CLI flags,
ignoring `Screen`/`Activity`/`View` suffixes. That's one function versus a
schema tax on every write. Worth it.

### `viewport` → `Surface`

A named capture surface with real dimensions, a device pixel ratio, and a
`frame` kind:

```ts
{ id: "iphone", label: "iPhone", platform: "ios",
  width: 393, height: 852, scale: 3, frame: "phone",
  deviceName: "iPhone 17 Pro" }
```

`frame` is the load-bearing field. It's why a phone capture, a terminal capture
and a desktop window capture can sit in one grid without confusing anyone — the
hub draws browser chrome, a phone outline, a window title bar or a terminal
accordingly, and the frame *prints the location*, so the chrome doubles as a
label.

Dimensions are **logical units** — CSS px, iOS points, Android dp, terminal
cells — because that's what a driver is given and what a reader recognises.
`scale` carries the device pixel ratio separately.

Built-ins live in [`surfaces.ts`](../apps/hub/src/lib/surfaces.ts); a project
can add its own in `catalog.json › surfaces`. **Surface ids are load-bearing**:
they appear in capture paths and in `runs.json`, so renaming one orphans
existing captures. Add a surface instead of renaming one.

### `desktopStatus`/`mobileStatus` → `surfaceStatus`

```ts
surfaceStatus: Record<string, "done" | "pending" | "blocked" | "skipped">
```

A map, so a project can track a tablet or three phone sizes without a schema
change. `blocked` is new and earns its place: "we tried and the platform won't
let us" is different information from "we haven't got to it", and collapsing
them hides permanent limitations behind an implied backlog.

## Fields that exist to enforce honesty

These aren't metadata. They're the reason the output can be trusted.

**`action` on a step** — the interaction that produced this state. Required
after step 1. Without it, neither a reader nor the next agent can tell what
moved the app forward, and a "walkthrough" of five unrelated screenshots passes
for a walkthrough.

**`verificationStatus`** — `live-walked` (default), `synthetic` (described from
source, never captured), `gated-write` (surface reached, action deliberately not
taken because it would mutate real data).

The hub renders **nothing** for `live-walked`. That's deliberate: real capture
is the baseline promise, and a green tick on it would make the unmarked case
ambiguous. Only departures get a mark, so a page with no badges is a page you
can trust end to end.

**`synthetic` + `syntheticReason`** at feature and catalog level — the same
signal, scoped up.

**`note`** — genuine gaps only: a surface that doesn't exist yet, state you
can't reconstruct, a flow carrying real personal data. Explicitly *not* "it was
slow" or "it would have cost tokens".

**`target.sha` on a run** — the anchor for the whole drift-detection story.
Without it the run log is a list of dates, and "is this still true?" becomes
unanswerable.

**`target.dirty`** — whether the working tree had uncommitted changes. Means the
captures correspond to no commit at all, which a reader deciding whether to
trust them needs to know.

## Why files on disk, not a database

Captures live in `public/walkthroughs/{slug}/` and the metadata sits beside them
as JSON. That means:

- The URL for a capture is just its path. No image pipeline, no signing.
- Everything is greppable, diffable, and reviewable in a pull request. A
  walkthrough change shows up in review as prose and images, which is exactly
  the review you want.
- The skill writes files. No API, no auth, no schema migration, and it works
  from any runtime that can write a file.
- The hub is stateless and read-only. It can be deployed as a static-ish app,
  and a page render can never corrupt anything.

The cost is that nothing is transactional — a run interrupted halfway leaves
partial data. The mitigation is ordering: write the walkthrough file *first*,
then update `surfaceStatus`. An interrupted run then understates coverage rather
than overstating it, which is the correct direction to fail.
