# Walkthrough Studio — agent contract

This file is the shared contract for **every** agent working in this repo, and
it is deliberately the only copy. `CLAUDE.md` imports it; Codex and any other
agent that reads `AGENTS.md` get it directly. If you are adding guidance, add it
here — not to a runtime-specific file, where the other runtime will never see it.

## What this repo is

Two halves that share one data contract:

```
plugins/walkthrough/   the SKILL — drives an app and writes down what it saw
apps/hub/              the HUB   — reads what the skill wrote and publishes it
```

The contract between them is
[`apps/hub/src/lib/types.ts`](apps/hub/src/lib/types.ts), documented for
authors in
[`plugins/walkthrough/skills/walkthrough/references/output-format.md`](plugins/walkthrough/skills/walkthrough/references/output-format.md).
**Change one and you must change the other in the same commit.** A skill writing
a field the hub doesn't read produces a page that renders and silently omits
content — the worst kind of failure here, because it looks fine.

## The skill

**Canonical location:**
`plugins/walkthrough/skills/walkthrough/SKILL.md`

Read it before doing any walkthrough work — capturing, documenting,
screenshotting or QA'ing an application. Don't improvise from this summary; the
skill has the platform-specific mechanics and the failure modes.

How each runtime finds it:

| Runtime | Mechanism |
|---|---|
| **Claude Code** | `.claude/skills/walkthrough` → symlink to the canonical path. Invoke with `/walkthrough`. Also installable as a plugin via `.claude-plugin/marketplace.json`. |
| **Codex** | `.codex/prompts/walkthrough.md` provides `/walkthrough`. Failing that, read the canonical path directly — this section is why you know where it is. |
| **Anything else** | Read the canonical path. The skill is plain markdown with no runtime-specific dependencies. |

If skill auto-discovery isn't working in your runtime, that's an inconvenience,
not a blocker: open `SKILL.md` and follow it.

## The one rule

**A walkthrough may only assert what was observed.**

Never describe a screen you didn't reach. Never present a described state as a
captured one. Never write a JSON file you know to be misleading. A missing
walkthrough costs ten minutes to produce; a plausible false one poisons every
decision made from it, and nobody will know to check.

Concretely, and enforced by
[`apps/hub/src/lib/catalog-health.ts`](apps/hub/src/lib/catalog-health.ts):

- Every step after the first records the `action` that produced its state.
- No two captures in a walkthrough may be byte-identical. Hash at capture time
  and fail loudly — identical bytes mean nothing happened between those steps.
- Anything not driven live is marked `verificationStatus: "synthetic"` or
  `"gated-write"`. Unmarked means "I really did this".
- `surfaceStatus: "done"` requires a walkthrough file on disk.
- Locales and form factors are **variants**, not features. One `featureId`, with
  `locale` and `surface` as axes.
- Every run appends to `runs.json` with the target git sha. Skip it and drift
  detection stops working, silently and permanently, for that project.

Full list with causes and prevention:
[`references/quality-invariants.md`](plugins/walkthrough/skills/walkthrough/references/quality-invariants.md).

## Never edit the app you're documenting

A walkthrough observes the product as its team committed it. It is not
authorized to unblock itself by stubbing a broken page, deleting a failing
import, or changing config to skip a route.

If a screen crashes or 500s, the correct output is
`surfaceStatus: { <surface>: "blocked" }`, a `notes` entry, and an entry in
`issues.json`. You may fix the **environment** — start a service, change a port,
set an env var, install a missing dependency — but announce it and name the
files it touches first. Fix mode (`--fix`) is the only mode authorized to change
application code, and only when the user invokes it.

## Secrets

Target apps live behind auth gates. `projects.json` is committed and holds
**`$ENV_VAR` placeholders only**:

```jsonc
"auth": { "roles": { "default": { "password": "$ACME_STAGING_PASSWORD" } } }
```

Values live in `.env.local` (gitignored). A missing variable is a loud failure —
ask the user to populate it. Never proceed unauthenticated and capture the login
wall, and never commit a literal password, an API key or a `storageState.json`.
If you see a literal secret in a diff to `projects.json`, stop and move it.

## The hub renders only what it can stand behind

The rule is **walk the data before you build the panel**, and it is the reason
this hub is small. An earlier version shipped a fixes gallery, a credentials
page and a tab bar over surfaces that had nothing behind them, which made the
tool look several times larger than it was.

What renders, and what it answers:

| Surface | Question |
|---|---|
| the library chart | which apps exist, on what platforms, how covered |
| the project page | can I trust this, and what's here |
| the feature reader | what does this screen do |
| the persona + journey reader | who uses this, and what happened to them |

`VerifiedFix` remains in the contract and in `output-format.md` — the skill
still writes it — and nothing renders it, because nothing has verified a fix
here yet. Open issues surface inside the health banner rather than in a tab of
their own, because "what the walk found broken" *is* a quality finding and a
separate tab made them easy to miss.

**On the persona layer specifically.** It was cut once and that was a mistake
worth recording, because the reasoning was circular: it was removed on the
grounds that nothing had walked a persona — which is true of every feature
before someone walks it. The layer had *zero* coupling to the web-only
ancestor; the two fields tying it to the old world were `viewport` and `route`,
the same two generalizations already applied to features. Meanwhile it is the
artifact non-engineers actually read: a feature grid is a filing cabinet, and a
persona journey is the thing you show someone. Cut scaffolding, not the
artifact.

There is no shadcn/ui and no component library. The 12 primitives that were
copied in went unused (11 never imported at all, the twelfth a no-op provider),
so they and three dependencies were removed. Build UI from the theme tokens.

## Working on the hub

Next.js 16 App Router, React 19, Tailwind v4, TypeScript strict.

- **Nothing is cached.** `export const dynamic = "force-dynamic"` is on the root
  layout because every page derives from files on disk plus live `git log`
  calls. A prerendered page is frozen documentation, which defeats the point.
  Don't add a route that opts out.
- **Server/client boundary.** `lib/target-git.ts` and `lib/run-history.ts` shell
  out to git, so they can never be imported by a client component — it drags
  `node:child_process` into the browser bundle and fails the build. Display
  strings for server-computed values live next to the component that renders
  them; see the `STALENESS_COPY` note in
  [`apps/hub/src/components/status.tsx`](apps/hub/src/components/status.tsx).
- **Every generated plate must have a render site.** `pnpm creatives` chains
  generate → optimize → **audit**, and the audit fails the build if a plate is
  on disk but rendered nowhere, referenced but missing, or declared in the
  manifest without a `renders:` field. This exists because the first pass
  generated nine plates and wired up two. Run `pnpm audit:art` before claiming
  the visuals are done.
- **Theme: paper and ink.** One light register, one accent (vermilion), type
  doing the hierarchy rather than nested boxes. Tokens and the reasoning are in
  [`apps/hub/src/app/globals.css`](apps/hub/src/app/globals.css) and
  [`docs/theme.md`](docs/theme.md). Adding a token is cheap; adding a second
  accent costs the legibility of the first.
- **Captures are mutable content at stable paths.** A re-walk overwrites
  `step-01.png` in place, so `images.minimumCacheTTL: 0` is set. Don't raise it.
- **Markdown from a capture agent goes through `<Prose>`**, never into a bare
  `<p>` — you'll get literal asterisks.
- **No native browser dialogs.** No `confirm()`, `alert()`, `prompt()` or a
  native `<select>`. There's no component library here, so build from the
  tokens — and reach for a real element before a custom overlay.

Verify with `pnpm typecheck` and `pnpm build`. Both are expected to pass with no
warnings.

## The shipped sample is a public site

`wikipedia` is the only registered app. It's there because anyone who clones
this repo can re-run `pnpm walk:sample` and get comparable output — no account,
no local build, no secrets, and article text under CC BY-SA that's fine to ship
captures of.

**Keep it that way.** No client work, no customer names, no internal hostnames,
no employer branding anywhere in this repo — it is meant to be shareable. If
you walk something private, `pnpm reset:demo` empties the hub first.

One honest limitation the sample makes visible: a third-party site has no local
checkout, so drift reads `unknown` and the card says why. Drift only truly
works on an app you have the source for — which is the point of the
`codebase.local` field.

## Commits

Don't create commits unless asked. When asked, categorize the changes first and
make one commit per category (`feat`, `fix`, `refactor`, `docs`, `chore`).

## Layout

```
apps/hub/
  projects.json              app registry (human-maintained; no secrets)
  public/art/                generated brand illustration
  public/walkthroughs/{slug}/ everything the skill writes, per app
  src/lib/types.ts           THE CONTRACT
  src/lib/surfaces.ts        surface registry — ids are load-bearing
  src/lib/platforms.ts       platform metadata and driver defaults
  src/lib/catalog-health.ts  the self-criticism checks
  src/lib/run-history.ts     runs + staleness (server only)
plugins/walkthrough/
  skills/walkthrough/
    SKILL.md                 start here
    references/              contracts and runbooks
    drivers/                 one per platform
scripts/
  walk-wikipedia.mjs              reference walk script — clone this
  generate-creatives.mjs     brand illustration via gpt-image-2
  optimize-art.mjs           grayscale + resize the generated PNGs
  new-project.mjs            scaffold a registry entry
docs/
  schema.md  platforms.md  theme.md
```
