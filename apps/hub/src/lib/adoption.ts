/**
 * Everything the hub needs to tell someone how to use this on their own app.
 *
 * Kept as data rather than JSX so the install page, the repo card and the
 * empty state all quote the *same* commands. A README that has drifted from
 * the page beside it is the standard failure here, and it is embarrassing in a
 * project whose entire premise is documentation that stays true.
 */

export const REPO = {
  owner: "alibad",
  name: "walkthrough-studio",
  url: "https://github.com/alibad/walkthrough-studio",
  marketplace: "alibad/walkthrough-studio",
  license: "MIT",
  blurb:
    "The walkthrough skill, the swappable capture layer that enforces its quality invariants, and the hub that reads what they write.",
};

export interface InstallPath {
  id: string;
  runtime: string;
  summary: string;
  steps: { label: string; command?: string; detail?: string }[];
}

export const INSTALL_PATHS: InstallPath[] = [
  {
    id: "claude-code",
    runtime: "Claude Code",
    summary:
      "Add the marketplace, install the plugin, and the skill is available in every project on this machine.",
    steps: [
      {
        label: "Add the marketplace",
        command: "/plugin marketplace add alibad/walkthrough-studio",
      },
      {
        label: "Install the plugin",
        command: "/plugin install walkthrough@walkthrough-studio",
      },
      {
        label: "Walk something",
        command: "/walkthrough",
        detail:
          "With no argument it catalogs the app, shows you the plan and the estimated time, and waits for you to say go.",
      },
    ],
  },
  {
    id: "codex",
    runtime: "Codex",
    summary:
      "The same skill ships a Codex plugin manifest, so it loads with its own interface metadata and prompts.",
    steps: [
      {
        label: "Clone the repo",
        command: "git clone https://github.com/alibad/walkthrough-studio.git",
      },
      {
        label: "Point Codex at the plugin",
        command: "codex plugin add ./walkthrough-studio/plugins/walkthrough",
      },
      {
        label: "Walk something",
        command: "walkthrough: document this app end to end",
      },
    ],
  },
  {
    id: "any-agent",
    runtime: "Any agent with a shell",
    summary:
      "The skill is a directory of markdown. Nothing in it is runtime-specific — copy it in and point your agent at SKILL.md.",
    steps: [
      {
        label: "Copy the skill into your project",
        command:
          "cp -R walkthrough-studio/plugins/walkthrough/skills/walkthrough .claude/skills/",
      },
      {
        label: "Or symlink it, so updates arrive with a git pull",
        command:
          "ln -s ../../walkthrough-studio/plugins/walkthrough/skills/walkthrough .claude/skills/walkthrough",
      },
      {
        label: "Read the entry point",
        command: "cat .claude/skills/walkthrough/SKILL.md",
        detail:
          "Platform mechanics live in drivers/, the JSON contract in references/output-format.md.",
      },
    ],
  },
];

/**
 * The invariants, as a promise to a reader rather than as code.
 *
 * Enforcement lives in `scripts/lib/capture/invariants.mjs` and is applied by
 * `scripts/lib/capture/session.mjs` to every backend. This list exists to say
 * what the promise *is*; `runs.json` records which of them each individual run
 * actually verified, which is the part you should believe.
 */
export const INVARIANT_PROMISES = [
  {
    id: "retina",
    label: "Retina pixels",
    promise: "Every capture carries twice the pixels of its CSS viewport, verified by measuring the PNG.",
    breaks: "A 1x capture of a text-dense UI is unreadable zoomed in, and looks identical in a file listing.",
  },
  {
    id: "animationsFrozen",
    label: "Nothing in motion",
    promise: "CSS animations are removed and Web Animations are finished before every capture.",
    breaks: "A mid-animation frame is a state the product never rests in.",
  },
  {
    id: "timeFrozen",
    label: "Time pinned",
    promise: "The page's clock is fixed, so a live timestamp cannot make two identical screens look different.",
    breaks: "A ticking clock silently disarms the duplicate check — it still runs, it just can never fire.",
  },
  {
    id: "freshContext",
    label: "A fresh context per feature",
    promise: "Each feature gets its own browser context, proven by a storage marker that must differ.",
    breaks: "Leaked state documents a session no real user had — and on a shared profile, one carrying your identity.",
  },
  {
    id: "realMobile",
    label: "A real phone, not a narrow window",
    promise: "Device scale, touch points and user agent are set together, then read back from the page.",
    breaks: "Sites pick their layout from the user agent; a narrow window documents a screen nobody sees.",
  },
  {
    id: "consoleNetwork",
    label: "Console and network kept",
    promise: "Errors and failed requests are collected during the walk and become issues.",
    breaks: "An empty list because the API is down looks exactly like an empty list that is a feature.",
  },
  {
    id: "distinctCaptures",
    label: "No two captures alike",
    promise: "Every capture is MD5-compared against every earlier one in the same walk, not just the previous.",
    breaks: "Identical bytes mean two claimed states with one real state behind them.",
  },
];
