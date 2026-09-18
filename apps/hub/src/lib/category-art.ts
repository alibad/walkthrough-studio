/**
 * Category → illustration plate.
 *
 * Categories are free-form strings written by a capture agent reading someone
 * else's codebase, so they can't be an enum. "auth", "authentication",
 * "access", "login" and "identity" are all the same idea and all plausible.
 *
 * So this resolves fuzzily, in three passes, and **returns null rather than
 * guessing** when nothing matches. An unillustrated category heading looks
 * deliberate; a wrong plate — a printing press beside "Billing" — looks broken
 * and undermines every plate that is right.
 */

/** The plates that exist in `public/art/`, each with the words that reach it. */
const PLATES: Record<string, string[]> = {
  browsing: ["browsing", "browse", "catalog", "catalogue", "library", "index", "list", "directory", "explore", "discovery", "feed", "home"],
  reading: ["reading", "read", "detail", "details", "view", "article", "content", "docs", "documentation", "guide", "help"],
  capture: ["capture", "camera", "photo", "scan", "upload", "record", "attach", "media-capture"],
  settings: ["settings", "setting", "preferences", "config", "configuration", "admin", "management", "controls", "profile", "account", "console", "operator", "governance", "guardrails", "permissions"],
  auth: ["auth", "authentication", "authorisation", "authorization", "access", "login", "signin", "sign-in", "identity", "permissions", "roles", "security", "sso"],
  sync: ["sync", "synchronisation", "synchronization", "offline", "queue", "replication", "background", "jobs", "integration"],
  reporting: ["reporting", "reports", "analytics", "dashboard", "metrics", "insights", "stats", "statistics", "accounting", "finance", "billing", "invoicing", "ledger"],
  import: ["import", "export", "ingest", "intake", "data", "migration", "transfer", "bulk", "csv"],
  search: ["search", "find", "query", "filter", "filtering", "lookup", "results"],
  messaging: ["messaging", "messages", "chat", "inbox", "mail", "email", "notifications", "comments", "conversation", "support", "agent", "assistant", "copilot", "prompt"],
  deploy: ["deploy", "deployment", "release", "publish", "build", "ship", "ci", "pipeline", "rollout", "platform", "engine", "infrastructure", "runtime"],
  inspect: ["inspect", "inspection", "debug", "diagnostics", "monitoring", "logs", "audit", "verify", "verification", "testing", "qa", "health", "status", "evals", "eval", "evaluation", "benchmark", "scoring", "grading"],
  onboarding: ["onboarding", "welcome", "getting-started", "setup", "signup", "sign-up", "registration", "first-run", "intro", "tour"],
  media: ["media", "video", "audio", "voice", "player", "playback", "gallery", "images", "streaming"],
};

/** Reverse index, built once. */
const BY_WORD = new Map<string, string>();
for (const [plate, words] of Object.entries(PLATES)) {
  for (const word of words) BY_WORD.set(word, plate);
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .trim()
    // Split camelCase so "userSettings" reaches "settings".
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\s]+/g, "-");

/**
 * Resolve a category to a plate path, or `null`.
 *
 * Pass 1 — exact match on the whole normalized category.
 * Pass 2 — exact match on any hyphen-separated token, longest token first
 *          (so "user-settings" prefers "settings" over "user").
 * Pass 3 — substring containment, requiring ≥4 characters so short words can't
 *          produce accidental hits ("ci" inside "specification").
 */
export function categoryArt(category: string | undefined): string | null {
  if (!category) return null;
  const key = normalize(category);

  const direct = BY_WORD.get(key);
  if (direct) return `/art/cat-${direct}.png`;

  const tokens = key.split("-").filter(Boolean).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const hit = BY_WORD.get(token);
    if (hit) return `/art/cat-${hit}.png`;
  }

  for (const token of tokens) {
    if (token.length < 4) continue;
    for (const [word, plate] of BY_WORD) {
      if (word.length < 4) continue;
      if (word.includes(token) || token.includes(word)) return `/art/cat-${plate}.png`;
    }
  }

  return null;
}
