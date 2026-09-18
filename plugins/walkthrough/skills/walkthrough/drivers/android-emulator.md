# Driver — Android, via emulator or device

Needs the Android SDK platform-tools (`adb`) and either a running emulator or an
attached device with USB debugging enabled. Unlike iOS, this driver works
against real hardware too — `adb` doesn't care which.

## What's different from iOS

**You can launch an activity directly.** This is the big one: `adb shell am
start` will jump straight to a screen, so features can be isolated rather than
always reached by walking the whole flow. Feature walks get shorter and less
fragile than their iOS equivalents.

**`uiautomator` gives you a real view tree as XML**, with resource ids, content
descriptions and bounds. Closer to querying a DOM than iOS's accessibility tree.

**Fragmentation is a genuine axis.** API level and manufacturer skin change
behaviour, not just pixels. If the project supports a wide range, capture the
oldest supported API as a second surface — that's where things actually break.

## Bring-up

```bash
# Available virtual devices
emulator -list-avds

# Boot, headless-ish and quiet
emulator -avd Pixel_9_API_36 -no-snapshot-load -no-boot-anim &

# Wait properly — `adb wait-for-device` returns before the UI is up
adb wait-for-device
adb shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done'

# Install and launch
adb install -r -g app/build/outputs/apk/debug/app-debug.apk   # -g grants all permissions
adb shell monkey -p com.acme.app -c android.intent.category.LAUNCHER 1
```

`-g` on install grants every manifest permission up front, which is the clean
way to avoid a permission dialog as your first capture.

`sys.boot_completed` is the check that matters. `adb wait-for-device` returns as
soon as the daemon connects, which is well before the launcher is drawable —
capture then and you get a black screen.

### Verify you installed what you built

```bash
adb shell dumpsys package com.acme.app | grep -E 'versionName|lastUpdateTime'
```

Compare against the APK you just produced. `install -r` over a same-version APK
succeeds either way, so a stale build is silent.

## Reset state

```bash
adb shell pm clear com.acme.app        # wipe app data, keep it installed
adb uninstall com.acme.app             # remove entirely
```

Note which you used in `runs.json › config.notes`.

## Deterministic captures

```bash
# Freeze the status bar clock and hide notification icons
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false

# Kill animations — the Android equivalent of prefers-reduced-motion
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
```

Do all of this before the first capture. Without demo mode, every screenshot
differs by the clock and whatever notification icons happen to be present, and
your visual diffs are worthless.

Exit demo mode when done: `adb shell am broadcast -a
com.android.systemui.demo -e command exit`.

## Driving it

```bash
# Capture
adb exec-out screencap -p > out.png

# The view tree, with resource ids and bounds
adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml -

# Tap the centre of an element whose bounds you read from the XML
adb shell input tap 540 1180
adb shell input swipe 540 1600 540 600 300      # x1 y1 x2 y2 duration_ms
adb shell input text "4800"                     # no spaces — use %s for those
adb shell input keyevent KEYCODE_BACK

# Jump straight to a screen
adb shell am start -n com.acme/.SettingsActivity
adb shell am start -a android.intent.action.VIEW -d "acme://settings"
```

**`input text` does not handle spaces.** Use `%s` for each space, or you'll get
a truncated string and a capture that shows the wrong input. Special characters
need escaping too — for anything non-trivial, prefer setting the field via a
test hook if the app has one.

Parse the `uiautomator` XML for `bounds="[l,t][r,b]"` and tap the centre. Don't
read coordinates off a screenshot by eye.

## Surfaces

| Surface id | Device | dp |
|---|---|---|
| `android-phone` | Pixel 9 | 412 × 915 |
| `android-tablet` | Pixel Tablet | 800 × 1280 |

`adb shell wm size` and `wm density` report the real values; derive dp as
`px / (density / 160)`. If they don't match the surface definition, fix the
surface definition rather than mislabelling the capture.

## Logs

```bash
adb logcat -c                                   # clear before the walk
adb logcat --pid=$(adb shell pidof -s com.acme.app) *:W
```

Clear first, then read after launch and before interacting. Attach the relevant
excerpt to any issue you file — a stack trace in `issues.json › evidence` is
worth far more than "the screen was blank".

## Video

```bash
adb shell screenrecord --time-limit 60 /sdcard/demo.mp4
adb pull /sdcard/demo.mp4 -
```

Capped at 3 minutes per invocation, no audio, and it stops on rotation. For
anything longer, record segments and concatenate.

## Locations

`location` is an activity (`com.acme/.SettingsActivity`), a Compose route, or a
deep link. Prefer whichever the app's own developers use in navigation code —
that's what a reader will be able to search for.
