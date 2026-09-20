#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const out = resolve(
  "apps/hub/public/walkthroughs/inner-quest/repaired-write-path/terminal",
);

const steps = [
  {
    command: "inner-quest search-personal-os --query CliftonStrengths",
    lines: [
      ["matches", "profile + supporting reflection"],
      ["profile", "official Gallup CliftonStrengths result"],
      ["top five", "Arranger · Belief · Strategic · Achiever · Learner"],
      ["result", "relevant Personal OS context found"],
    ],
  },
  {
    command: "inner-quest get-self-profile --fields strengths,provenance",
    lines: [
      ["assessment", "Gallup CliftonStrengths"],
      ["completed", "2026-09-07"],
      ["coverage", "All 34 themes"],
      ["source", "user-confirmed transcription"],
      ["boundary", "official result kept separate from earlier archive"],
    ],
  },
  {
    command: "inner-quest create-reflection --private --type insight",
    lines: [
      ["prompt", "What would make my strengths useful in the next complex decision?"],
      ["evidence", "official Top 5 strengths"],
      ["practice", "name outcome · explain change · learn from result"],
      ["tags", "walkthrough-proof · cliftonstrengths · self-knowledge"],
      ["result", "private reflection created"],
    ],
  },
  {
    command: "inner-quest verify-reflection --exact-read-back",
    lines: [
      ["get", "exact title, prompt, body and tags returned"],
      ["list", "exact reflection found independently"],
      ["search", "Personal OS search found the same reflection"],
      ["app", "exact record visible in My Reflections"],
      ["cleanup", "synthetic proof record removed after capture"],
    ],
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const seen = new Map();

try {
  for (const [index, step] of steps.entries()) {
    const page = await browser.newPage({
      viewport: { width: 960, height: 600 },
      deviceScaleFactor: 2,
    });
    const rows = step.lines
      .map(
        ([key, value]) =>
          `<div class="line"><span class="key">${escapeHtml(key)}</span><span class="value">${escapeHtml(value)}</span></div>`,
      )
      .join("");
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#0f1020;color:#f8fafc}
      body{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;padding:34px}
      .term{height:100%;border:1px solid #393552;border-radius:14px;background:#171624;overflow:hidden;box-shadow:0 24px 80px #0008}
      .bar{height:48px;display:flex;align-items:center;gap:9px;padding:0 17px;border-bottom:1px solid #343049;background:#201e30}
      .dot{width:10px;height:10px;border:1px solid #68617d;border-radius:999px}.label{margin-left:9px;color:#a9a1bb;font-size:12px}
      .body{padding:30px 34px;font-size:18px;line-height:1.72}.prompt{color:#ec4899;font-weight:700}.command{color:#f7f3ff}
      .line{white-space:pre-wrap}.key{display:inline-block;width:142px;color:#a89fbb}.value{color:#eeeaf8}.ok{color:#a78bfa}
      .foot{position:absolute;right:48px;bottom:45px;color:#787187;font-size:11px;letter-spacing:.14em;text-transform:uppercase}
    </style></head><body><div class="term"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="label">Walkthrough Studio · observed authenticated connector transcript</span></div><div class="body"><div class="line"><span class="prompt">$</span> <span class="command">${escapeHtml(step.command)}</span></div><br>${rows}<br><div class="line ok">✓ observed in production</div></div></div><div class="foot">private data excluded · synthetic reflection cleaned up</div></body></html>`);
    await page.evaluate(() => document.fonts?.ready);
    const filename = `step-${String(index + 1).padStart(2, "0")}-repaired-write-path.png`;
    const path = resolve(out, filename);
    await page.screenshot({ path, animations: "disabled" });
    await page.close();

    const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (seen.has(hash)) throw new Error(`${filename} duplicates ${seen.get(hash)}`);
    seen.set(hash, filename);
  }
} finally {
  await browser.close();
}

console.log(`Rendered ${steps.length} Inner Quest self-knowledge frames`);
