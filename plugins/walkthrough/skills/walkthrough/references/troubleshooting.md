# Troubleshooting — symptoms and causes

Ordered by how often each one actually happens.

## Captures

**Two steps have identical bytes.**
A scroll or swipe that no-opped. `scrollIntoViewIfNeeded()` does nothing when
the element is already visible. Use an explicit `window.scrollTo` with a sticky-
header offset. See [`quality-invariants.md`](quality-invariants.md).

**Text renders in the wrong font, or wraps oddly.**
Captured before the webfont swapped in. `await page.evaluate(() =>
document.fonts.ready)` before capturing.

**Half-drawn page, skeletons, spinners.**
Waited on a duration instead of a condition. Wait for the element you intend to
document, not for 2 seconds.

**Blurry or soft at display size.**
`deviceScaleFactor: 1`. Use 2 for web and desktop, 3 for phones.

**A cursor, a notification, or a clock differs every run.**
Hide the cursor (`screencapture -x`), enter demo mode (Android), override the
status-bar clock (iOS `simctl status_bar`), pin `TZ`.

**The mobile capture is just the desktop layout, narrow.**
A narrow viewport is not a device. Use a real device descriptor so the user
agent, touch support and DPR are all set.

## Navigation and auth

**Redirected to the login screen mid-walk.**
A full page load discarded in-memory SPA auth. Navigate by clicking real links;
reserve `goto` for the entry point.

**Signed in, but the data looks wrong.**
Wrong role. Check the feature's `authRole`. Aggregate figures where personal
data belongs means you're an admin documenting a member's view.

**`$ENV_VAR` appears literally in a field.**
The variable isn't set. Populate `.env.local`. Never type the placeholder in.

**Locale switch appears not to have applied.**
It probably didn't. Assert `document.documentElement.dir === "rtl"` or check for
translated text, rather than trusting the URL changed.

## Environment

**Every API call 500s but the shell renders.**
A dependency is down. Bring up the whole stack, not just the front end. Don't
capture the empty states and call it documentation.

**The app shows someone else's data.**
Stale `.env` or an SSH tunnel on the API port. Curl the URL the app actually
uses and confirm it identifies as this project's API.

**The target app died mid-walk (`ERR_CONNECTION_REFUSED`).**
Check what you killed. `next dev` spawns a `next-server` process, so a
`pkill -f next-server` aimed at your own hub also kills a Next.js app under
test. Kill by port (`lsof -ti:3000 | xargs kill`) or by working directory, not
by a pattern that matches every Next process on the machine.

**Port is held by something unexpected.**
`lsof -a -p <PID> -d cwd` and `ps -p <PID> -o command=`. `ssh` means a
port-forward — it's the user's, ask before killing it. `docker-proxy` means a
stale container.

**Headless Chrome writes no file and doesn't exit.**
No `--timeout`, or two instances running at once. One capture per process, run
sequentially, always pass `--timeout`.

## Mobile

**Black screen right after boot.**
`adb wait-for-device` returns before the UI exists. Poll
`getprop sys.boot_completed`. On iOS, poll for `Booted` in `simctl list`.

**A permission dialog is the first capture.**
Pre-grant: `simctl privacy booted grant camera <bundle>`, or `adb install -g`.

**Walking a build from last week.**
`install`/`install -r` over an existing bundle succeeds silently either way.
Compare the installed version against what you just built.

**`input text` produced a truncated string.**
Android's `input text` can't handle spaces. Use `%s` per space.

**A swipe opened Control Center or went back.**
The gesture started within ~4pt of a screen edge, so iOS took it. Start further
in.

## Desktop

**A native file dialog blocks everything.**
Playwright can't see OS windows. Stub `dialog.showOpenDialog` in the Electron
main process, and say in the step's `action` that a file was chosen.

**AppleScript: "not allowed to send keystrokes".**
Accessibility permission isn't granted. **The user has to grant it** in System
Settings — you can't. Say so rather than retrying.

**`firstWindow()` returned a splash screen.**
Enumerate `app.windows()` and match on title or URL.

## CLI

**No colour, no progress bars, tables laid out differently.**
Running through a pipe, not a pty. `isatty()` is false so the tool switched
modes. Use `node-pty`.

**A prompt appears unanswered although the step says it was answered.**
Wrote before the reader attached. Wait for the prompt text in the buffer first,
and write `\r` rather than `\n`.

**Every capture differs from the last.**
Unpinned timestamps, durations, request ids or absolute paths. Normalize them
before rendering.

## Hub

**A capture shows an old version after a re-walk.**
The Next image optimizer caches on URL and captures are overwritten in place.
`images.minimumCacheTTL: 0` is set for this reason; if it recurs, clear
`apps/hub/.next/cache/images`.

**New captures don't appear at all.**
The page was prerendered. `export const dynamic = "force-dynamic"` is on the
root layout; make sure a new route hasn't overridden it.

**Markdown renders as literal asterisks.**
The content went into a plain `<p>` instead of `<Prose>`.

**A surface renders unframed with a slug for a label.**
Unrecognised surface id. Use a built-in or declare it in
`catalog.json › surfaces`.
