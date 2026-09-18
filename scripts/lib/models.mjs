/**
 * Shared model access. One place that knows which deployment is which.
 *
 * Everything goes to **Azure OpenAI** directly, because that is the only
 * endpoint these scripts have ever been able to reach. If you have a plain
 * OpenAI key or a gateway in front of one, add an engine here rather than
 * teaching each script its own way to call a model — working that out in three
 * separate places is worse than knowing it in one.
 *
 * Deployment names are NOT model names. On Azure the deployment in the URL
 * selects the model and naming a model in the request body is rejected, so
 * these read from env and there is no default that pretends to know what
 * somebody provisioned.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load `.env.local` into `process.env` without a dependency. */
export function loadEnv(root) {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

export function azure() {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
  const key = process.env.AZURE_OPENAI_API_KEY;
  const image = process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT;
  const text = process.env.AZURE_OPENAI_TEXT_DEPLOYMENT;
  // `AZURE_OPENAI_IMAGE_API_VERSION` is the name the first generator script
  // used, before there was a text model to call as well. Accepted as an alias
  // so an existing .env.local keeps working.
  const version =
    process.env.AZURE_OPENAI_API_VERSION ||
    process.env.AZURE_OPENAI_IMAGE_API_VERSION ||
    "2025-04-01-preview";
  const missing = [
    !endpoint && "AZURE_OPENAI_ENDPOINT",
    !key && "AZURE_OPENAI_API_KEY",
  ].filter(Boolean);
  if (missing.length) throw new Error(`missing in .env.local: ${missing.join(", ")}`);
  return { endpoint, key, image, text, version };
}

/**
 * One chat completion. Returns the message text, trimmed.
 *
 * ── `maxTokens` on a reasoning model ───────────────────────────────────────
 *
 * The GPT-5 family spends `max_completion_tokens` on REASONING FIRST and
 * output second. Set it tight — 120 tokens for a fourteen-word caption, say —
 * and the model burns the whole budget thinking, then returns
 * `finish_reason: "length"` with `content: ""`. The response also carries an
 * empty `content_filter_result`, so the failure reads like moderation rather
 * than like a budget you set too low. It cost an afternoon to tell apart.
 *
 * So the default is deliberately generous, and `effort` is the knob to reach
 * for instead: `"none"` spends zero reasoning tokens and is the right choice
 * for short, well-specified writing, which is all this repo asks for.
 */
export async function chat(prompt, { maxTokens = 2000, system, effort = "low" } = {}) {
  const { endpoint, key, text, version } = azure();
  if (!text) throw new Error("missing AZURE_OPENAI_TEXT_DEPLOYMENT in .env.local");
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(
    `${endpoint}/openai/deployments/${text}/chat/completions?api-version=${version}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key },
      body: JSON.stringify({
        messages,
        max_completion_tokens: maxTokens,
        ...(effort ? { reasoning_effort: effort } : {}),
      }),
    },
  );
  if (!res.ok) throw new Error(`chat HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const choice = json?.choices?.[0];
  const out = choice?.message?.content;
  if (!out) {
    const reasoning = json?.usage?.completion_tokens_details?.reasoning_tokens;
    if (choice?.finish_reason === "length") {
      throw new Error(
        `empty completion with finish_reason "length" — the token budget ` +
          `(${maxTokens}) was consumed by reasoning (${reasoning ?? "?"} tokens) ` +
          `before any output. Raise maxTokens or pass effort: "none".`,
      );
    }
    throw new Error(`no content: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return out.trim();
}

/**
 * One image. Pass `reference` (a PNG path) to route through `images/edits`,
 * which lets the model see a plate it must stay visually consistent with —
 * the difference between a persona's moment shots being the same person and
 * being three strangers.
 */
export async function image({ prompt, size, reference }) {
  const { endpoint, key, image: deployment, version } = azure();
  if (!deployment) throw new Error("missing AZURE_OPENAI_IMAGE_DEPLOYMENT in .env.local");

  let res;
  if (reference) {
    const form = new FormData();
    form.append("size", size);
    form.append("quality", "high");
    form.append("prompt", prompt);
    form.append("image[]", new Blob([readFileSync(reference)], { type: "image/png" }), "ref.png");
    res = await fetch(
      `${endpoint}/openai/deployments/${deployment}/images/edits?api-version=${version}`,
      { method: "POST", headers: { "api-key": key }, body: form },
    );
  } else {
    res = await fetch(
      `${endpoint}/openai/deployments/${deployment}/images/generations?api-version=${version}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": key },
        body: JSON.stringify({ prompt, size, n: 1, quality: "high", output_format: "png" }),
      },
    );
  }
  if (!res.ok) throw new Error(`image HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`no b64_json: ${JSON.stringify(json).slice(0, 300)}`);
  return Buffer.from(b64, "base64");
}

export const stripMarkdown = (s = "") =>
  s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
