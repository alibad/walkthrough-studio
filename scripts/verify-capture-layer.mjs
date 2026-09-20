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
import { createServer } from "node:http";
import { resolve } from "node:path";
import { openCapture, SURFACES, InvariantViolation } from "./lib/capture/index.mjs";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
let URL_ = argv.url;
const OUT = resolve(argv.out ?? "/tmp/wt-verify");
const DRIVERS = argv.driver ? [argv.driver] : ["playwright", "cdp"];

/**
 * The verifier used to default to localhost:4599 without starting anything
 * there. A clean checkout therefore printed FAILED and still exited zero — a
 * reassuring-looking command that proved nothing. When no URL is supplied we
 * now own a deterministic probe server for the lifetime of this process.
 */
let probeServer = null;
if (!URL_) {
  probeServer = createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    if (req.url === "/page2") {
      res.end("<!doctype html><title>Probe two</title><main>Second state.</main>");
      return;
    }
    res.end(`<!doctype html>
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Walkthrough capture probe</title><style>
        *{box-sizing:border-box} body{margin:0;font:18px system-ui;background:#f5f0e8;color:#191714}
        main{min-height:100vh;padding:8vh 8vw;display:grid;grid-template-columns:1.1fr .9fr;gap:5vw;align-items:center}
        h1{font:700 clamp(42px,7vw,96px)/.95 Georgia;margin:0 0 24px} p{line-height:1.55;max-width:58ch}
        aside{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.card{min-height:150px;padding:20px;border:2px solid #191714;background:#fff}
        @media(max-width:600px){main{grid-template-columns:1fr;padding:30px 22px;gap:22px}h1{font-size:48px;margin-bottom:14px}p{font-size:16px;margin:8px 0}aside{grid-template-columns:1fr 1fr}.card{min-height:100px;background:repeating-linear-gradient(135deg,#fff,#fff 12px,#ece4d8 12px,#ece4d8 24px)}}
      </style></head><body><main><section><p>Deterministic local evidence</p><h1>Capture what happened.</h1><p>This page deliberately occupies the frame so emptiness, Retina output, real mobile emulation, frozen time, isolated contexts, and video can all be measured without depending on the network.</p></section><aside><div class="card">Desktop</div><div class="card">Mobile</div><div class="card">Evidence</div><div class="card">Failure</div></aside></main></body></html>`);
  });
  await new Promise((resolveListen, reject) => {
    probeServer.once("error", reject);
    probeServer.listen(0, "127.0.0.1", resolveListen);
  });
  const address = probeServer.address();
  URL_ = `http://127.0.0.1:${address.port}`;
  console.log(`probe: ${URL_} (started by verifier)`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let failures = 0;
let exercised = 0;

for (const id of DRIVERS) {
  console.log(`\n── ${id} ${"─".repeat(50 - id.length)}`);
  let cap;
  try {
    cap = await openCapture({ outDir: OUT, videoDir: OUT, driver: id });
  } catch (err) {
    console.log(`  unavailable: ${err.message.split("\n")[0]}`);
    if (argv.driver) failures += 1;
    continue;
  }
  try {
    for (const surface of [SURFACES.desktop, SURFACES.mobile]) {
      const walk = await cap.feature("probe", surface, { url: URL_, video: surface.id === "desktop" });
      if (Math.abs(walk.env.innerWidth - surface.width) > 2) {
        throw new Error(
          `${surface.id} CSS viewport is ${walk.env.innerWidth}px, expected ${surface.width}px; this would capture the wrong responsive layout`,
        );
      }
      // The phone frame intentionally has large breathing room around the
      // headline. Declare that sparsity; desktop already exercises the strict
      // content-density gate, while this surface is for mobile/DPR evidence.
      const a = await walk.shot("step-01-arrive.png", { sparse: surface.id === "mobile" });
      console.log(`  ${surface.id}: ${a}  (dpr ${walk.env.dpr}, ${walk.env.innerWidth}px, touch ${walk.env.touch})`);

      // A real navigation. This capture must differ from the first.
      await walk.ctx.goto(URL_ + "/page2");
      // `/page2` really is one line of text on a plain ground. Declaring it
      // sparse is the honest use of the escape hatch — and the fact that the
      // content check caught it unprompted is the check working, not failing.
      const b = await walk.shot("step-02-page-two.png", { sparse: true });
      console.log(`  ${surface.id}: ${b} after a real navigation`);

      // Now capture the SAME static screen again with nothing in between.
      // The ledger has to refuse it; that refusal is the invariant working.
      // The page has to be a static one for this to be a fair test — a page
      // with a live clock produces byte-different captures of an unchanged
      // screen, which is precisely the hole `timeFrozen` exists to close.
      try {
        await walk.shot("step-03-nothing-happened.png", { sparse: true });
        console.log("  !! DUPLICATE NOT CAUGHT — the distinctness guard is not doing its job");
        failures += 1;
      } catch (err) {
        if (err instanceof InvariantViolation) console.log(`  duplicate correctly refused (${err.invariant})`);
        else throw err;
      }

      const { video } = await walk.finish();
      if (video) console.log(`  video: ${video.split("/").pop()}`);
      if (surface.id === "desktop" && !video) {
        throw new Error("the Playwright probe requested video but no finalized file was returned");
      }
      exercised += 1;
    }
    console.log(`  report: ${JSON.stringify(cap.report(), null, 1).replace(/\n\s*/g, " ")}`);
  } catch (err) {
    console.log(`  FAILED: ${err.message}`);
    failures += 1;
  } finally {
    await cap.close();
  }
}

if (probeServer) await new Promise((resolveClose) => probeServer.close(resolveClose));
if (exercised === 0) failures += 1;
if (failures > 0) {
  console.error(`\n${failures} capture verification failure${failures === 1 ? "" : "s"}`);
  process.exitCode = 1;
} else {
  console.log(`\n✓ capture layer verified on ${exercised} surface${exercised === 1 ? "" : "s"}`);
}
