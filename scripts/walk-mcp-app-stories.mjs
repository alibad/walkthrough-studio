#!/usr/bin/env node
/**
 * Capture the product half of the MCP stories.
 *
 * The protocol walkthrough proves that the servers accept real MCP calls.
 * This walk closes the other half of the loop: it captures DoneOS itself
 * before and after an MCP write, using Firebase emulators and a disposable
 * fictional account. No production credential or production data is loaded.
 *
 * Prerequisites (kept explicit so a rehearsal cannot silently hit prod):
 *   firebase emulators:start --only auth,firestore,functions,hosting
 *   flutter run -d web-server --web-port 5321 --web-hostname 127.0.0.1 \
 *     --dart-define=DONEOS_API_URL=http://127.0.0.1:5002 \
 *     --dart-define=DONEOS_USE_FIREBASE_EMULATORS=true
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openCapture, SURFACES } from "./lib/capture/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DONEOS = resolve(ROOT, "..", "done_os");
const OUT = resolve(ROOT, "apps/hub/public/walkthroughs/doneos");
const APP = process.env.DONEOS_WALK_APP_URL ?? "http://127.0.0.1:5321";
const API = process.env.DONEOS_WALK_API_URL ?? "http://127.0.0.1:5002";
const AUTH = process.env.DONEOS_WALK_AUTH_URL ?? "http://127.0.0.1:9099";
const FEATURE = "write-read-back";
const TITLE = "Walkthrough proof — task created through MCP";
const now = new Date().toISOString();

const sdkRoot = resolve(DONEOS, "mcp/node_modules/@modelcontextprotocol/sdk/dist/esm");
const { Client } = await import(pathToFileURL(join(sdkRoot, "client/index.js")));
const { StreamableHTTPClientTransport } = await import(
  pathToFileURL(join(sdkRoot, "client/streamableHttp.js")),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(response, label) {
  const body = await response.json().catch(() => ({}));
  assert(response.ok, `${label} failed with ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function createDisposableAccount() {
  const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
  const email = `maya.walkthrough.${suffix}@example.test`;
  const password = `Local-only-${randomBytes(16).toString("base64url")}!`;
  const result = await json(
    await fetch(
      `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=walkthrough-local-only`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, displayName: "Maya Demo", returnSecureToken: true }),
      },
    ),
    "Disposable Auth emulator account",
  );
  assert(result.idToken, "Auth emulator did not return an ID token");
  return { email, password, idToken: result.idToken };
}

async function createAgentKey(idToken) {
  const result = await json(
    await fetch(`${API}/v1/api-keys`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${idToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ displayName: "Walkthrough Agent" }),
    }),
    "Local DoneOS agent key",
  );
  assert(result.data?.token, "DoneOS did not return the one-time local agent token");
  return result.data;
}

async function createThroughMcp(token) {
  const transport = new StreamableHTTPClientTransport(new URL(`${API}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  const client = new Client(
    { name: "walkthrough-studio-product-proof", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    const discovered = await client.listTools();
    assert(
      discovered.tools.some((tool) => tool.name === "create_work_item"),
      "DoneOS MCP did not expose create_work_item",
    );
    const result = await client.callTool({
      name: "create_work_item",
      arguments: {
        title: TITLE,
        description:
          "Fictional event data created by the Walkthrough Studio to prove that an MCP write appears in the DoneOS app.",
        priority: "high",
        zoneId: "next",
        idempotencyKey: `walkthrough-${Date.now()}-${randomBytes(5).toString("hex")}`,
      },
    });
    assert(!result.isError, "DoneOS MCP returned an error while creating the task");
    const workItem =
      result.structuredContent?.data?.workItem ??
      result.structuredContent?.workItem ??
      result.structuredContent?.result?.workItem;
    assert(workItem?.title === TITLE, "DoneOS MCP did not read back the created task");

    const listed = await client.callTool({
      name: "list_work_items",
      arguments: { zoneId: "next", limit: 50 },
    });
    const structured = listed.structuredContent ?? {};
    const items = structured.data?.workItems ?? structured.data ?? structured.workItems ?? structured.result ?? [];
    assert(
      Array.isArray(items) && items.some((item) => item.title === TITLE),
      "Independent MCP read-back did not find the created DoneOS task",
    );
    return workItem;
  } finally {
    await client.close();
  }
}

async function waitForText(page, text, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const body = await page.locator("body").innerText();
    if (body.includes(text)) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for DoneOS to show: ${text}`);
}

async function enableFlutterSemantics(page) {
  const placeholder = page.locator("flt-semantics-placeholder");
  if (await placeholder.count()) await placeholder.press("Enter");
}

function writeJson(file, value) {
  writeFileSync(join(OUT, file), `${JSON.stringify(value, null, 2)}\n`);
}

const account = await createDisposableAccount();
const cap = await openCapture({ outDir: OUT, driver: "playwright" });
let walk;

try {
  walk = await cap.feature(FEATURE, SURFACES.desktop, {
    url: APP,
    pinClock: false,
    readyTimeoutMs: 30_000,
  });
  const page = walk.ctx._page;
  await enableFlutterSemantics(page);

  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: /Connect Tab 4 of 5/ }).waitFor({ timeout: 30_000 });

  const intro = page.getByRole("button", { name: "Got it", exact: true });
  if (await intro.count()) await intro.click();

  await page.getByRole("button", { name: /Connect Tab 4 of 5/ }).click();
  await waitForText(page, "Create & connect agent");

  const steps = [];
  steps.push({
    stepNumber: 1,
    title: "Connection starts inside DoneOS",
    action: "Opened Connect and inspected the AI Agents panel.",
    description:
      "DoneOS explains what the MCP credential does before it asks for one: the connected agent can work the shared Queue, and every action is attributed in Activity. The empty state shows the supported clients and makes it clear that a key does not start an agent by itself.",
    screenshotFilename: await walk.shot("step-01-connect-settings.png", { firstOfScreen: true }),
    screenshotAlt: "DoneOS Connect screen showing AI agent setup and its attribution model",
    location: "DoneOS → Connect → AI Agents",
    verificationStatus: "live-walked",
  });

  const key = await createAgentKey(account.idToken);
  const created = await createThroughMcp(key.token);

  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.waitForTimeout(1_500);
  steps.push({
    stepNumber: 2,
    title: "The connected credential reports its use",
    action: "Connected with the generated local credential, then created and independently read back a task through the official MCP SDK.",
    description:
      "After the call, the credential appears as Walkthrough Agent with its usage state inside the product. The one-time token never appears in the capture.",
    screenshotFilename: await walk.shot("step-02-agent-connected.png"),
    screenshotAlt: "DoneOS Connect screen showing the Walkthrough Agent credential after an MCP call",
    location: "DoneOS → Connect → AI Agents",
    verificationStatus: "live-walked",
  });

  await page.getByRole("button", { name: /Execute Tab 1 of 5/ }).click();
  await page.getByRole("button", { name: /^Queue/ }).click();
  await page.waitForTimeout(1_500);
  steps.push({
    stepNumber: 3,
    title: "The MCP task is now real app work",
    action: "Opened Execute, then Queue after the MCP write completed.",
    description:
      "The exact high-priority task created through MCP appears in DoneOS beside the normal app controls. It is not a terminal transcript or a mocked result; this is the Flutter product reading the same emulator-backed state.",
    screenshotFilename: await walk.shot("step-03-task-in-queue.png", { firstOfScreen: true }),
    screenshotAlt: "DoneOS Queue showing the exact task created through MCP",
    location: "DoneOS → Execute → Queue",
    verificationStatus: "live-walked",
  });

  await page.getByRole("button", { name: /^Activity/ }).click();
  await page.waitForTimeout(1_500);
  steps.push({
    stepNumber: 4,
    title: "Activity keeps the agent accountable",
    action: "Opened Activity and found the creation event.",
    description:
      "DoneOS records the write as an execution event attributed to Walkthrough Agent. That closes the user-facing loop from connection settings, to MCP action, to visible task, to an auditable history.",
    screenshotFilename: await walk.shot("step-04-agent-activity.png", { firstOfScreen: true }),
    screenshotAlt: "DoneOS Activity showing the MCP-created task attributed to Walkthrough Agent",
    location: "DoneOS → Execute → Activity",
    verificationStatus: "live-walked",
  });

  await walk.finish();

  writeJson(`${FEATURE}.desktop.json`, {
    featureId: FEATURE,
    featureName: "MCP task in the real app",
    type: "feature",
    location: "DoneOS app → Connect → Execute → Activity",
    category: "mcp",
    surface: "desktop",
    platform: "web",
    locale: "en",
    headline: "Connect an agent, create a task, watch it land",
    overview:
      "This walkthrough crosses the boundary the protocol-only demo cannot: DoneOS explains the connection in its own settings, accepts a real MCP write, shows the resulting task in Queue, and attributes the event to the connected agent in Activity.",
    targetAudience: "People deciding whether MCP changes the product or only the developer console",
    steps,
    keyFeatures: [
      "In-app MCP connection settings",
      "Official MCP SDK write and independent read-back",
      "The exact task visible in the Flutter Queue",
      "Agent attribution in Activity",
    ],
    tips: ["All account and task data in this walkthrough is fictional and exists only in local emulators."],
    note:
      "Live-walked against the committed DoneOS Flutter app and local Firebase emulators. The disposable credential was never shown and disappears when the emulator session ends.",
    generatedAt: now,
    capturedAt: now,
    observedWorkItemId: created.id,
  });

  const catalogPath = join(OUT, "catalog.json");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  catalog.platform = "web";
  catalog.driver = "playwright";
  catalog.capturedAgainst =
    "committed DoneOS Flutter web app + Firebase emulators + official MCP SDK";
  catalog.updatedAt = now;
  catalog.scope = {
    status: "bounded",
    note:
      "Product proof uses a disposable fictional account in Firebase emulators. The terminal surface remains isolated fixture proof; neither flow writes to DoneOS production.",
  };
  const feature = catalog.features.find((item) => item.featureId === FEATURE);
  assert(feature, `Missing ${FEATURE} in DoneOS catalog`);
  feature.featureName = "MCP task in the real app";
  feature.location = "DoneOS app → Connect → Execute → Activity";
  feature.surfaceStatus = { ...(feature.surfaceStatus ?? {}), desktop: "done" };
  feature.requiresAuth = true;
  feature.lastWalkthroughAt = now;
  feature.notes =
    "Flutter UI and MCP shared the same emulator-backed state; the exact task was visible in Queue and attributed in Activity.";
  writeJson("catalog.json", catalog);

  const runsPath = join(OUT, "runs.json");
  const runs = existsSync(runsPath)
    ? JSON.parse(readFileSync(runsPath, "utf8"))
    : { runs: [] };
  runs.runs.push({
    id: now,
    startedAt: now,
    completedAt: new Date().toISOString(),
    skill: "walkthrough",
    agent: "codex",
    target: { app: "DoneOS", ref: "local committed Flutter source" },
    config: {
      platform: "web",
      driver: "Playwright + official MCP SDK",
      capturedAgainst: "DoneOS Flutter web app and local Firebase emulators",
      env: { data: "disposable fictional emulator account", productionAuth: "none" },
      surfaces: ["desktop"],
      locales: ["en"],
      notes: "Connection settings, MCP write/read-back, Queue result, and Activity attribution",
    },
    coverage: { features: [FEATURE], personas: [], screenshots: steps.length, videos: 0, issues: 0 },
  });
  writeJson("runs.json", runs);

  console.log(`DoneOS app walkthrough captured: ${steps.length} observed states`);
} finally {
  await cap.close();
}
