/**
 * Which agent is driving, and therefore what actually needs to be configured.
 *
 * ── The point ──────────────────────────────────────────────────────────────
 *
 * A walk is run by an agent, and an agent is already a model. It writes the
 * persona bios, the step descriptions and the findings itself — paying an API
 * to write those sentences would be paying twice for the same sentence. So the
 * only gaps worth a key are the artifacts a coding agent genuinely cannot
 * return from a tool call: a PNG of a face, and an MP3 of a voice.
 *
 * And even those are host-dependent. A host with native image generation
 * should write the plate directly; asking it for an API key is asking it to
 * pay for a capability it already has.
 *
 * ── Detection is a hint, never a claim ─────────────────────────────────────
 *
 * Verified in this environment: Claude Code exports `CLAUDECODE=1` to every
 * child process, so a script it starts can see it.
 *
 * Codex sets `CODEX_SANDBOX` / `CODEX_SANDBOX_NETWORK_DISABLED` for sandboxed
 * children — confirmed by reading the strings of the shipped
 * `codex-aarch64-apple-darwin` binary rather than by assuming. But it does NOT
 * set them when the sandbox is bypassed, so **absence proves nothing**. That
 * asymmetry is why nothing here infers a capability from a missing variable,
 * and why `WALKTHROUGH_IMAGE_PROVIDER` exists: a host that knows what it can do
 * should say so rather than be guessed at.
 */

/** @typedef {"claude-code"|"codex"|"unknown"} HostId */

export function detectHost(env = process.env) {
  if (env.WALKTHROUGH_HOST) {
    return {
      id: env.WALKTHROUGH_HOST,
      name: env.WALKTHROUGH_HOST,
      evidence: "declared in WALKTHROUGH_HOST",
      declared: true,
    };
  }
  if (env.CLAUDECODE) {
    return {
      id: "claude-code",
      name: "Claude Code",
      evidence: "CLAUDECODE is set",
      declared: false,
    };
  }
  if (env.CODEX_SANDBOX || env.CODEX_SANDBOX_NETWORK_DISABLED) {
    return {
      id: "codex",
      name: "Codex",
      evidence: "CODEX_SANDBOX is set",
      declared: false,
    };
  }
  return {
    id: "unknown",
    name: "A shell, CI, or an agent that sets no marker",
    evidence: "no host marker in the environment",
    declared: false,
  };
}

/**
 * Can the host produce an image file itself?
 *
 * Three states, and the third one matters: `"ask"` means the host may be able
 * to and this process cannot find out. A walk should put the question to the
 * agent rather than quietly fall through to "no" and then report missing art
 * as a configuration problem.
 *
 * @returns {{value: true|false|"ask", why: string, source: "declared"|"detected"}}
 */
export function hostImageSupport(env = process.env) {
  const declared = env.WALKTHROUGH_IMAGE_PROVIDER;
  if (declared === "host") {
    return { value: true, why: "WALKTHROUGH_IMAGE_PROVIDER=host", source: "declared" };
  }
  if (declared === "api") {
    return { value: false, why: "WALKTHROUGH_IMAGE_PROVIDER=api", source: "declared" };
  }
  if (declared === "none") {
    return { value: false, why: "WALKTHROUGH_IMAGE_PROVIDER=none — art is opted out", source: "declared" };
  }

  const host = detectHost(env);
  if (host.id === "claude-code") {
    return {
      value: false,
      why: "Claude Code returns text and tool calls, not image files",
      source: "detected",
    };
  }
  if (host.id === "codex") {
    return {
      value: "ask",
      why: "Codex may be able to write the plate itself — ask it before configuring a provider",
      source: "detected",
    };
  }
  return { value: false, why: host.evidence, source: "detected" };
}

/** Is art opted out entirely? Then a missing provider is not a gap. */
export function illustrationOptedOut(env = process.env) {
  return env.WALKTHROUGH_IMAGE_PROVIDER === "none";
}
