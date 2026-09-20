# Driver — iOS, via the Simulator

Requires macOS with Xcode and at least one iOS runtime installed. This driver
cannot drive a physical iPhone; if the user wants the app on their own device,
build and deploy with their normal tooling and say plainly that the walkthrough
can only be captured on a simulator.

## What's different from web, and why it changes the plan

**There are no URLs.** Navigation is tapping. You cannot deep-link to step 7 of
a flow unless the app registers a URL scheme, so most features have to be
reached by walking the app's own path from launch. Plan longer walks and expect
each one to carry its own setup steps.

**The screen is the API.** There's no DOM. You work from the accessibility tree
and from coordinates in device points, which means a label change can break your
script in a way that no type checker catches.

**State is sticky and global.** The app keeps its container between launches:
onboarding stays dismissed, permission grants persist, the keychain holds the
last session. Great for speed, terrible for reproducibility — a walk that
"works" may depend on state from a previous run that a fresh machine won't have.

**Permission dialogs are modal and they block everything.** Camera, photos,
notifications, location. Pre-grant them or your first capture is a system alert.

## Bring-up

```bash
# What's available
xcrun simctl list devices available

# Boot (idempotent — already-booted is fine)
xcrun simctl boot "iPhone 17 Pro" || true
open -a Simulator

# Build for the simulator
xcodebuild -scheme Fieldnote -sdk iphonesimulator -configuration Debug \
  -derivedDataPath .build build

# Install and launch
APP=.build/Build/Products/Debug-iphonesimulator/Fieldnote.app
xcrun simctl install booted "$APP"
xcrun simctl launch booted com.example.fieldnote
```

Cold boot is 20–40s. Poll `xcrun simctl list devices | grep Booted` rather than
sleeping a fixed amount.

### Verify you installed what you just built

The single most wasted iOS run is walking last week's build. The container
persists, so `install` over an existing bundle id succeeds silently either way.

```bash
# Where the installed bundle actually lives
xcrun simctl get_app_container booted com.example.fieldnote app
# Compare its Info.plist build number to the one you just produced
/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "<container>/Info.plist"
```

If they differ, the install didn't take. Uninstall and retry.

## Reset state deliberately

Decide which you want and do it explicitly, rather than inheriting whatever the
last run left:

```bash
# Nuclear: factory-fresh device. Slowest, most reproducible.
xcrun simctl erase "iPhone 17 Pro"

# Just this app: clears its container, keeps the device warm.
xcrun simctl uninstall booted com.example.fieldnote

# Keep state, but pre-grant permissions so no modal interrupts the walk.
xcrun simctl privacy booted grant camera com.example.fieldnote
xcrun simctl privacy booted grant photos com.example.fieldnote
xcrun simctl privacy booted grant location com.example.fieldnote
```

Record what you did in `runs.json › config.notes`. "Walked from a factory-erased
device" and "walked with an existing signed-in session" produce different
documentation, and a reader needs to know which.

## Driving it

The simulator control tool (when the agent has one) is the best option: it
exposes `screenshot`, `inspect` (the accessibility tree as JSON, with each
element's frame in device points), `tap`, `swipe`, `touch_path`, `text`,
`button` and `open_url`.

**Use `inspect` to find what to tap, not a screenshot.** The tree gives you an
element's label, value, enabled state and frame; tap the frame's centre. Reading
coordinates off a screenshot by eye is how you end up tapping a 2-point gap
between two buttons. Use screenshots for what they're actually good at: layout,
colour, and images.

`inspect` also tells you things a screenshot can't — whether a control is
disabled, what a field's real value is (as opposed to its placeholder), and what
a screen reader would announce. That last one is worth capturing on its own for
an accessibility walk.

Without a control tool, fall back to `simctl` plus AppleScript:

```bash
xcrun simctl io booted screenshot out.png
xcrun simctl openurl booted "fieldnote://settings"     # if a scheme is registered
```

`simctl` has no tap primitive, so interaction needs AppleScript UI scripting
against the Simulator window — workable but brittle. Prefer a control tool, and
if you only have `simctl`, say in the output that interaction was limited.

### Edge gestures

A swipe starting within ~4pt of a screen edge performs the **OS** gesture, not a
drag in your app: left = back, top = notification shade, bottom = home or app
switcher, right = Control Center. To scroll content near the bezel, start more
than 4pt in. Getting this wrong produces a capture of the iOS notification
shade, which is at least an obvious failure.

## Surfaces

| Surface id | Device | Points |
|---|---|---|
| `iphone` | iPhone 17 Pro | 402 × 874 |
| `iphone-landscape` | iPhone 17 Pro | 874 × 402 |
| `ipad` | iPad Pro 11-inch | 834 × 1210 |

Rotate before capturing, never during:

```bash
xcrun simctl status_bar booted override --time "9:41"   # deterministic status bar
```

Overriding the clock is worth doing on every run. Otherwise every capture
differs from the last by the time in the corner, which makes visual diffs
useless and looks sloppy in a published guide.

## Locations

`location` is a screen identifier — the SwiftUI view name, the storyboard
identifier, or a registered deep link. Be consistent within a project: mixing
`SettingsScreen` and `fieldnote://settings` for the same screen makes the
feature index read as two places.

## Reading logs

```bash
xcrun simctl spawn booted log stream --predicate 'subsystem == "com.example.fieldnote"' --level debug
```

Check this after launch and before interacting, same as a web console. Crash
reports land in `~/Library/Logs/DiagnosticReports/` — if the app dies mid-walk,
attach the relevant excerpt to the issue rather than just "it crashed".

## Video

```bash
xcrun simctl io booted recordVideo --codec h264 out.mp4   # Ctrl-C to stop
```

Records the device screen including system UI. No audio.

## Blocked features

A feature needing hardware the simulator doesn't have — a real camera feed,
Face ID, NFC, a cellular radio, push notifications from a live APNs — is
`surfaceStatus: { iphone: "blocked" }` with a `notes` entry naming the
capability. That's a real, permanent limitation and the honest thing to record.
Don't stub it and don't describe the screen as though you saw it.
