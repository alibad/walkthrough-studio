import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Run the credential check the CLI runs, and hand back its verdict.
 *
 * ── Why it shells out instead of reimplementing ───────────────────────────
 *
 * `pnpm doctor` already knows how to verify each provider, and a second
 * implementation in TypeScript would be a second thing to keep true. The
 * failure mode there is specific and nasty: the page says the key works, the
 * command says it does not, and you have no way to tell which one is lying.
 * One implementation, two front ends.
 *
 * ── Why it is dev-only ────────────────────────────────────────────────────
 *
 * The deployed hub holds no credentials and calls no model. A route that
 * probed its environment would report on a machine that has nothing to
 * report — and would publish that nothing to anyone who found the URL. So in
 * a production build this is a 404, which is also the literal truth: there is
 * no such capability there.
 *
 * The NODE_ENV test is written out here rather than imported from
 * lib/capabilities. That module reads files relative to `process.cwd()`, and
 * importing it into a route handler makes the bundler give up on tracing and
 * pull the whole project into the function — it says so, loudly, during the
 * build. One boolean is not worth a dependency that costs that.
 */

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Credential verification runs only against a local checkout." },
      { status: 404 },
    );
  }

  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);

  // apps/hub → repo root. The doctor resolves its own paths from there.
  const repoRoot = path.resolve(process.cwd(), "..", "..");

  try {
    const { stdout } = await run("node", ["scripts/doctor.mjs", "--json"], {
      cwd: repoRoot,
      timeout: 45_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return NextResponse.json(JSON.parse(stdout));
  } catch (error) {
    // The doctor exits 1 when a REQUIRED capability is missing, and that is a
    // real report, not a crash — parse it before treating it as failure.
    const e = error as { stdout?: string; message?: string };
    if (e.stdout) {
      try {
        return NextResponse.json(JSON.parse(e.stdout));
      } catch {
        /* fall through to the error below */
      }
    }
    return NextResponse.json(
      { error: e.message ?? "The environment check could not be run." },
      { status: 500 },
    );
  }
}
