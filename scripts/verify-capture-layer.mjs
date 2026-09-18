#!/usr/bin/env node
/**
 * verify-capture-layer.mjs — run the SAME walk through every backend and show
 * that the invariants hold identically, or fail identically.
 *
 * This is the test that keeps the driver layer honest. If a new backend is
 * added and it cannot deliver Retina pixels, this script says so in one line
 * instead of a walk shipping soft captures that nobody looks at closely.
 *
 *   node scripts/verify-capture-layer.mjs --url=http://localhost:4599
 *   node scripts/verify-capture-layer.mjs --url=… --driver=cdp
 */
import { rmSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { openCapture, SURFACES, InvariantViolation } from "./lib/capture/index.mjs";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const URL_ = argv.url ?? "http://localhost:4599";
const OUT = resolve(argv.out ?? "/tmp/wt-verify");
const DRIVERS = argv.driver ? [argv.driver] : ["playwright", "cdp"];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const id of DRIVERS) {
  console.log(`\n── ${id} ${"─".repeat(50 - id.length)}`);
  let cap;
  try {
    cap = await openCapture({ outDir: OUT, videoDir: OUT, driver: id });
  } catch (err) {
    console.log(`  unavailable: ${err.message.split("\n")[0]}`);
    continue;
  }
  try {
    for (const surface of [SURFACES.desktop, SURFACES.mobile]) {
      const walk = await cap.feature("probe", surface, { url: URL_, video: surface.id === "desktop" });
      const a = await walk.shot("step-01-arrive.png");
      console.log(`  ${surface.id}: ${a}  (dpr ${walk.env.dpr}, ${walk.env.innerWidth}px, touch ${walk.env.touch})`);

      // A real navigation. This capture must differ from the first.
      await walk.ctx.goto(URL_ + "/page2");
      const b = await walk.shot("step-02-page-two.png");
      console.log(`  ${surface.id}: ${b} after a real navigation`);

      // Now capture the SAME static screen again with nothing in between.
      // The ledger has to refuse it; that refusal is the invariant working.
      // The page has to be a static one for this to be a fair test — a page
      // with a live clock produces byte-different captures of an unchanged
      // screen, which is precisely the hole `timeFrozen` exists to close.
      try {
        await walk.shot("step-03-nothing-happened.png");
        console.log("  !! DUPLICATE NOT CAUGHT — the distinctness guard is not doing its job");
      } catch (err) {
        if (err instanceof InvariantViolation) console.log(`  duplicate correctly refused (${err.invariant})`);
        else throw err;
      }

      const { video } = await walk.finish();
      if (video) console.log(`  video: ${video.split("/").pop()}`);
    }
    console.log(`  report: ${JSON.stringify(cap.report(), null, 1).replace(/\n\s*/g, " ")}`);
  } catch (err) {
    console.log(`  FAILED: ${err.message}`);
  } finally {
    await cap.close();
  }
}
