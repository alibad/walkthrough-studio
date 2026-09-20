@AGENTS.md

<!--
  Everything lives in AGENTS.md so that Claude Code and Codex read the same
  contract from the same file. Adding Claude-specific guidance here means Codex
  never sees it, and the two runtimes drift — which for a repo whose whole point
  is "the docs match the product" would be embarrassing.

  The skill is at plugins/walkthrough/skills/walkthrough/SKILL.md and is exposed
  to Claude Code as a project skill via the .claude/skills/walkthrough symlink,
  so /walkthrough works without installing anything.
-->
