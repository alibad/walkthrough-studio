# Driver — desktop applications

Three sub-drivers with very different capabilities. Check which one applies
before planning the walk, because it determines whether you can interact at all.

| Sub-driver | When | Interaction |
|---|---|---|
| `electron` | Electron, and anything else shipping a Chromium renderer | Full — it's Playwright |
| `macos-native` | AppKit / SwiftUI / Catalyst on macOS | Accessibility API; workable |
| `windows-native` | Win32 / WinUI / WPF | UI Automation; workable |

Tauri, Wails and other webview shells sit between: the webview is usually
drivable by an automation protocol, but the shell isn't. Check whether the app
exposes a remote-debugging port before assuming.

---

## `electron` — the good case

Playwright launches Electron directly and gives you a real page object, so
everything in [`web-playwright.md`](web-playwright.md) applies — selectors,
`networkidle`, console and network logs, video, `setInputFiles`.

```js
import { _electron as electron } from "playwright";

const app = await electron.launch({
  args: ["dist/main/index.js"],
  env: { ...process.env, NODE_ENV: "production" },
});

const window = await app.firstWindow();
await window.waitForLoadState("domcontentloaded");
// … now it's an ordinary Playwright page …
await app.close();
```

### The parts that aren't the web

**Windows are plural and order isn't guaranteed.** `firstWindow()` returns
whichever window appeared first, which on a cold launch may be a splash screen
or an updater. Enumerate and pick by title or URL:

```js
for (const w of app.windows()) {
  if ((await w.title()).includes("Ledger")) { /* this one */ }
}
```

**Menus, tray icons and native dialogs live in the main process** and are not in
the page. A file-open dialog is an OS window Playwright can't see. Drive the
main process instead:

```js
// Evaluate in the MAIN process, not the renderer
await app.evaluate(async ({ dialog }) => {
  dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: ["/abs/path/to/fixture.csv"],
  });
});
```

Stubbing a native dialog is legitimate — it's the *test harness*, not the
application, and it's the only way to document an import flow. Say so in the
step's `action` ("Chose a CSV from the file picker") and keep the stub in the
walk script, not in application source.

**Window size is the surface.** Set it before the first capture:

```js
await app.evaluate(async ({ BrowserWindow }, [w, h]) => {
  BrowserWindow.getAllWindows()[0].setContentSize(w, h);
}, [1280, 800]);
```

---

## `macos-native`

No DOM, no renderer. You have screenshots and the accessibility API.

```bash
# Capture a specific window by id, with no shadow
osascript -e 'tell app "Ledger Desk" to activate'
WIN=$(GetWindowID "Ledger Desk" --list | head -1 | cut -d' ' -f1)
screencapture -o -l "$WIN" out.png

# Whole screen, no cursor
screencapture -x -C out.png
```

`-o` omits the drop shadow, which otherwise gives every capture a soft grey
halo that looks like a compression artifact when matted on paper.

Interaction is AppleScript UI scripting via System Events:

```applescript
tell application "System Events" to tell process "Ledger Desk"
  click menu item "Preferences…" of menu 1 of menu bar item "Ledger Desk" of menu bar 1
  set value of text field 1 of window 1 to "acme-prod"
  click button "Sync" of window 1
end tell
```

This needs Accessibility permission granted to the terminal or agent, which is a
one-time manual grant in System Settings — **the user has to do it**, you
can't. If scripting returns "not allowed to send keystrokes", that's the cause;
say so rather than retrying.

Element discovery:

```applescript
tell application "System Events" to tell process "Ledger Desk"
  get entire contents of window 1
end tell
```

Verbose but it's your view tree. UI scripting is brittle against label changes
and localization — pin down what you can by role and index, and leave a comment
in the script when a selector is fragile.

---

## `windows-native`

UI Automation, most easily through PowerShell or a small C#/Python harness
(`uiautomation`, `pywinauto`). Capture with `nircmd savescreenshotwin` or a
`System.Drawing` snippet.

The same rules hold: find elements by automation id or name from the tree, not
by pixel hunting; grant automation permission once; record what you stubbed.

---

## Locations

There are no URLs, so `location` is a window and pane path using ` › ` as the
separator:

```
Preferences › Network
Main › Accounts › Reconciliation
Import Wizard › Step 2
```

Be consistent — a reader uses these to find the screen themselves, and mixing
`Preferences › Network` with `Network settings` for the same pane makes the
feature index read as two places.

## Surfaces

| Surface id | Size | Frame |
|---|---|---|
| `window` | 1280 × 800 | title bar |
| `window-compact` | 900 × 620 | title bar |
| `fullscreen` | 1920 × 1080 | none |

Capture the window, not the whole screen, unless the feature *is* full-screen.
A capture containing the user's desktop wallpaper and dock leaks their
environment and dates the artifact.

## Determinism

- Hide or stub anything showing a clock, a build number, or a sync timestamp.
- On macOS, `defaults write -g NSAutomaticWindowAnimationsEnabled -bool false`
  removes window animations. Restore it afterwards.
- Set a fixed window position as well as a size, so captures crop identically
  run to run.

## Blocked features

An auto-updater that would actually update, a licence activation that consumes a
seat, an OS-level integration you can't reach — `surfaceStatus: { window:
"blocked" }` with a `notes` entry. For a destructive action you reached but
chose not to take, capture the armed state and mark the step
`verificationStatus: "gated-write"` — that's what it's for.
