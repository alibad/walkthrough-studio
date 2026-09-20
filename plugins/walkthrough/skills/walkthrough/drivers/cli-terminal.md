# Driver — command-line tools

A CLI is an app with features, personas and regressions, and it documents itself
worse than most: `--help` shows syntax, never the shape of the output or what a
failure looks like. Captured terminal frames fix exactly that.

## The model

- A **feature** is a command or a command group — `acme deploy`, `acme auth`.
- A **step** is one invocation plus the output it produced.
- A **capture** is a rendered frame of the terminal after that invocation.
- `location` is the invocation itself: `acme deploy --dry-run`.

This maps cleanly onto the schema and needs no special cases — which is the
point of generalizing `location` to a plain string.

## Why a pseudo-terminal, not piped output

Run the binary under a pty. Redirecting to a pipe changes the program's
behaviour in ways that make the capture unrepresentative:

- `isatty()` returns false, so most tools **disable colour**, drop progress
  bars and spinners, and switch to a machine-readable layout.
- Terminal width is unknown, so tables and wrapped help text lay out
  differently — usually to 80 columns regardless of the real terminal.
- Interactive prompts either hang forever or are skipped entirely.

A capture of piped output documents a mode almost no user sees.

```js
import * as pty from "node-pty";

const term = pty.spawn("acme", ["deploy", "--dry-run"], {
  name: "xterm-256color",
  cols: 100,
  rows: 30,
  cwd: fixtureDir,
  env: {
    ...process.env,
    TERM: "xterm-256color",
    // Pin everything that would otherwise vary between runs:
    FORCE_COLOR: "1",
    NO_COLOR: undefined,
    COLUMNS: "100",
    TZ: "UTC",
    LANG: "en_US.UTF-8",
  },
});

let buffer = "";
term.onData((d) => { buffer += d; });
await new Promise((res) => term.onExit(res));
```

The `cols`/`rows` must match the surface definition — `terminal` is 100×30,
`terminal-narrow` is 80×24. Width is the contract for a CLI surface, because
width is what wraps output and breaks tables. Capturing `terminal` at 120
columns and labelling it 100 misrepresents the exact thing the surface exists to
test.

## Rendering a frame

The raw buffer contains ANSI escape sequences. Two ways to turn it into a PNG:

**1. Render the ANSI to HTML, screenshot it.** Most reliable and it reuses the
web driver you already have. Convert with `ansi-to-html` or `aha`, wrap it in a
page with a monospace font and the terminal's palette, then capture with
Playwright at the surface size.

**2. Use a terminal recorder.** `asciinema rec` produces a cast file, and
`agg`/`svg-term-cli` render it to GIF or SVG. Good for motion — progress bars,
spinners, streaming logs — where a still frame loses the point.

Either way, **strip or pin anything that varies**: timestamps, durations
("completed in 1.34s"), request ids, absolute paths containing a home
directory, hostnames. Without that, every capture differs from the last and the
duplicate-detection that protects other platforms gives you no signal here
because nothing is ever identical.

```js
const stable = buffer
  .replace(/\b\d+\.\d+s\b/g, "0.00s")
  .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/g, "00000000-0000-0000-0000-000000000000")
  .replaceAll(process.env.HOME, "~");
```

## What to capture

The states a CLI user actually hits, in this order of value:

1. **The successful run**, with its real output. The peak moment.
2. **`--help` for the command.** It's the most-read text in any CLI and the
   most likely to have drifted from the flags the code accepts.
3. **A realistic failure.** Missing credentials, a bad flag, a validation error,
   a network timeout. This is what people search for, and it's almost never
   documented. Drive it deliberately: unset the token, pass a bad value.
4. **The interactive prompt**, for commands that ask. Capture the prompt, then
   capture the result of answering it.
5. **`--dry-run` or plan output**, where the tool has one.

A CLI walkthrough that shows only `--help` is a copy of `--help`. The output is
the feature.

## Interactive prompts

```js
term.write("prod\r");     // \r, not \n — a pty wants carriage return
```

Wait for the prompt to appear in the buffer before writing, rather than writing
on a timer:

```js
await waitFor(() => /Environment:\s*$/.test(buffer));
term.write("prod\r");
```

Writing early gets swallowed before the reader attaches, and the capture shows
an unanswered prompt while the step claims it was answered.

## Destructive commands

`acme deploy --prod`, `acme db reset`, anything that writes to a real system:
capture the confirmation prompt, then **don't confirm**. Mark the step
`verificationStatus: "gated-write"` — the hub badges it "Not executed" and the
reader knows exactly where the documentation stops.

Better where possible: point the CLI at a fixture or a local stack and run it
for real. A captured successful deploy against a throwaway target is worth far
more than a captured confirmation prompt.

## Working directory and fixtures

Most CLIs behave differently depending on where they run — a config file
present or absent, a git repo initialised or not. Create a fixture directory per
feature, commit it under
`apps/hub/public/walkthroughs/{slug}/fixtures/{featureId}/`, and set it as the
pty's `cwd`. That makes the walk reproducible; running in whatever directory you
happened to be in does not.

## Verify you're running the right binary

```bash
which -a acme
acme --version
```

A global install from three months ago on `$PATH` ahead of the local build is
the classic wasted CLI run. Prefer an explicit path (`./bin/acme`,
`node dist/cli.js`) and record it in `runs.json › config.capturedAgainst`.

## Surfaces

| Surface id | Grid | Use |
|---|---|---|
| `terminal` | 100 × 30 | default |
| `terminal-narrow` | 80 × 24 | the width that actually breaks tables |

Capturing both is worth it for any tool that prints tabular output — 80 columns
is where column truncation and ugly wrapping show up, and it's still a very
common real terminal size.
