import fs from "node:fs";
import path from "node:path";

/**
 * The capability model: what this system can do, what each thing needs, and
 * what degrades without it.
 *
 * ── Why the hub reads no environment at all ───────────────────────────────
 *
 * The obvious build here is a settings page that reports "API key: set ✓".
 * Two things are wrong with it.
 *
 * On a public URL it publishes the configuration state of a machine to anyone
 * who finds the route, and implies the server holds a key — which it does not,
 * and should not. Nothing in this hub ever calls a model. The keys belong to
 * the *scripts*, which run on a laptop next to the app being walked.
 *
 * And "set" is the wrong fact anyway. A revoked key, a rotated key, a key with
 * a trailing newline and a key for the wrong resource are all *set*, and every
 * one of them fails at the first real request. So the page renders the model,
 * and every claim about this machine comes from `pnpm doctor` through the
 * verify route — one implementation, checked live, behind an explicit button.
 *
 * A practical consequence worth recording: the first version of this file read
 * `../../.env.local` to show presence inline. Reaching outside the app
 * directory made Turbopack give up on tracing and pull the entire monorepo
 * into the serverless function — it says so during the build. Every path read
 * here now stays inside this app.
 */

export interface CapabilityProvider {
  id: string;
  name: string;
  kind: "host" | "api" | "local";
  note?: string;
  env?: string[];
  install?: string;
  requiresBinaries?: string[];
  requiresHostImages?: boolean;
  verify?: string;
}

export interface Capability {
  id: string;
  name: string;
  required: boolean;
  for: string;
  usedBy: string[];
  without: string;
  fromRegistry?: boolean;
  providers: CapabilityProvider[];
}

export interface HostProfile {
  id: string;
  name: string;
  detectEnv: string | null;
  detectNote: string;
  canGenerateImages: boolean | "ask";
  canGenerateSpeech: boolean;
  consequence: string;
}

export interface CapabilityModel {
  principle: { headline: string; body: string };
  hosts: HostProfile[];
  capabilities: Capability[];
}

const ROOT = process.cwd();

export function getCapabilityModel(): CapabilityModel {
  const raw = fs.readFileSync(path.join(ROOT, "capabilities.json"), "utf8");
  return JSON.parse(raw) as CapabilityModel;
}

/** Is this the dev server on somebody's machine, rather than the deployed hub? */
export function isLocalHub(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Credentials the registry asks for, by variable name.
 *
 * Whether any of them is actually set is deliberately not answered here — the
 * verify route answers it, for the machine the scripts run on. This is the
 * declaration, not the state.
 */
export function getRegistryCredentials(): {
  name: string;
  project: string;
  role: string;
  note: string | null;
}[] {
  const registryPath = path.join(ROOT, "projects.json");
  if (!fs.existsSync(registryPath)) return [];

  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as {
    projects?: {
      slug: string;
      auth?: { roles?: Record<string, { password?: string; note?: string }> };
    }[];
  };

  const out = [];
  for (const project of registry.projects ?? []) {
    for (const [role, cfg] of Object.entries(project.auth?.roles ?? {})) {
      const value = cfg?.password;
      // A committed registry names a variable; it never holds a value. Anything
      // that is not a $VAR placeholder is not a credential reference.
      if (typeof value !== "string" || !value.startsWith("$")) continue;
      out.push({ name: value.slice(1), project: project.slug, role, note: cfg.note ?? null });
    }
  }
  return out;
}
