#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const Database = require("better-sqlite3");

const DEFAULT_URL = "http://127.0.0.1:4180";
const DEFAULT_OUT_DIR = "screenshots/sqlite-hub";
const DEFAULT_BACKUP_FIXTURE_PORT = 4191;
const BACKUP_FIXTURE_FILENAME = "backup_drawer.png";
const DEFAULT_VIEWPORT = {
  width: 1988,
  height: 1280,
};
const DEFAULT_DATABASE_LABEL = "trump live interviews";
const MEDIA_TAGGING_DATABASE_LABEL = "Unit-00";
const TARGET_QUERY_HISTORY_TITLE = "TOP10 Loser and Winner EOD, T1, T3, T5";
const QUERY_HISTORY_TABS_TO_SEARCH = ["recent", "saved", "unsaved"];
const MEDIA_TAGGING_SCENARIOS = new Set(["media_tagging_setup", "media_tagging_queue"]);

const MENU_SCENARIOS = [
  {
    slug: "connections",
    path: "/connections",
    drawers: [],
    modalActions: ["open-database-discovery"],
  },
  { slug: "overview", path: "/overview", drawers: [] },
  {
    slug: "data",
    path: "/data",
    drawers: [
      {
        extra: "roweditor",
        selector: '[data-action="select-data-row"][data-row-index]',
        waitSelector: "#app-panel [data-row-editor-field], #app-panel",
      },
    ],
  },
  { slug: "structure", path: "/structure", drawers: [] },
  {
    slug: "sql_editor",
    path: "/editor",
    targetHistoryTitle: TARGET_QUERY_HISTORY_TITLE,
    targetHistoryMode: "editor",
    drawers: [
      {
        extra: "query_detail",
        selector: '[data-action="select-query-history-item"][data-history-id]',
        waitSelector: "#app-panel .query-history-detail-sql, #app-panel",
      },
    ],
  },
  {
    slug: "charts",
    path: "/charts",
    targetHistoryTitle: TARGET_QUERY_HISTORY_TITLE,
    targetHistoryMode: "charts",
    drawers: [
      {
        extra: "query_detail",
        selector: '[data-action="open-charts-query-detail"][data-history-id]',
        waitSelector: '#app-panel [data-action="close-charts-query-detail"], #app-panel',
      },
    ],
  },
  { slug: "documents", path: "/documents", drawers: [] },
  { slug: "table_designer", path: "/table-designer", drawers: [] },
  { slug: "media_tagging_setup", path: "/media-tagging", drawers: [] },
  { slug: "media_tagging_queue", path: "/media-tagging/queue", drawers: [] },
  {
    slug: "backups",
    path: "/backups",
    drawers: [
      {
        extra: "compare_drawer",
        selector: 'button[data-action="open-compare-backup-drawer"][data-backup-id]:not(:disabled)',
        waitSelector: '#app-panel [data-action="close-backup-diff-drawer"]',
      },
    ],
  },
  { slug: "logs", path: "/logs", drawers: [] },
  { slug: "settings", path: "/settings", drawers: [] },
];

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_URL,
    outDir: DEFAULT_OUT_DIR,
    width: DEFAULT_VIEWPORT.width,
    height: DEFAULT_VIEWPORT.height,
    chromePath: process.env.CHROME_PATH || "",
    startServer: true,
  };

  for (const argument of argv) {
    if (argument === "--no-start-server") {
      options.startServer = false;
      continue;
    }

    const [key, ...valueParts] = argument.split(":");
    const value = valueParts.join(":");

    if ((key === "--url" || key === "--base-url") && value) {
      options.baseUrl = value.replace(/\/+$/, "");
    } else if (key === "--out" && value) {
      options.outDir = value;
    } else if (key === "--width" && value) {
      options.width = Number(value);
    } else if (key === "--height" && value) {
      options.height = Number(value);
    } else if (key === "--chrome" && value) {
      options.chromePath = value;
    }
  }

  if (!Number.isInteger(options.width) || options.width < 320) {
    throw new Error(`Invalid --width value: ${options.width}`);
  }

  if (!Number.isInteger(options.height) || options.height < 240) {
    throw new Error(`Invalid --height value: ${options.height}`);
  }

  return options;
}

function parseBackupFixtureArgs(argv) {
  const options = {
    port: DEFAULT_BACKUP_FIXTURE_PORT,
    out: path.join(DEFAULT_OUT_DIR, BACKUP_FIXTURE_FILENAME),
    width: DEFAULT_VIEWPORT.width,
    height: DEFAULT_VIEWPORT.height,
    chromePath: process.env.CHROME_PATH || "",
    tab: "data",
    keepTemp: false,
  };

  for (const argument of argv) {
    if (argument === "--keep-temp") {
      options.keepTemp = true;
      continue;
    }

    const [key, ...valueParts] = argument.split(":");
    const value = valueParts.join(":");

    if ((key === "--out" || key === "--output") && value) {
      options.out = value;
    } else if (key === "--port" && value) {
      options.port = Number(value);
    } else if (key === "--width" && value) {
      options.width = Number(value);
    } else if (key === "--height" && value) {
      options.height = Number(value);
    } else if (key === "--chrome" && value) {
      options.chromePath = value;
    } else if (key === "--tab" && value) {
      options.tab = value === "schema" ? "schema" : "data";
    }
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`Invalid --port value: ${options.port}`);
  }

  if (!Number.isInteger(options.width) || options.width < 320) {
    throw new Error(`Invalid --width value: ${options.width}`);
  }

  if (!Number.isInteger(options.height) || options.height < 240) {
    throw new Error(`Invalid --height value: ${options.height}`);
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerReachable(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function getPortFromUrl(baseUrl) {
  try {
    return Number(new URL(baseUrl).port) || 4180;
  } catch {
    return 4180;
  }
}

async function ensureServer(baseUrl, startServer) {
  if (await isServerReachable(baseUrl)) {
    return null;
  }

  if (!startServer) {
    throw new Error(`SQLite Hub is not reachable at ${baseUrl}`);
  }

  const { startServer: startSQLiteHubServer } = require("../server/server");
  const serverInfo = await startSQLiteHubServer({ port: getPortFromUrl(baseUrl) });

  await sleep(500);
  return serverInfo;
}

function normalizeConnectionName(value) {
  return String(value || "")
    .trim()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function connectionMatchesLabel(connection, label) {
  const target = normalizeConnectionName(label);
  const candidates = [
    connection?.id,
    connection?.label,
    connection?.name,
    connection?.path,
    connection?.path ? path.basename(connection.path) : "",
  ].map(normalizeConnectionName);

  return candidates.some((candidate) => candidate === target);
}

async function requestApiJson(baseUrl, routePath, options = {}) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${routePath}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || `Request failed: ${routePath}`);
  }

  return payload;
}

async function getRecentConnections(baseUrl) {
  const payload = await requestApiJson(baseUrl, "/api/connections/recent");
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function getActiveConnection(baseUrl) {
  const payload = await requestApiJson(baseUrl, "/api/connections/active");
  return payload?.data ?? null;
}

async function selectDatabaseByLabel(baseUrl, label) {
  const activeConnection = await getActiveConnection(baseUrl);

  if (connectionMatchesLabel(activeConnection, label)) {
    return activeConnection;
  }

  const recentConnections = await getRecentConnections(baseUrl);
  const connection = recentConnections.find((candidate) => connectionMatchesLabel(candidate, label));

  if (!connection?.id) {
    const available = recentConnections
      .map((candidate) => candidate.label || candidate.id || candidate.path)
      .filter(Boolean)
      .join(", ");
    throw new Error(`Database "${label}" not found in recent connections. Available: ${available || "none"}`);
  }

  const payload = await requestApiJson(baseUrl, "/api/connections/select-active", {
    method: "POST",
    body: JSON.stringify({ id: connection.id }),
  });

  await sleep(700);
  return payload?.data ?? connection;
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function findExecutable(command) {
  const pathEntries = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);

  for (const entry of pathEntries) {
    const candidate = path.join(entry, command);

    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return "";
}

function findChromeExecutable(explicitPath = "") {
  const candidates = [
    explicitPath,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    findExecutable("google-chrome"),
    findExecutable("google-chrome-stable"),
    findExecutable("chromium"),
    findExecutable("chromium-browser"),
    findExecutable("chrome"),
  ].filter(Boolean);

  const found = candidates.find(fileExists);

  if (!found) {
    throw new Error("Chrome/Chromium was not found. Set CHROME_PATH or pass --chrome:/path/to/chrome.");
  }

  return found;
}

function launchChrome(chromePath) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-screenshots-"));
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );

  const wsUrlPromise = new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error("Timed out while waiting for Chrome DevTools endpoint."));
    }, 10000);

    chrome.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    chrome.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);

      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });

  return {
    process: chrome,
    userDataDir,
    wsUrlPromise,
  };
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.wsUrl);
      this.socket.addEventListener("open", () => resolve());
      this.socket.addEventListener("error", (event) => reject(event.error || new Error("CDP socket error.")));
      this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // Ignore close errors during cleanup.
    }
  }

  handleMessage(rawMessage) {
    const message = JSON.parse(rawMessage);

    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timeout } = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(timeout);

      if (message.error) {
        reject(new Error(message.error.message || "CDP command failed."));
      } else {
        resolve(message.result || {});
      }

      return;
    }

    if (message.method) {
      const listeners = this.listeners.get(message.method) || [];
      for (const listener of listeners) {
        listener(message);
      }
    }
  }

  send(method, params = {}, sessionId = null, timeoutMs = 20000) {
    const id = this.nextId++;
    const message = {
      id,
      method,
      params,
    };

    if (sessionId) {
      message.sessionId = sessionId;
    }

    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
    });

    this.socket.send(JSON.stringify(message));
    return promise;
  }

  waitForEvent(method, predicate = () => true, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const listener = (message) => {
        if (!predicate(message)) {
          return;
        }

        cleanup();
        resolve(message.params || {});
      };

      const cleanup = () => {
        clearTimeout(timeout);
        const listeners = this.listeners.get(method) || [];
        this.listeners.set(
          method,
          listeners.filter((candidate) => candidate !== listener),
        );
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out while waiting for CDP event: ${method}`));
      }, timeoutMs);

      this.listeners.set(method, [...(this.listeners.get(method) || []), listener]);
    });
  }
}

async function createPage(client, viewport) {
  const target = await client.send("Target.createTarget", {
    url: "about:blank",
  });
  const attached = await client.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;

  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  await client.send(
    "Emulation.setDeviceMetricsOverride",
    {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    },
    sessionId,
  );

  return {
    client,
    sessionId,
  };
}

async function evaluate(page, expression, options = {}) {
  const result = await page.client.send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: options.awaitPromise !== false,
      returnByValue: options.returnByValue !== false,
    },
    page.sessionId,
  );

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed.");
  }

  return result.result?.value;
}

async function waitForExpression(page, expression, timeoutMs = 10000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const matched = await evaluate(page, `Boolean(${expression})`).catch(() => false);

    if (matched) {
      return true;
    }

    await sleep(150);
  }

  return false;
}

function appUrl(baseUrl, routePath) {
  return `${baseUrl.replace(/\/+$/, "")}/#${routePath}`;
}

async function navigateTo(page, baseUrl, routePath) {
  const loadEvent = page.client
    .waitForEvent("Page.loadEventFired", (message) => message.sessionId === page.sessionId, 1200)
    .catch(() => null);

  await page.client.send("Page.navigate", { url: appUrl(baseUrl, routePath) }, page.sessionId);
  await loadEvent;
  await waitForExpression(page, 'document.querySelector(".app-shell") && document.body.innerText.length > 20', 15000);
  await sleep(900);
}

async function clickSelector(page, selector, options = {}) {
  const clicked = await evaluate(
    page,
    `(async () => {
      const selector = ${JSON.stringify(selector)};
      const nodes = Array.from(document.querySelectorAll(selector));
      const node = nodes.find((candidate) => !candidate.disabled) || nodes[0];
      if (!node) return false;
      node.scrollIntoView({ block: "center", inline: "nearest" });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      node.click();
      return true;
    })()`,
  );

  if (!clicked && options.required) {
    throw new Error(`Could not find selector: ${selector}`);
  }

  await sleep(options.delay ?? 700);
  return Boolean(clicked);
}

function normalizeQueryTitleForMatch(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function setHistorySearch(page, bindName, query) {
  await evaluate(
    page,
    `(async () => {
      const input = document.querySelector(${JSON.stringify(`[data-bind="${bindName}"]`)});
      if (!input) return false;
      input.focus();
      input.value = ${JSON.stringify(query)};
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 350));
      return true;
    })()`,
  );
}

async function ensureHistorySearchVisible(page, bindName) {
  if (await hasSelector(page, `[data-bind="${bindName}"]`)) {
    return true;
  }

  await clickSelector(page, 'button[data-action="toggle-query-history-panel"][data-next-value="true"]', {
    delay: 650,
  });

  return waitForExpression(page, `document.querySelector(${JSON.stringify(`[data-bind="${bindName}"]`)})`, 5000);
}

async function setHistoryTab(page, action, tab) {
  const clicked = await clickSelector(page, `button[data-action="${action}"][data-tab="${tab}"]`, {
    delay: 650,
  });

  if (clicked) {
    await sleep(650);
  }
}

async function clickHistoryItemByTitle(page, title, mode) {
  const normalizedTitle = normalizeQueryTitleForMatch(title);

  return Boolean(
    await evaluate(
      page,
      `(async () => {
        const normalizedTitle = ${JSON.stringify(normalizedTitle)};
        const mode = ${JSON.stringify(mode)};
        const normalize = (value) => String(value || "").trim().replace(/\\s+/g, " ").toLowerCase();
        const items = Array.from(document.querySelectorAll(".query-history-item"));
        const item = items.find((candidate) => {
          const titleNode = candidate.querySelector(".query-history-item-title");
          const text = normalize(titleNode?.textContent || "");
          return text === normalizedTitle || text.includes(normalizedTitle) || normalizedTitle.includes(text);
        });

        if (!item) return false;

        const actionSelector = mode === "charts"
          ? ".query-history-item-hit[data-action='navigate']"
          : "[data-action='open-query-history']";
        const action = item.querySelector(actionSelector) || item.querySelector(".query-history-item-hit");

        if (!action) return false;
        action.scrollIntoView({ block: "center", inline: "nearest" });
        await new Promise((resolve) => requestAnimationFrame(resolve));
        action.click();
        return true;
      })()`,
    ),
  );
}

async function openHistoryTitle(page, scenario) {
  if (!scenario.targetHistoryTitle) {
    return true;
  }

  const isCharts = scenario.targetHistoryMode === "charts";
  const bindName = isCharts ? "charts-history-search" : "query-history-search";
  const tabAction = isCharts ? "set-charts-history-tab" : "set-query-history-tab";

  if (!(await ensureHistorySearchVisible(page, bindName))) {
    return false;
  }

  for (const tab of QUERY_HISTORY_TABS_TO_SEARCH) {
    await setHistoryTab(page, tabAction, tab);
    await setHistorySearch(page, bindName, scenario.targetHistoryTitle);

    const clicked = await clickHistoryItemByTitle(page, scenario.targetHistoryTitle, scenario.targetHistoryMode);

    if (!clicked) {
      continue;
    }

    if (isCharts) {
      await waitForExpression(
        page,
        `document.body.textContent.toLowerCase().includes(${JSON.stringify(
          normalizeQueryTitleForMatch(scenario.targetHistoryTitle),
        )}) && document.querySelector(".charts-detail-shell")`,
        12000,
      );
    } else {
      await waitForExpression(page, 'document.querySelector("[data-bind=\\"current-query\\"]")', 6000);
    }

    await sleep(1200);
    return true;
  }

  return false;
}

async function prepareScenario(page, scenario) {
  if (!scenario.targetHistoryTitle) {
    return;
  }

  const opened = await openHistoryTitle(page, scenario);

  if (!opened) {
    throw new Error(`History query not found: ${scenario.targetHistoryTitle}`);
  }
}

async function pressEscape(page) {
  await page.client.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    },
    page.sessionId,
  );
  await page.client.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    },
    page.sessionId,
  );
  await sleep(300);
}

async function hasSelector(page, selector) {
  return Boolean(await evaluate(page, `Boolean(document.querySelector(${JSON.stringify(selector)}))`));
}

async function resetHorizontalScrollForScreenshot(page) {
  await evaluate(
    page,
    `(() => {
      window.scrollTo({ left: 0, top: window.scrollY, behavior: "instant" });
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;

      const selectors = [
        ".app-shell",
        ".app-body",
        ".app-main",
        ".app-main-scroll",
        "#app-view",
        "#app-panel",
        ".custom-scrollbar",
        "[class*='overflow-auto']",
        "[class*='overflow-x-auto']"
      ];

      for (const node of document.querySelectorAll(selectors.join(","))) {
        if (node instanceof HTMLElement) {
          node.scrollLeft = 0;
        }
      }
    })()`,
  );
  await sleep(100);
}

async function captureScreenshot(page, filePath) {
  await resetHorizontalScrollForScreenshot(page);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const screenshot = await page.client.send(
    "Page.captureScreenshot",
    {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true,
    },
    page.sessionId,
  );

  fs.writeFileSync(filePath, Buffer.from(screenshot.data, "base64"));
}

function clearOutputDirectory(outDir) {
  const outputPath = path.resolve(process.cwd(), outDir);
  fs.rmSync(outputPath, { recursive: true, force: true });
  fs.mkdirSync(outputPath, { recursive: true });
  console.log(`cleared ${path.relative(process.cwd(), outputPath)}`);
}

function configureIsolatedAppState(tempRoot) {
  process.env.HOME = tempRoot;
  process.env.XDG_STATE_HOME = path.join(tempRoot, "xdg-state");
  process.env.APPDATA = path.join(tempRoot, "AppData", "Roaming");
}

function createBackupFixtureDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);

  try {
    db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        plan TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE invoices (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        total_cents INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      CREATE INDEX idx_users_status ON users(status);

      INSERT INTO users (id, email, status, plan, updated_at) VALUES
        (1, 'ada@example.test', 'active', 'pro', '2026-06-20 10:00:00'),
        (2, 'grace@example.test', 'trial', 'starter', '2026-06-21 11:15:00'),
        (3, 'linus@example.test', 'churned', 'legacy', '2026-06-22 14:30:00');

      INSERT INTO invoices (id, user_id, total_cents, status) VALUES
        (101, 1, 4900, 'paid'),
        (102, 2, 1900, 'open'),
        (103, 3, 9900, 'void');
    `);
  } finally {
    db.close();
  }
}

async function prepareBackupDiffFixture(baseUrl, databasePath) {
  await requestApiJson(baseUrl, "/api/connections/open", {
    method: "POST",
    body: JSON.stringify({
      path: databasePath,
      label: "Backup Drawer Demo",
    }),
  });

  await requestApiJson(baseUrl, "/api/backups", {
    method: "POST",
    body: JSON.stringify({
      name: "Before customer plan migration",
      notes: "Screenshot fixture: baseline before schema and customer status changes.",
      type: "manual",
    }),
  });

  await requestApiJson(baseUrl, "/api/sql/execute", {
    method: "POST",
    body: JSON.stringify({
      sql: `
        ALTER TABLE users ADD COLUMN last_seen_at TEXT;
        UPDATE users
        SET status = 'active',
            plan = 'team',
            updated_at = '2026-06-24 19:25:00',
            last_seen_at = '2026-06-24 19:20:00'
        WHERE id = 2;
        INSERT INTO users (id, email, status, plan, updated_at, last_seen_at)
        VALUES (4, 'margaret@example.test', 'active', 'enterprise', '2026-06-24 19:30:00', '2026-06-24 19:30:00');
        DELETE FROM invoices WHERE id = 103;
        DELETE FROM users WHERE id = 3;
        CREATE TABLE feature_flags (
          id INTEGER PRIMARY KEY,
          flag_key TEXT NOT NULL UNIQUE,
          enabled INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO feature_flags (id, flag_key, enabled)
        VALUES (1, 'drawer_compare_preview', 1);
      `,
    }),
  });
}

async function openBackupFixtureDrawer(page, baseUrl, tab) {
  await navigateTo(page, baseUrl, "/backups");

  const buttonSelector = '[data-action="open-compare-backup-drawer"][data-backup-id]';
  const hasButton = await waitForExpression(
    page,
    `Array.from(document.querySelectorAll(${JSON.stringify(buttonSelector)})).some((node) => !node.disabled)`,
    10000,
  );

  if (!hasButton) {
    throw new Error("No enabled backup compare button was rendered.");
  }

  await clickSelector(page, buttonSelector, { required: true, delay: 900 });

  const opened = await waitForExpression(
    page,
    `document.querySelector("#app-panel [data-action='close-backup-diff-drawer']") &&
      !document.querySelector("#app-panel")?.textContent.includes("Comparing backup...")`,
    15000,
  );

  if (!opened) {
    throw new Error("Backup compare drawer did not finish loading.");
  }

  if (tab === "data") {
    await clickSelector(page, '#app-panel [data-action="set-backup-diff-tab"][data-tab="data"]', {
      required: true,
      delay: 500,
    });
  }

  await waitForExpression(
    page,
    `document.querySelector("#app-panel")?.textContent.includes("Before customer plan migration") &&
      document.querySelector("#app-panel")?.textContent.includes(${JSON.stringify(tab === "data" ? "id = 2" : "feature_flags")})`,
    10000,
  );
  await sleep(900);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function modalExtraName(descriptor) {
  const modalName = descriptor.modal || "";
  const actionName = descriptor.action || "";
  const raw = modalName || actionName.replace(/^open-/, "").replace(/-modal$/, "");

  return `${slugify(raw)}_modal`;
}

function databaseLabelForScenario(scenario) {
  return MEDIA_TAGGING_SCENARIOS.has(scenario.slug) ? MEDIA_TAGGING_DATABASE_LABEL : DEFAULT_DATABASE_LABEL;
}

class ScreenshotWriter {
  constructor(outDir) {
    this.outDir = outDir;
    this.counts = new Map();
    fs.mkdirSync(outDir, { recursive: true });
  }

  nextPath(menuSlug, extra = "") {
    const nextCount = (this.counts.get(menuSlug) || 0) + 1;
    this.counts.set(menuSlug, nextCount);
    const suffix = extra ? `_${slugify(extra)}` : "";

    return path.join(this.outDir, `${menuSlug}_${nextCount}${suffix}.png`);
  }
}

async function collectModalDescriptors(page, additionalActions = []) {
  return evaluate(
    page,
    `(() => {
      const additionalActions = new Set(${JSON.stringify(additionalActions)});
      const roots = [document.querySelector("#app-view"), document.querySelector("#app-panel")].filter(Boolean);
      const selectors = [
        "button[data-action*='modal']",
        "button[data-modal]",
        ...Array.from(additionalActions, (action) => "button[data-action=\"" + CSS.escape(action) + "\"]"),
      ];
      const nodes = roots.flatMap((root) => Array.from(root.querySelectorAll(selectors.join(","))));
      const seen = new Set();
      const descriptors = [];

      for (const node of nodes) {
        if (node.disabled) continue;
        const action = node.dataset.action || "";
        const modal = node.dataset.modal || "";
        if (!action.includes("modal") && !modal && !additionalActions.has(action)) continue;
        const key = [action, modal, node.dataset.typeScope || ""].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        descriptors.push({
          action,
          modal,
          typeScope: node.dataset.typeScope || "",
          tableName: node.dataset.tableName || "",
        });
      }

      return descriptors;
    })()`,
  );
}

function descriptorSelector(descriptor) {
  const parts = [];

  if (descriptor.action) {
    parts.push(`[data-action="${descriptor.action}"]`);
  }

  if (descriptor.modal) {
    parts.push(`[data-modal="${descriptor.modal}"]`);
  }

  if (descriptor.typeScope) {
    parts.push(`[data-type-scope="${descriptor.typeScope}"]`);
  }

  return `button${parts.join("")}`;
}

async function closeModal(page) {
  if (await hasSelector(page, "#modal-root > *")) {
    await pressEscape(page);
  }

  if (await hasSelector(page, "#modal-root > *")) {
    await clickSelector(page, '#modal-root [data-action="close-modal"]', { delay: 300 });
  }
}

async function captureModalScenarios(page, writer, baseUrl, scenario, log) {
  await navigateTo(page, baseUrl, scenario.path);
  await prepareScenario(page, scenario);
  const descriptors = await collectModalDescriptors(page, scenario.modalActions ?? []);

  for (const descriptor of descriptors) {
    const extra = modalExtraName(descriptor);

    await navigateTo(page, baseUrl, scenario.path);
    await prepareScenario(page, scenario);
    const clicked = await clickSelector(page, descriptorSelector(descriptor));

    if (!clicked) {
      log.skipped.push(`${scenario.slug}:${extra}`);
      continue;
    }

    const opened = await waitForExpression(page, 'document.querySelector("#modal-root > *")', 4000);

    if (!opened) {
      log.skipped.push(`${scenario.slug}:${extra}`);
      continue;
    }

    await sleep(1000);
    const targetPath = writer.nextPath(scenario.slug, extra);
    await captureScreenshot(page, targetPath);
    log.written.push(targetPath);
    console.log(`wrote ${path.relative(process.cwd(), targetPath)}`);
    await closeModal(page);
  }
}

async function captureDrawerScenarios(page, writer, baseUrl, scenario, log) {
  for (const drawer of scenario.drawers || []) {
    await navigateTo(page, baseUrl, scenario.path);
    await prepareScenario(page, scenario);
    const clicked = await clickSelector(page, drawer.selector);

    if (!clicked) {
      log.skipped.push(`${scenario.slug}:${drawer.extra}`);
      continue;
    }

    if (drawer.waitSelector) {
      await waitForExpression(page, `document.querySelector(${JSON.stringify(drawer.waitSelector)})`, 5000);
    }

    await sleep(900);
    const targetPath = writer.nextPath(scenario.slug, drawer.extra);
    await captureScreenshot(page, targetPath);
    log.written.push(targetPath);
    console.log(`wrote ${path.relative(process.cwd(), targetPath)}`);
  }
}

async function stopChrome(chrome) {
  if (!chrome?.process || chrome.process.killed) {
    return;
  }

  const exited = new Promise((resolve) => {
    chrome.process.once("exit", resolve);
  });

  chrome.process.kill("SIGTERM");
  await Promise.race([exited, sleep(2000)]);

  if (!chrome.process.killed) {
    chrome.process.kill("SIGKILL");
  }
}

async function removeDirectoryWithRetry(directoryPath) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(directoryPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }

      await sleep(250);
    }
  }
}

async function runBackupFixture(options) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-backup-drawer-"));
  const databasePath = path.join(tempRoot, "fixture", "backup-drawer-demo.sqlite");
  let serverInfo = null;
  let chrome = null;
  let client = null;

  configureIsolatedAppState(tempRoot);
  createBackupFixtureDatabase(databasePath);

  try {
    const { startServer } = require("../server/server");
    serverInfo = await startServer({ port: options.port });
    const baseUrl = serverInfo.url.replace(/\/+$/, "");

    await prepareBackupDiffFixture(baseUrl, databasePath);

    const chromePath = findChromeExecutable(options.chromePath);
    chrome = launchChrome(chromePath);
    client = new CdpClient(await chrome.wsUrlPromise);
    await client.connect();

    const page = await createPage(client, {
      width: options.width,
      height: options.height,
    });

    await openBackupFixtureDrawer(page, baseUrl, options.tab);

    const outputPath = path.resolve(process.cwd(), options.out);
    await captureScreenshot(page, outputPath);
    console.log(`wrote ${path.relative(process.cwd(), outputPath)}`);

    return outputPath;
  } finally {
    client?.close();
    await stopChrome(chrome);

    if (chrome?.userDataDir) {
      await removeDirectoryWithRetry(chrome.userDataDir);
    }

    if (serverInfo?.server) {
      await new Promise((resolve) => serverInfo.server.close(resolve));
    }

    if (options.keepTemp) {
      console.log(`kept temp fixture at ${tempRoot}`);
    } else {
      await removeDirectoryWithRetry(tempRoot);
    }
  }
}

async function runBackupFixtureWorker(options) {
  const outputPath = path.resolve(process.cwd(), options.outDir, BACKUP_FIXTURE_FILENAME);
  const args = [
    __filename,
    "--backup-fixture-worker",
    `--port:${DEFAULT_BACKUP_FIXTURE_PORT}`,
    `--out:${outputPath}`,
    `--width:${options.width}`,
    `--height:${options.height}`,
  ];

  if (options.chromePath) {
    args.push(`--chrome:${options.chromePath}`);
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const worker = spawn(process.execPath, args, { stdio: "inherit" });

        worker.once("error", reject);
        worker.once("exit", (code, signal) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(new Error(`Backup fixture worker failed (${signal || `exit ${code}`}).`));
        });
      });
      return outputPath;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }

      console.warn(`retrying backup fixture: ${error.message}`);
      await sleep(750);
    }
  }

  throw new Error("Backup fixture worker failed.");
}

async function runScreenshots(options) {
  const serverInfo = await ensureServer(options.baseUrl, options.startServer);
  const chromePath = findChromeExecutable(options.chromePath);
  const chrome = launchChrome(chromePath);
  const wsUrl = await chrome.wsUrlPromise;
  const client = new CdpClient(wsUrl);
  const writer = new ScreenshotWriter(path.resolve(process.cwd(), options.outDir));
  const log = {
    written: [],
    skipped: [],
  };

  try {
    await client.connect();
    const page = await createPage(client, {
      width: options.width,
      height: options.height,
    });
    let activeDatabaseLabel = "";

    for (const scenario of MENU_SCENARIOS) {
      try {
        const requiredDatabaseLabel = databaseLabelForScenario(scenario);

        if (activeDatabaseLabel !== requiredDatabaseLabel) {
          const connection = await selectDatabaseByLabel(options.baseUrl, requiredDatabaseLabel);
          activeDatabaseLabel = requiredDatabaseLabel;
          console.log(`database ${connection?.label || requiredDatabaseLabel}`);
        }

        await navigateTo(page, options.baseUrl, scenario.path);
        await prepareScenario(page, scenario);
        const targetPath = writer.nextPath(scenario.slug);

        await captureScreenshot(page, targetPath);
        log.written.push(targetPath);
        console.log(`wrote ${path.relative(process.cwd(), targetPath)}`);
        await captureDrawerScenarios(page, writer, options.baseUrl, scenario, log);
        await captureModalScenarios(page, writer, options.baseUrl, scenario, log);
      } catch (error) {
        log.skipped.push(`${scenario.slug}:${error.message}`);
        console.warn(`skipped ${scenario.slug}: ${error.message}`);
      }
    }
  } finally {
    client.close();
    await stopChrome(chrome);
    await removeDirectoryWithRetry(chrome.userDataDir);

    if (serverInfo?.server) {
      await new Promise((resolve) => serverInfo.server.close(resolve));
    }
  }

  return log;
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--backup-fixture-worker")) {
    await runBackupFixture(parseBackupFixtureArgs(argv));
    return;
  }

  const options = parseArgs(argv);
  clearOutputDirectory(options.outDir);
  const log = await runScreenshots(options);

  try {
    const backupFixturePath = await runBackupFixtureWorker(options);
    log.written.push(backupFixturePath);
  } catch (error) {
    log.skipped.push(`backup_fixture:${error.message}`);
    console.warn(`skipped backup_fixture: ${error.message}`);
  }

  if (log.skipped.length) {
    console.log(`skipped ${log.skipped.length} unavailable states: ${log.skipped.join(", ")}`);
  }

  console.log(`done: ${log.written.length} screenshot(s)`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  BACKUP_FIXTURE_FILENAME,
  MENU_SCENARIOS,
  modalExtraName,
};
