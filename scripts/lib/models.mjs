/**
 * Shared model access. One place that knows which model is which.
 *
 * Everything goes to the **OpenAI API** with a single `OPENAI_API_KEY`. There
 * is one credential in this repo and one endpoint, because the alternative —
 * an endpoint, a key, a version and a per-capability deployment name — was
 * four variables to get right before a single portrait could be drawn, and
 * three of them failed silently when wrong.
 *
 * ── Model names are checked, not remembered ────────────────────────────────
 *
 * The defaults below were confirmed against `GET /v1/models` with this
 * project's key on 2026-09-19, not copied from a table. That check is worth
 * repeating rather than trusting: the image line had already moved twice in
 * five months — `gpt-image-2` (2026-04-17) was superseded by `gpt-image-2.5`
 * (2026-09-04), and the notes that said otherwise were only five weeks old.
 *
 * Both 2.5 tiers were called with this file's exact request shape and both
 * returned a PNG, so the default is a verified value and not a guess. Override
 * either model from `.env.local` without touching code:
 *
 *   OPENAI_IMAGE_MODEL=gpt-image-2.5-sunburst
 *   OPENAI_TEXT_MODEL=gpt-5.6-sol
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const API = "https://api.openai.com/v1";

/** Verified against GET /v1/models on 2026-09-19 with this project's key. */
export const DEFAULT_IMAGE_MODEL = "gpt-image-2.5-flare";
export const DEFAULT_TEXT_MODEL = "gpt-5.6-terra";

/** Load `.env.local` into `process.env` without a dependency. */
export function loadEnv(root) {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

export function openai() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "missing OPENAI_API_KEY in .env.local — run `pnpm doctor` to see what that blocks",
    );
  }
  return {
    key,
    imageModel: process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    textModel: process.env.OPENAI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
  };
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
 *
 * `temperature` is deliberately never sent: the 5.6 family rejects it with a
 * 400 rather than ignoring it.
 */
export async function chat(prompt, { maxTokens = 2000, system, effort = "low" } = {}) {
  const { key, textModel } = openai();
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: textModel,
      messages,
      max_completion_tokens: maxTokens,
      ...(effort ? { reasoning_effort: effort } : {}),
    }),
  });

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
export async function image({ prompt, size, reference, quality = "high" }) {
  const { key, imageModel } = openai();

  let res;
  if (reference) {
    const form = new FormData();
    form.append("model", imageModel);
    form.append("size", size);
    form.append("quality", quality);
    form.append("prompt", prompt);
    form.append("image[]", new Blob([readFileSync(reference)], { type: "image/png" }), "ref.png");
    res = await fetch(`${API}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } else {
    res = await fetch(`${API}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: imageModel, prompt, size, n: 1, quality }),
    });
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
