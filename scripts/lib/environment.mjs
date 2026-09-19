/**
 * Resolve the capability model against this machine — and VERIFY, don't trust.
 *
 * ── Why a live call ────────────────────────────────────────────────────────
 *
 * "The variable is set" and "the credential works" are different facts, and
 * only one of them is worth reporting. A revoked key, a rotated key, a key
 * pasted with a trailing newline and a key for the wrong resource all present
 * as *set*. Every one of them fails at the first real request — which, in this
 * repo, is after a walk has already run and the art step is the last thing
 * standing between you and a finished project page.
 *
 * So a provider that looks configured gets a real request against a free
 * endpoint (list models) before this file will call it ready. Same principle
 * the capture layer uses on screenshots: measure the result, do not trust the
 * option you passed.
 *
 * ── The one rule about output ──────────────────────────────────────────────
 *
 * Nothing here ever returns a secret. It returns variable NAMES and states.
 * Not a prefix, not a suffix, not a length — a fingerprint of a key is still a
 * fact about a key, and this output ends up pasted into issues and chat logs.
 */

import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { detectHost, hostImageSupport, illustrationOptedOut } from "./host.mjs";
import { loadEnv } from "./models.mjs";

/** Read the model that the hub's /setup page also renders. */
export function loadModel(root) {
  return JSON.parse(readFileSync(resolve(root, "apps/hub/capabilities.json"), "utf8"));
}

function have(bin) {
  try {
    execSync(`command -v ${bin}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Which of a provider's variables are present. Names only — never values. */
function envState(names = [], env) {
  const missing = names.filter((n) => !env[n] || !String(env[n]).trim());
  return { missing, satisfied: missing.length === 0 };
}

// ── Live verification ──────────────────────────────────────────────────────

async function verifyOpenAi(env) {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { state: "ready", detail: "the key was accepted" };
    if (res.status === 401) return { state: "rejected", detail: "401 — the key was refused" };
    if (res.status === 429) return { state: "ready", detail: "429 — accepted, but rate limited or out of quota" };
    return { state: "rejected", detail: `HTTP ${res.status}` };
  } catch (e) {
    return { state: "unreachable", detail: shortError(e) };
  }
}

async function verifyAzure(env) {
  const endpoint = String(env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
  const version = env.AZURE_OPENAI_API_VERSION || env.AZURE_OPENAI_IMAGE_API_VERSION || "2025-04-01-preview";
  try {
    // The data-plane deployments list: it exercises the same key + endpoint the
    // generators use, costs nothing, and is the only cheap way to learn whether
    // the DEPLOYMENT names in .env.local are real. Deployment names are not
    // model names on Azure, and a wrong one fails only at generation time.
    const res = await fetch(`${endpoint}/openai/deployments?api-version=${version}`, {
      headers: { "api-key": env.AZURE_OPENAI_API_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) {
      return { state: "rejected", detail: `${res.status} — the key was refused by this endpoint` };
    }
    if (!res.ok) {
      // Older api-versions do not expose the list. The key still reached a real
      // resource, which is most of what was being asked.
      return { state: "ready", detail: `reachable (deployments list returned HTTP ${res.status}, so names are unverified)` };
    }
    const body = await res.json().catch(() => null);
    const names = (body?.data ?? []).map((d) => d.id ?? d.model).filter(Boolean);
    if (names.length === 0) {
      return { state: "ready", detail: "the key was accepted; no deployments are listed on this resource" };
    }
    const wanted = [env.AZURE_OPENAI_IMAGE_DEPLOYMENT, env.AZURE_OPENAI_TEXT_DEPLOYMENT].filter(Boolean);
    const absent = wanted.filter((w) => !names.includes(w));
    if (absent.length > 0) {
      return {
        state: "partial",
        detail: `the key works, but ${absent.length === 1 ? "this deployment does" : "these deployments do"} not exist on the resource: ${absent.join(", ")}`,
      };
    }
    return { state: "ready", detail: `the key works and ${names.length} deployment${names.length === 1 ? "" : "s"} ${names.length === 1 ? "is" : "are"} provisioned` };
  } catch (e) {
    return { state: "unreachable", detail: shortError(e) };
  }
}

/**
 * Node's fetch reports every transport failure as the same three words —
 * "fetch failed" — and puts the real cause one level down. Reading only the
 * message turns "you typed the endpoint wrong" and "your wifi is off" into the
 * same unactionable line, so unwrap before giving up.
 */
function shortError(e) {
  const parts = [e?.message, e?.cause?.code, e?.cause?.message, e?.code, e?.name]
    .filter(Boolean)
    .map(String);
  const all = parts.join(" ");
  if (/timed? ?out|aborted|TimeoutError/i.test(all)) return "the endpoint did not answer within 10s";
  if (/ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(all)) return "the hostname does not resolve — check the endpoint";
  if (/ECONNREFUSED/i.test(all)) return "the connection was refused";
  if (/CERT|SSL|TLS/i.test(all)) return "the TLS certificate was rejected";
  if (/ENETDOWN|ENETUNREACH|EHOSTUNREACH/i.test(all)) return "no route to the host — is the network up?";
  const detail = parts.find((p) => p !== "fetch failed") ?? parts[0] ?? "unknown transport error";
  return detail.slice(0, 120);
}

const VERIFIERS = { "openai-models": verifyOpenAi, "azure-deployments": verifyAzure };

// ── Resolution ─────────────────────────────────────────────────────────────

/**
 * @param {string} root repo root
 * @param {object} [opts]
 * @param {boolean} [opts.verify=true] make the live calls
 * @param {object} [opts.capture] result of the capture layer's detectCapabilities()
 */
export async function resolveEnvironment(root, opts = {}) {
  const { verify = true, capture = null } = opts;
  loadEnv(root);
  const env = process.env;
  const model = loadModel(root);
  const host = detectHost(env);
  const hostImages = hostImageSupport(env);
  const optedOut = illustrationOptedOut(env);

  const envFile = resolve(root, ".env.local");
  const envFilePresent = existsSync(envFile);

  const capabilities = [];
  for (const cap of model.capabilities) {
    const providers = [];

    for (const p of cap.providers) {
      providers.push(await resolveProvider(p, { cap, env, capture, host, hostImages, verify, root }));
    }

    const ready = providers.filter((p) => p.state === "ready");
    const partial = providers.filter((p) => p.state === "partial");
    const asks = providers.filter((p) => p.state === "ask");

    let state;
    if (cap.id === "illustration" && optedOut) state = "opted-out";
    else if (ready.length > 0) state = "ready";
    else if (partial.length > 0) state = "partial";
    else if (asks.length > 0) state = "ask";
    else state = cap.required ? "blocked" : "degraded";

    capabilities.push({
      ...cap,
      state,
      activeProvider: ready[0]?.id ?? partial[0]?.id ?? asks[0]?.id ?? null,
      providers,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    verified: verify,
    host,
    hostImages,
    envFilePresent,
    principle: model.principle,
    hosts: model.hosts,
    capabilities,
  };
}

async function resolveProvider(p, { cap, env, capture, host, hostImages, verify, root }) {
  const base = { id: p.id, name: p.name, kind: p.kind, note: p.note, env: p.env ?? [] };

  // The host itself.
  if (p.kind === "host") {
    if (!p.requiresHostImages) {
      return { ...base, state: "ready", detail: `${host.name} — ${host.evidence}` };
    }
    if (hostImages.value === true) {
      return { ...base, state: "ready", detail: hostImages.why };
    }
    if (hostImages.value === "ask") {
      return { ...base, state: "ask", detail: hostImages.why };
    }
    return { ...base, state: "missing", detail: hostImages.why };
  }

  // A local tool or a capture backend.
  if (p.kind === "local") {
    if (cap.id === "capture") {
      return {
        ...base,
        state: captureProviderState(p.id, capture),
        detail: captureDetail(p.id, capture),
      };
    }
    const bins = p.requiresBinaries ?? [];
    const absent = bins.filter((b) => !have(b));
    if (absent.length > 0) {
      return { ...base, state: "missing", detail: `not on PATH: ${absent.join(", ")}` };
    }
    return { ...base, state: "ready", detail: bins.length ? `${bins.join(", ")} on PATH` : "available" };
  }

  // An API provider, read from the registry rather than from .env.
  if (cap.fromRegistry) {
    const wanted = registryPlaceholders(root);
    if (wanted.length === 0) {
      return { ...base, state: "ready", detail: "no registered app declares a credential" };
    }
    const missing = wanted.filter((w) => !env[w.name] || !String(env[w.name]).trim());
    if (missing.length === 0) {
      return { ...base, state: "ready", detail: `${wanted.length} declared, all set` };
    }
    return {
      ...base,
      state: "missing",
      env: wanted.map((w) => w.name),
      detail: missing.map((m) => `${m.name} (${m.project})`).join(", "),
      consequences: missing.map((m) => m.note).filter(Boolean),
    };
  }

  // An ordinary API provider.
  const { missing, satisfied } = envState(p.env, env);
  if (!satisfied) {
    return { ...base, state: "missing", detail: `not set: ${missing.join(", ")}` };
  }
  if (!verify || !p.verify || !VERIFIERS[p.verify]) {
    return { ...base, state: "ready", detail: "set (not verified)", unverified: true };
  }
  const result = await VERIFIERS[p.verify](env);
  return { ...base, ...result };
}

/**
 * Three states, not two.
 *
 * "The Android SDK is installed" and "a walk can capture Android right now"
 * are different claims, and reporting the first as ready is how you end up
 * choosing a backend that has no device to talk to. A toolchain that is
 * present but has nothing attached or booted is `partial`: one step from
 * usable, and that step is named in the detail line.
 */
function captureProviderState(id, caps) {
  if (!caps) return "unknown";
  switch (id) {
    case "playwright":
      return caps.playwright?.chromium ? "ready" : "missing";
    case "cdp":
      return caps.chromeCdp ? "ready" : "missing";
    case "ios-simulator":
      if (caps.bootedSimulators?.length > 0) return "ready";
      return caps.xcode ? "partial" : "missing";
    case "android-adb":
      if (caps.androidDevices > 0) return "ready";
      return caps.androidSdk ? "partial" : "missing";
    default:
      return "unknown";
  }
}

function captureDetail(id, caps) {
  if (!caps) return "not probed";
  switch (id) {
    case "playwright":
      return caps.playwright?.chromium ? "chromium installed" : "run `npx playwright install chromium`";
    case "cdp":
      return caps.chromeCdp ? "a Chrome is listening on :9222" : "no Chrome on :9222";
    case "ios-simulator":
      if (caps.bootedSimulators?.length) return `booted: ${caps.bootedSimulators.join(", ")}`;
      return caps.xcode
        ? "Xcode is installed, but nothing is booted — open Simulator first"
        : "no Xcode on this machine";
    case "android-adb":
      if (caps.androidDevices > 0) {
        return `${caps.androidDevices} device${caps.androidDevices === 1 ? "" : "s"} attached`;
      }
      return caps.androidSdk
        ? "the SDK is installed, but no device or emulator is attached"
        : "platform-tools not installed";
    default:
      return "";
  }
}

/** `$VAR` placeholders declared by registered apps, with where they came from. */
export function registryPlaceholders(root) {
  const path = resolve(root, "apps/hub/projects.json");
  if (!existsSync(path)) return [];
  const registry = JSON.parse(readFileSync(path, "utf8"));
  const out = [];
  for (const project of registry.projects ?? []) {
    for (const [role, cfg] of Object.entries(project.auth?.roles ?? {})) {
      const v = cfg?.password;
      if (typeof v === "string" && v.startsWith("$")) {
        out.push({
          name: v.slice(1),
          project: project.slug,
          role,
          note: cfg.note ?? null,
        });
      }
    }
  }
  return out;
}
