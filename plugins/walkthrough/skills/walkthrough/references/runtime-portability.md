# Runtime and OS portability

The skill is portable because it selects capabilities, not because every host
uses the same named tool. Codex, Claude, macOS, and Windows may expose different
controls. They must still produce the same evidence contract.

## The three-layer model

1. **Reconnaissance/control** — inspect the live accessibility tree or DOM,
   navigate, discover hidden entry points, and understand the real interaction.
   Use the host's computer-use/browser-control facility when available.
2. **Deterministic capture** — create isolated contexts, set the surface before
   launch, freeze time and animation where possible, record screenshots/video,
   and collect console/network evidence. Use the repository capture layer.
3. **Artifact validation** — measure dimensions, reject duplicates and blank
   frames, verify referenced files, and inspect every result. This layer is
   identical on every host.

Computer use and Playwright are complementary. Computer use is often the best
way to learn an unfamiliar product. Playwright/CDP is usually the better web
recorder because it produces repeatable files with controlled surfaces, video,
console, and network logs. Do not substitute one narrow screenshot for a real
native session simply because it is easy to automate.

## Capability probe

Before a run, record which of these are available:

- live control: accessibility tree, browser DOM, or terminal/PTY;
- screenshots written to a known path;
- video recording;
- exact surface dimensions and device scale;
- isolated session/storage;
- console and network capture;
- native device or simulator access where the target is native.

Pick the backend that satisfies the most required invariants. If video is
required and the exploration tool cannot write a clip, keep it for discovery
and hand recording to a video-capable backend. Record every missing capability
in `runs.json`; never silently downgrade.

File existence is not video verification. Play every referenced clip through
the hub on the target host. Chromium's Playwright recorder emits WebM, while
some WebKit-backed desktop browsers reject it; normalize to H.264 MP4 when
`ffmpeg` is available. If normalization is unavailable, keep the source and
record the portability gap instead of marking video complete.

## Host agents

| Host | Reconnaissance | Publishable evidence |
|---|---|---|
| Codex | computer control/in-app browser when exposed, otherwise browser or terminal control | repository capture layer and the platform driver |
| Claude Code/Desktop | browser/computer-use integration when exposed, otherwise browser or terminal control | the same repository capture layer and platform driver |

Do not put host-specific tool call syntax in catalog or walkthrough data. Walk
scripts must call the driver contract so another host can rerun them.

## Operating systems

| Target | macOS | Windows |
|---|---|---|
| Web | Playwright or CDP; computer control for discovery | Playwright or CDP; computer control for discovery |
| iOS native | Xcode Simulator and `simctl` | unavailable locally; use a Mac host or mark blocked |
| Android native | Android emulator/device with `adb` | Android emulator/device with `adb` |
| Desktop native | Electron or macOS Accessibility | Electron or Windows UI Automation |
| CLI | PTY/terminal driver | ConPTY/terminal driver |

An emulated mobile browser is valid evidence for a responsive **web** surface.
It is never evidence of an iOS or Android **native** app.

## Cross-platform scripts

- Prefer checked-in Node scripts over shell pipelines so the same command runs
  in zsh, PowerShell, and `cmd.exe`.
- Resolve paths with `node:path`; do not bake `/tmp`, drive letters, or shell
  expansion into walk scripts.
- Probe executables and drivers at runtime and print the selected path.
- Keep OS-specific launch mechanics behind driver modules.
- Fail with a precise capability gap and a rerun option. Never claim
  "flawless" or "complete" when the required target could not be exercised.
