# Catalog discovery — finding an app's features

"What are this app's features" is the most platform-specific question in the
skill. A Next.js route tree, a SwiftUI navigation graph and a Cobra command tree
share no structure at all, so this file has a section per platform.

## What you're producing, on every platform

For each feature: a stable `featureId`, a human `featureName`, a `location`, a
`category`, auth requirements, and an empty `surfaceStatus`.

Three rules that apply regardless of platform, because breaking them is what
makes a catalog untrustworthy:

**Name features the way a user would.** `CaseDetailContainerV2` is a component;
"Reviewing a case" is a feature. The name is what appears in the index, and a
reader searching for how to review a case will not search for a class name.

**A screen is not automatically a feature.** Layouts, error boundaries,
redirects, auth callbacks and loading shells are plumbing. A feature is
something a user would say they *did*.

**Variants are not features.** A locale, a form factor, a light/dark theme and a
feature-flag state are all axes *through* a feature, not features. Catalogue
`checkout` once; put locale in `locale` and form factor in `surface`. This is
the mistake that inflates a feature count threefold and it's the first thing the
hub flags.

Once you have the list, derive `category` from the app's own grouping — a route
group, a tab bar, a settings section, a command group. Categories you invent
from scratch tend not to match how the team talks about the product.

---

## Web

**Next.js App Router** — glob `**/page.{tsx,jsx,ts,js}` under `app/` or
`src/app/`. Build the route from the directory path, dropping route groups
(`(marketing)`) and expanding dynamic segments (`[id]`) into a concrete example
using real data you can find. `/cases/[id]` is not a walkable location;
`/cases/4821` is.

**Pages Router** — glob `pages/**/*.{tsx,jsx}`, excluding `_app`, `_document`,
`api/`.

**Vite / CRA / SPA** — parse the router config (`createBrowserRouter`,
`<Route>` trees, `routes.ts`). The file tree tells you nothing here.

**Angular** — `*-routing.module.ts`, or `app.routes.ts` for standalone.

**Server-rendered** (Rails, Django, Laravel, Phoenix) — the routes file is
authoritative: `config/routes.rb`, `urls.py`, `web.php`, `router.ex`. Filter to
`GET` routes that render HTML; skip JSON endpoints.

Then:

- **Names from navigation.** The sidebar, header and tab components hold the
  app's own words for its features. Far better than humanising a slug.
- **Auth from middleware.** `middleware.ts`, route guards, `before_action`,
  `@login_required`, layout-level session checks. Note which *role* each route
  needs, not just that it needs one.
- **Locales.** If routes are `[locale]`-prefixed or there's an i18n config,
  every route is one feature with N locales. Do not emit `/ar/...` routes as
  separate features.
- **Test ids.** Grep for `data-testid` in the feature's components and record
  them — they're the most change-resistant selectors available and they make
  the next walk faster.

---

## iOS

There's no route table, so read navigation code:

- **SwiftUI** — `NavigationStack`, `NavigationLink`, `.sheet`, `.fullScreenCover`,
  `TabView`. Each `TabView` item is usually a top-level feature; each
  `NavigationLink` destination a sub-feature. `enum Route` / `navigationDestination`
  patterns are the closest thing to a route table you'll get — start there.
- **UIKit** — storyboard segues (`*.storyboard`, grep `<segue`),
  `pushViewController`, `present(`. Storyboard scene identifiers make good
  `location` values.
- **Deep links** — `CFBundleURLTypes` in `Info.plist` plus the `onOpenURL` /
  `application(_:open:)` handler. Every scheme the app registers is a location
  you can jump straight to, which shortens every walk that uses it. Worth
  finding early.
- **Auth** — keychain reads, an `AuthViewModel`/`SessionStore`, a root view that
  switches on a signed-in flag. Note whether sign-in is scriptable or needs a
  human (Sign in with Apple, biometric).

`location` is the SwiftUI view name, the storyboard identifier, or the deep
link. Pick one convention per project and hold it.

Read the tab bar and any settings list for feature *names* — same principle as
web navigation.

---

## Android

- **Compose Navigation** — `NavHost { composable("route") { … } }`. This is a
  genuine route table; use the route strings as `location`.
- **Fragment navigation** — `res/navigation/*.xml`, `<fragment
  android:id=… android:name=…>`.
- **Activities** — `AndroidManifest.xml`. Anything with a `LAUNCHER` category is
  an entry point; anything with a `VIEW` intent filter is deep-linkable.
- **Auth** — `AccountManager`, EncryptedSharedPreferences, an interceptor adding
  a bearer token, a start-destination that branches on a session.

`location` is `com.acme/.SettingsActivity` for activities or the Compose route
string for composables. Activities are directly launchable via `am start`, which
makes them the cheapest features to isolate — prefer them as entry points.

Names come from `res/values/strings.xml` (the labels the app actually shows) and
from the bottom-nav or drawer menu XML.

---

## Desktop

- **Electron** — the renderer is a web app: find its router as per Web. Then
  read the main process for the menu template (`Menu.buildFromTemplate`), tray
  menu, global shortcuts and IPC channels. Menu items are features that the
  renderer's router knows nothing about, and they're easy to miss entirely.
- **macOS native** — `MainMenu.xib` / the menu-building code, window
  controllers, preference panes, toolbar items.
- **Windows native** — XAML page navigation, ribbon/menu definitions.

`location` is a ` › `-separated window and pane path: `Preferences › Network`.

Walk the menu bar explicitly. On desktop, a large share of functionality lives
in menus and is unreachable from the main window — an incomplete catalog here is
the norm unless you go looking.

---

## CLI

The command tree *is* the catalog, and it's usually machine-readable:

- **Cobra (Go)** — `cmd/*.go`, `&cobra.Command{Use: …, Short: …}`. The `Use` is
  your location and the `Short` is your feature name, already written by the
  authors.
- **Click / Typer (Python)** — `@click.command()`, `@app.command()`.
- **Commander / yargs / oclif (Node)** — `.command(…)` chains, or oclif's
  `src/commands/` directory tree.
- **clap (Rust)** — `#[derive(Parser)]` structs and subcommand enums.

Fastest reliable approach: run `<binary> --help`, then `<binary> <group> --help`
for each group. That gives you the tree the tool actually exposes today, which
can differ from what the source suggests if commands are registered
conditionally.

One feature per command or command group. `acme auth login`, `acme auth logout`
and `acme auth status` are better documented as one `acme auth` feature with
three steps than as three features with one step each — they're a single
workflow, and the hub flags one-step walkthroughs for good reason.

`location` is the invocation: `acme deploy --dry-run`.

Flags are not features. A flag that materially changes behaviour (`--dry-run`,
`--json`) earns a *step* inside its command's feature.

---

## Existing status

For each discovered feature, check what's already captured before planning work:

- A `{featureId}.{surfaceId}.json` on disk → that surface is `done`.
- `runs.json` → compute the staleness verdict per
  [`run-history.md`](run-history.md) and surface the affected features.
- `issues.json` → the open count for that feature.

**Compute staleness at read time; never persist a verdict.** It's wrong the
moment someone pushes.

If the latest run is `fresh` and the target sha hasn't moved, there's nothing
new to capture. Say so and confirm before spending the time.

---

## Brand

Worth five minutes so generated guides look like the product rather than like a
generic template:

- **Web** — CSS custom properties in the global stylesheet, `tailwind.config`
  theme colours, the font imports in the root layout, the logo in `public/`.
- **iOS** — `Assets.xcassets` colour sets, `Info.plist` fonts, the app icon.
- **Android** — `res/values/colors.xml`, `themes.xml`, `mipmap-*` icons.
- **CLI** — the palette the tool uses for its own output; the ASCII banner if
  it has one.

Record it in `catalog.json › brand`. Prefer the app's own token names over
hex values you sampled from a screenshot.
