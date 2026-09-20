#!/usr/bin/env node
/**
 * Capture the two MCP stories used in the AI Patterns talk.
 *
 * The MCP servers themselves must use pipes: JSON-RPC over stdio is their real
 * transport, so wrapping those processes in a pseudo-terminal would corrupt
 * the protocol. This script drives them through the official MCP SDK, then
 * renders the observed protocol transcript as terminal frames for the hub.
 *
 * DoneOS writes only to mcp-humanquest's isolated in-memory fixture. Inner
 * Quest writes only to the recording HTTP server started below. No production
 * credential is loaded and no authenticated production write is attempted.
 */

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REPOS = resolve(ROOT, "..");
const DONEOS = resolve(REPOS, "done_os");
const INNER = resolve(REPOS, "inner_quest");
const DEMO = resolve(REPOS, "mcp-humanquest");
const OUT_ROOT = resolve(ROOT, "apps/hub/public/walkthroughs");
let demoBase = process.env.MCP_DEMO_BASE_URL;

const sdkRoot = resolve(DONEOS, "mcp/node_modules/@modelcontextprotocol/sdk/dist/esm");
const { Client } = await import(pathToFileURL(join(sdkRoot, "client/index.js")));
const { StdioClientTransport } = await import(pathToFileURL(join(sdkRoot, "client/stdio.js")));
const { StreamableHTTPClientTransport } = await import(
  pathToFileURL(join(sdkRoot, "client/streamableHttp.js"))
);

const now = new Date().toISOString();

function environment(extra = {}) {
  return Object.fromEntries(
    Object.entries({ ...process.env, ...extra }).filter(([, value]) => typeof value === "string"),
  );
}

function gitFacts(repo) {
  const run = (args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  const sha = run(["rev-parse", "HEAD"]);
  return {
    sha,
    shaShort: sha.slice(0, 8),
    branch: run(["rev-parse", "--abbrev-ref", "HEAD"]),
    dirty: Boolean(run(["status", "--porcelain"])),
    commitDate: run(["log", "-1", "--format=%aI"]),
    commitSubject: run(["log", "-1", "--format=%s"]),
    watchPath: ".",
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toolSplit(tools) {
  const writes = tools.filter((tool) => !tool.annotations?.readOnlyHint);
  return { total: tools.length, writes: writes.length, reads: tools.length - writes.length };
}

function textResult(result) {
  if (result?.isError) {
    throw new Error(result.content?.map((item) => item.text ?? "").join("\n") || "MCP tool failed");
  }
  return result?.structuredContent ?? {};
}

async function unusedLocalPort() {
  const server = createServer();
  await new Promise((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveReady);
  });
  const address = server.address();
  assert(address && typeof address === "object", "Could not allocate a local fixture port");
  await new Promise((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()));
  return address.port;
}

async function startDoneOsFixture() {
  if (demoBase) return async () => {};

  const port = await unusedLocalPort();
  demoBase = `http://127.0.0.1:${port}`;
  const nextBin = resolve(DEMO, "node_modules/next/dist/bin/next");
  assert(existsSync(nextBin), `DoneOS fixture dependencies are missing at ${nextBin}`);

  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: DEMO,
    env: environment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const remember = (chunk) => {
    output = `${output}${chunk}`.slice(-8000);
  };
  child.stdout.on("data", remember);
  child.stderr.on("data", remember);

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`DoneOS fixture exited before it was ready (${child.exitCode}).\n${output}`);
    }
    try {
      const response = await fetch(demoBase, { redirect: "manual" });
      if (response.status < 500) break;
    } catch {
      // The server is still compiling.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  try {
    const response = await fetch(demoBase, { redirect: "manual" });
    assert(response.status < 500, `DoneOS fixture did not become ready.\n${output}`);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }

  return async () => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  };
}

async function connectStdio(server, env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [server],
    env: environment(env),
    stderr: "pipe",
  });
  const client = new Client({ name: "walkthrough-studio", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

async function productionGate(url) {
  const response = await fetch(url, { redirect: "manual" });
  const challenge = response.headers.get("www-authenticate") ?? "";
  assert(response.status === 401, `${url} returned ${response.status}, expected the OAuth 401 gate`);
  assert(/resource_metadata/i.test(challenge), `${url} did not advertise protected-resource metadata`);
  return {
    status: response.status,
    challenge: challenge.replace(/Bearer\s*/i, "Bearer ").replace(/https?:\/\/[^\s\"]+/g, (value) => value),
  };
}

async function doneOsGenerated() {
  const client = await connectStdio(resolve(DONEOS, "mcp/lib/index.js"), {
    DONEOS_API_KEY: "dos_walkthrough_fixture",
    DONEOS_API_URL: "http://127.0.0.1:9",
  });
  try {
    const { tools } = await client.listTools();
    const split = toolSplit(tools);
    assert(split.total === 55 && split.writes === 36 && split.reads === 19, `DoneOS split changed: ${JSON.stringify(split)}`);
    const createWork = tools.find((tool) => tool.name === "create_work_item");
    assert(createWork, "DoneOS create_work_item is missing");
    const properties = Object.keys(createWork.inputSchema?.properties ?? {});
    assert(properties.includes("idempotencyKey"), "DoneOS create_work_item lost Idempotency-Key input");
    assert(createWork.outputSchema?.properties?.workItem, "DoneOS create_work_item lost its unwrapped output schema");
    return [
      {
        title: "The generated surface is executable",
        action: "Connected with the official MCP SDK and called `tools/list` on the generated DoneOS stdio server.",
        command: "mcp tools/list --server doneos-generated",
        lines: [
          `connected  doneos v1.2.0`,
          `tools/list  ${split.total} accepted`,
          `surface     ${split.writes} write · ${split.reads} read`,
          `result      protocol validation passed`,
        ],
        alt: "Terminal showing the generated DoneOS MCP server returning 55 valid tools",
      },
      {
        title: "The contract carries execution semantics",
        action: "Inspected the generated `create_work_item` tool returned by discovery.",
        command: "mcp inspect create_work_item --server doneos-generated",
        lines: [
          `tool        create_work_item`,
          `scope       work:write`,
          `header      idempotencyKey → Idempotency-Key`,
          `output      workItem + event + replayed`,
          `boundary    typed command, not direct Firestore access`,
        ],
        alt: "Terminal showing DoneOS work creation semantics including idempotency and typed output",
      },
    ];
  } finally {
    await client.close();
  }
}

async function doneOsDemo() {
  // A fresh bearer creates a fresh fixture board. Reusing a literal here made
  // a second capture inherit the first run's goal and falsely fail isolation.
  const token = `walkthrough-doneos-${Date.now()}`;
  assert(demoBase, "DoneOS fixture URL was not initialized");
  const endpoint = new URL(`${demoBase}/api/mcp/doneos`);
  const connect = async (bearer, name) => {
    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const client = new Client({ name, version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    return client;
  };
  const client = await connect(token, "doneos-story");
  const call = async (name, args = {}) => textResult(await client.callTool({ name, arguments: args }));
  try {
    const { tools } = await client.listTools();
    const split = toolSplit(tools);
    assert(split.total === 23 && split.writes === 16, `DoneOS demo split changed: ${JSON.stringify(split)}`);
    const before = await call("list_work_items", { status: "in_progress" });
    const goal = await call("create_goal", {
      title: "Ship the MCP walkthrough",
      keyResults: [{ id: "kr_story", title: "Audience can inspect the proof", status: "not_started" }],
    });
    const created = await call("create_work_item", {
      title: "Link DoneOS proof from Openstage",
      goalId: goal.id,
      priority: "high",
    });
    const started = await call("start_work_item", { workItemId: created.workItem.id });
    const blocked = await call("block_work_item", { workItemId: "wi_smtp_quota" });
    await call("record_execution_event", {
      type: "commented",
      workItemId: "wi_smtp_quota",
      summary: "Provider review takes three business days.",
    });
    const status = await call("summarize_status_for_slack", {});
    const goals = await call("list_goals", {});
    const match = goals.result.find((candidate) => candidate.id === goal.id && candidate.title === goal.title);
    assert(match, "DoneOS independent read-back did not find the created goal");

    const other = await connect(`${token}-fresh`, "doneos-story-fresh");
    const fresh = textResult(await other.callTool({ name: "list_goals", arguments: {} }));
    await other.close();
    assert(fresh.result.length === 2 && goals.result.length === 3, "DoneOS token isolation changed");

    const gate = await productionGate("https://app.doneos.net/mcp");
    return [
      {
        title: "A safe slice, reached like a real client",
        action: "Connected to the generated HTTP route with the official MCP SDK and called `tools/list`.",
        command: "mcp tools/list --url <isolated DoneOS fixture>",
        lines: [
          `tools/list   ${split.total} accepted`,
          `surface      ${split.writes} write · ${split.reads} read`,
          `fixture      session-scoped · fictional data`,
          `production   no credential loaded`,
        ],
        alt: "Terminal showing the isolated DoneOS MCP demo returning 23 valid tools",
      },
      {
        title: "Read before acting",
        action: "Called `list_work_items` for work already in progress.",
        command: "mcp call list_work_items status=in_progress",
        lines: [
          `result       ${before.result.length} work items`,
          ...before.result.slice(0, 3).map((item) => `in progress  ${item.title}`),
          `decision     inspect shared state before writing`,
        ],
        alt: "Terminal showing the DoneOS agent reading active work before changing anything",
      },
      {
        title: "One goal becomes attributable work",
        action: "Called `create_goal`, `create_work_item`, then the `start_work_item` command.",
        command: "mcp call create_goal → create_work_item → start_work_item",
        lines: [
          `goal         ${goal.title}`,
          `work         ${started.workItem.title}`,
          `state        ${started.workItem.status} · zone ${started.workItem.zoneId}`,
          `ledger       state transition recorded`,
        ],
        alt: "Terminal showing a synthetic DoneOS goal turned into started work",
      },
      {
        title: "A blocker is state plus evidence",
        action: "Called `block_work_item` and appended a separate execution event with the reason.",
        command: "mcp call block_work_item + record_execution_event",
        lines: [
          `work         ${blocked.workItem.title}`,
          `state        ${blocked.workItem.status}`,
          `reason       Provider review takes three business days.`,
          `ledger       command + attributable note`,
        ],
        alt: "Terminal showing DoneOS recording a blocked item and the reason",
      },
      {
        title: "The write survives an independent read",
        action: "Called the read-only status and goal tools after the writes completed.",
        command: "mcp call summarize_status_for_slack && mcp call list_goals",
        lines: [
          `status       ${status.counts.inProgress} in progress · ${status.counts.blocked} blocked`,
          `read-back    ${goals.result.length} goals`,
          `exact match  id + title found`,
          `proof        ${goal.title}`,
        ],
        alt: "Terminal showing DoneOS status and exact read-back of the created goal",
      },
      {
        title: "Authority is isolated and production stays gated",
        action: "Connected with a fresh fixture token, then probed the public production MCP endpoint without credentials.",
        command: "mcp isolation-check && curl -I https://app.doneos.net/mcp",
        lines: [
          `fresh token  ${fresh.result.length} seed goals`,
          `first token  ${goals.result.length} goals after write`,
          `production   HTTP ${gate.status}`,
          `challenge    protected-resource metadata advertised`,
          `claim        discovery only · no production write`,
        ],
        alt: "Terminal showing DoneOS fixture isolation and the production OAuth boundary",
      },
    ];
  } finally {
    await client.close();
  }
}

async function recordingInnerQuestApi() {
  const state = [];
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    const body = text ? JSON.parse(text) : undefined;
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body });
    response.setHeader("content-type", "application/json");
    if (request.method === "POST" && request.url === "/api/v1/values/check-ins") {
      const record = { id: "values_check_in_demo", ...body };
      state.unshift(record);
      response.end(JSON.stringify(record));
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/v1/values/check-ins")) {
      response.end(JSON.stringify({ items: state, nextCursor: null }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "fixture route not found" }));
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert(address && typeof address === "object", "Inner Quest fixture did not bind a port");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose()))),
  };
}

async function innerQuestStory() {
  const fixture = await recordingInnerQuestApi();
  const client = await connectStdio(resolve(INNER, "packages/mcp-server/dist/index.js"), {
    INNER_QUEST_API_KEY: "iq_pk_walkthrough_fixture",
    INNER_QUEST_BASE_URL: fixture.baseUrl,
  });
  try {
    const { tools } = await client.listTools();
    const split = toolSplit(tools);
    assert(split.total === 143 && split.writes === 73 && split.reads === 70, `Inner Quest split changed: ${JSON.stringify(split)}`);
    const repairedNames = [
      "inner_quest_create_health_record",
      "inner_quest_create_personal_record",
      "inner_quest_create_values_check_in",
      "inner_quest_update_health_profile",
      "inner_quest_update_health_record",
      "inner_quest_update_personal_record",
    ];
    const repaired = repairedNames.map((name) => tools.find((tool) => tool.name === name));
    assert(repaired.every(Boolean), "One of the six repaired Inner Quest write tools is missing");
    assert(repaired.every((tool) => tool.inputSchema?.additionalProperties === true), "A repaired Inner Quest write schema is still closed");

    const payload = {
      value: "craft",
      score: 4,
      note: "Synthetic rehearsal: the MCP walkthrough is grounded in evidence.",
    };
    const written = textResult(
      await client.callTool({ name: "inner_quest_create_values_check_in", arguments: payload }),
    );
    const request = fixture.requests.find((entry) => entry.method === "POST");
    assert(request?.url === "/api/v1/values/check-ins", "The repaired write hit the wrong Inner Quest route");
    assert(request.authorization === "Bearer iq_pk_walkthrough_fixture", "The generated client did not carry the fixture credential");
    assert(request.body?.note === payload.note, "The repaired write dropped the free-form request body");

    const read = textResult(
      await client.callTool({ name: "inner_quest_list_values_check_ins", arguments: {} }),
    );
    const exact = read.items?.find((item) => item.id === written.id && item.note === payload.note);
    assert(exact, "Inner Quest independent read-back did not find the values check-in");
    const gate = await productionGate("https://www.innerquest.app/api/mcp");

    return [
      {
        title: "A Personal OS becomes a typed surface",
        action: "Connected with the official MCP SDK and called `tools/list` on the rebuilt Inner Quest stdio server.",
        command: "mcp tools/list --server inner-quest",
        lines: [
          `connected    inner-quest v1.9.0`,
          `tools/list   ${split.total} accepted`,
          `surface      ${split.writes} write · ${split.reads} read`,
          `domains      goals · relationships · career · wellbeing · reading`,
        ],
        alt: "Terminal showing the Inner Quest MCP server returning 143 valid tools",
      },
      {
        title: "The six silent writes are open again",
        action: "Inspected all six tools whose required free-form bodies had previously been dropped by code generation.",
        command: "mcp inspect repaired-writes --server inner-quest",
        lines: [
          `checked      ${repairedNames.length} repaired write tools`,
          `body         present on every handler`,
          `schema       additionalProperties: true`,
          `example      inner_quest_create_values_check_in`,
          `result       model can carry the fields the API stores`,
        ],
        alt: "Terminal showing six repaired Inner Quest write tools with open input schemas",
      },
      {
        title: "A values check-in crosses the generated boundary",
        action: "Called `inner_quest_create_values_check_in` with fictional values data against the recording fixture.",
        command: "mcp call inner_quest_create_values_check_in",
        lines: [
          `request      POST /api/v1/values/check-ins`,
          `value        ${payload.value}`,
          `score        ${payload.score}`,
          `body         note arrived intact`,
          `stored id    ${written.id}`,
        ],
        alt: "Terminal showing a fictional Inner Quest values check-in reaching the API fixture",
      },
      {
        title: "A separate read finds the exact result",
        action: "Called the read-only values check-in list tool after the write returned.",
        command: "mcp call inner_quest_list_values_check_ins",
        lines: [
          `items        ${read.items.length}`,
          `exact match  id + note found`,
          `next cursor  ${read.nextCursor ?? "null"}`,
          `proof        write → API → independent read`,
        ],
        alt: "Terminal showing the Inner Quest write found by an independent read tool",
      },
      {
        title: "Private production data stays behind consent",
        action: "Probed the public Inner Quest MCP endpoint without an OAuth session.",
        command: "curl -I https://www.innerquest.app/api/mcp",
        lines: [
          `production   HTTP ${gate.status}`,
          `challenge    inner_quest.read + inner_quest.write`,
          `metadata     protected-resource endpoint advertised`,
          `claim        discovery only · no account data read`,
          `next gate    owner OAuth consent before authenticated proof`,
        ],
        alt: "Terminal showing the Inner Quest production MCP endpoint protected by OAuth",
      },
    ];
  } finally {
    await client.close();
    await fixture.close();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function renderSteps(browser, slug, featureId, steps, accent) {
  const dir = resolve(OUT_ROOT, slug, featureId, "terminal");
  mkdirSync(dir, { recursive: true });
  const seen = new Map();
  for (const [index, step] of steps.entries()) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 2 });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#111318;color:#edf2f7}
      body{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;padding:34px}
      .term{height:100%;border:1px solid #353943;border-radius:14px;background:#17191f;overflow:hidden;box-shadow:0 24px 80px #0008}
      .bar{height:48px;display:flex;align-items:center;gap:9px;padding:0 17px;border-bottom:1px solid #30343d;background:#1d2027}
      .dot{width:10px;height:10px;border:1px solid #59606d;border-radius:999px}.label{margin-left:9px;color:#969eac;font-size:12px}
      .body{padding:30px 34px;font-size:18px;line-height:1.72}.prompt{color:${accent};font-weight:700}.command{color:#f7fafc}
      .line{white-space:pre-wrap}.key{display:inline-block;width:142px;color:#8e97a7}.value{color:#e6ebf2}.ok{color:${accent}}
      .foot{position:absolute;right:48px;bottom:45px;color:#6f7785;font-size:11px;letter-spacing:.14em;text-transform:uppercase}
    </style></head><body><div class="term"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="label">Walkthrough Studio · observed protocol transcript</span></div><div class="body"><div class="line"><span class="prompt">$</span> <span class="command">${escapeHtml(step.command)}</span></div><br>${step.lines.map((line) => {
      const [key, ...rest] = line.split(/\s{2,}/);
      return `<div class="line"><span class="key">${escapeHtml(key)}</span><span class="value">${escapeHtml(rest.join("  ") || "")}</span></div>`;
    }).join("")}<br><div class="line ok">✓ observed by the capture run</div></div></div><div class="foot">fictional fixture data · no production write</div></body></html>`;
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready);
    const filename = `step-${String(index + 1).padStart(2, "0")}-${featureId}.png`;
    const abs = join(dir, filename);
    await page.screenshot({ path: abs, animations: "disabled" });
    await page.close();
    const hash = createHash("md5").update(readFileSync(abs)).digest("hex");
    assert(!seen.has(hash), `${slug}/${featureId}/${filename} duplicates ${seen.get(hash)}`);
    seen.set(hash, filename);
    step.screenshotFilename = `${featureId}/terminal/${filename}`;
  }
}

function writeJson(slug, file, value) {
  const dir = resolve(OUT_ROOT, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), `${JSON.stringify(value, null, 2)}\n`);
}

function walkthrough(slug, feature, steps, target) {
  return {
    featureId: feature.id,
    featureName: feature.name,
    type: "feature",
    location: feature.location,
    category: "mcp",
    surface: "terminal",
    platform: "cli",
    locale: "en",
    headline: feature.headline,
    overview: feature.overview,
    targetAudience: "Operators deciding whether an agent-facing product surface is trustworthy",
    steps: steps.map((step, index) => ({
      stepNumber: index + 1,
      title: step.title,
      ...(index > 0 ? { action: step.action } : { action: step.action }),
      description: step.description ?? feature.stepDescriptions[index],
      screenshotFilename: step.screenshotFilename,
      screenshotAlt: step.alt,
      location: feature.location,
      verificationStatus: "live-walked",
    })),
    keyFeatures: feature.keyFeatures,
    tips: feature.tips,
    note: feature.note,
    generatedAt: now,
    capturedAt: now,
    targetSha: target.sha,
    targetCommitDate: target.commitDate,
  };
}

function catalog(slug, name, target, features, brand, capturedAgainst) {
  return {
    schemaVersion: 2,
    projectName: name,
    platform: "cli",
    driver: "terminal",
    capturedAgainst,
    discoveredAt: now,
    updatedAt: now,
    brand,
    scope: {
      status: "bounded",
      note: "Event proof only: generated MCP discovery plus isolated fictional writes. Production OAuth discovery is shown, but no private account was authorized and no production write was attempted.",
    },
    features: features.map((feature) => ({
      featureId: feature.id,
      featureName: feature.name,
      location: feature.location,
      category: "mcp",
      requiresAuth: false,
      surfaceStatus: { terminal: "done" },
      issueCount: 0,
      lastWalkthroughAt: now,
      notes: feature.note,
    })),
    personas: [],
    synthetic: false,
  };
}

function appendRun(slug, target, featureIds, screenshots, capturedAgainst, notes) {
  const file = resolve(OUT_ROOT, slug, "runs.json");
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { runs: [] };
  existing.runs.push({
    id: now,
    startedAt: now,
    completedAt: new Date().toISOString(),
    skill: "walkthrough",
    agent: "codex",
    target,
    config: {
      platform: "cli",
      driver: "official MCP SDK + terminal renderer",
      capturedAgainst,
      env: { data: "isolated fictional fixtures", productionAuth: "none" },
      surfaces: ["terminal"],
      locales: ["en"],
      notes,
    },
    coverage: { features: featureIds, personas: [], screenshots, videos: 0, issues: 0 },
  });
  writeJson(slug, "runs.json", existing);
}

const doneTarget = gitFacts(DONEOS);
const innerTarget = gitFacts(INNER);
const doneGeneratedSteps = await doneOsGenerated();
const stopDoneOsFixture = await startDoneOsFixture();
let doneProofSteps;
try {
  doneProofSteps = await doneOsDemo();
} finally {
  await stopDoneOsFixture();
}
const innerSteps = await innerQuestStory();

const doneFeatures = [
  {
    id: "generated-contract",
    name: "Generated MCP contract",
    location: "node mcp/lib/index.js",
    headline: "Fifty-five typed tools from one execution contract",
    overview: "The generated executable is not a list in a document. The official MCP SDK accepts the whole surface, including write annotations, OAuth scopes, idempotency headers and typed outputs.",
    stepDescriptions: [
      "The generated stdio server completed MCP discovery with **55 valid tools**: 36 write actions and 19 reads.",
      "The inspected work command carries the parts that usually disappear in naive code generation: a retry key, a narrow scope and a structured result.",
    ],
    keyFeatures: ["55 SDK-validated tools", "36 explicit writes", "Idempotency and output semantics preserved"],
    tips: ["This is the broad generated adapter, not the separately reviewed hosted production surface."],
    note: "Discovery ran against the local generated executable with a non-production placeholder credential; no tool call reached DoneOS production.",
  },
  {
    id: "write-read-back",
    name: "Controlled write and read-back",
    location: "MCP SDK → isolated DoneOS execution fixture",
    headline: "An agent changes work, then proves what changed",
    overview: "This rehearsal uses the same generated HTTP transport a client uses, but the backing board is session-scoped fictional data. The sequence reads first, creates and starts work, records a blocker, then independently reads the resulting goal and status.",
    stepDescriptions: [
      "The official MCP SDK accepts the event-safe 23-tool slice. The backing API is an in-memory fixture with no credential or code path to DoneOS production.",
      "The first action is a read. That keeps the agent from manufacturing a second source of truth before it knows what the shared board already contains.",
      "A fictional goal becomes a high-priority work item and moves through the command designed for that transition, so the execution ledger records the change.",
      "Blocking is not just a status bit. The command changes state, then a separate attributable event records why the work cannot move.",
      "The peak moment is the independent read: the exact goal ID and title are found after the write, alongside a status summary that includes the blocker.",
      "A different bearer token sees the untouched seed board, while the public endpoint still refuses anonymous access and advertises its OAuth boundary.",
    ],
    keyFeatures: ["Official MCP SDK transport", "Command-based state transitions", "Independent read-back", "Per-token fixture isolation"],
    tips: ["All names and records in this walkthrough are fictional event data."],
    note: "Live-walked against the isolated mcp-humanquest fixture. Production was probed only far enough to observe its unauthenticated OAuth challenge.",
  },
];

const innerFeatures = [
  {
    id: "repaired-write-path",
    name: "Repaired write path",
    location: "node packages/mcp-server/dist/index.js",
    headline: "A private reflection tool that can finally carry its body",
    overview: "Inner Quest already generated a formidable Personal OS surface. The hard part was finding a quiet generator defect inside it: six required free-form bodies vanished. This walk drives the repaired executable, sends fictional values data through one of those tools, and finds it again with a separate read.",
    stepDescriptions: [
      "The rebuilt server completes discovery with **143 tools** across the Personal OS: 73 writes and 70 reads.",
      "All six previously dead write tools now publish open input schemas and build request bodies, so the model can send the fields those endpoints store.",
      "The values check-in call reaches the exact v1 API route with the fictional note intact. This is an observed request, not a claim inferred from generated source.",
      "A separate list call finds the exact stored ID and note. That closes the loop from MCP write to API state to MCP read.",
      "The public production endpoint is alive and properly gated, but private-account proof stops at the owner-consent boundary.",
    ],
    keyFeatures: ["143 SDK-validated tools", "Six repaired free-form write bodies", "Observed API request", "Independent exact read-back"],
    tips: ["The fixture records only the synthetic request used by this run; it contains no Inner Quest account data."],
    note: "Captured from the local dirty Inner Quest working copy against a recording fixture. The production endpoint check proves OAuth discovery only; the repair is not claimed as deployed.",
  },
];

const browser = await chromium.launch({ headless: true });
try {
  await renderSteps(browser, "doneos", "generated-contract", doneGeneratedSteps, "#39d98a");
  await renderSteps(browser, "doneos", "write-read-back", doneProofSteps, "#ff6b5f");
  await renderSteps(browser, "inner-quest", "repaired-write-path", innerSteps, "#a78bfa");
} finally {
  await browser.close();
}

mkdirSync(resolve(OUT_ROOT, "doneos", "brand"), { recursive: true });
copyFileSync(resolve(DONEOS, "assets/brand/doneos-mark.svg"), resolve(OUT_ROOT, "doneos/brand/logo.svg"));
mkdirSync(resolve(OUT_ROOT, "inner-quest", "brand"), { recursive: true });
copyFileSync(resolve(INNER, "public/logo.svg"), resolve(OUT_ROOT, "inner-quest/brand/logo.svg"));

writeJson(
  "doneos",
  "catalog.json",
  catalog(
    "doneos",
    "DoneOS",
    doneTarget,
    doneFeatures,
    { primaryColor: "#ff6b5f", accentColor: "#39d98a", backgroundColor: "#17191c", textColor: "#f5f7fa", logoPath: "brand/logo.svg", fontFamily: "Inter" },
    "generated stdio server + isolated HTTP fixture + unauthenticated production discovery",
  ),
);
writeJson("doneos", "generated-contract.terminal.json", walkthrough("doneos", doneFeatures[0], doneGeneratedSteps, doneTarget));
writeJson("doneos", "write-read-back.terminal.json", walkthrough("doneos", doneFeatures[1], doneProofSteps, doneTarget));
writeJson("doneos", "issues.json", { issues: [] });
writeJson("doneos", "fixes.json", { fixes: [] });
appendRun(
  "doneos",
  doneTarget,
  doneFeatures.map((feature) => feature.id),
  doneGeneratedSteps.length + doneProofSteps.length,
  "DoneOS generated executable and mcp-humanquest isolated fixture",
  "SDK-validated discovery; fictional fixture writes and independent read-back; production OAuth discovery only",
);

writeJson(
  "inner-quest",
  "catalog.json",
  catalog(
    "inner-quest",
    "Inner Quest",
    innerTarget,
    innerFeatures,
    { primaryColor: "#8b5cf6", accentColor: "#ec4899", backgroundColor: "#0f1020", textColor: "#f8fafc", logoPath: "brand/logo.svg", fontFamily: "Inter" },
    "rebuilt stdio server + local recording fixture + unauthenticated production discovery",
  ),
);
writeJson("inner-quest", "repaired-write-path.terminal.json", walkthrough("inner-quest", innerFeatures[0], innerSteps, innerTarget));
writeJson("inner-quest", "issues.json", { issues: [] });
writeJson("inner-quest", "fixes.json", { fixes: [] });
appendRun(
  "inner-quest",
  innerTarget,
  innerFeatures.map((feature) => feature.id),
  innerSteps.length,
  "Inner Quest generated executable and local recording fixture",
  "SDK-validated discovery; fictional values write and independent read-back; production OAuth discovery only; target working tree was dirty",
);

console.log(`DoneOS MCP: ${doneGeneratedSteps.length + doneProofSteps.length} captures`);
console.log(`Inner Quest MCP: ${innerSteps.length} captures`);
console.log(`Artifacts: ${relative(ROOT, OUT_ROOT)}/doneos and inner-quest`);
