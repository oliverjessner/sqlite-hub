#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const Database = require("better-sqlite3");

const DEFAULT_PORT = 4191;
const DEFAULT_OUT = "screenshots/sqlite-hub/backup_drawer.png";
const DEFAULT_VIEWPORT = {
  width: 1920,
  height: 1280,
};

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    out: DEFAULT_OUT,
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-backup-drawer-chrome-"));
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

async function navigateTo(page, baseUrl, routePath) {
  const loadEvent = page.client
    .waitForEvent("Page.loadEventFired", (message) => message.sessionId === page.sessionId, 1200)
    .catch(() => null);

  await page.client.send("Page.navigate", { url: `${baseUrl}/#${routePath}` }, page.sessionId);
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

async function requestApiJson(baseUrl, routePath, options = {}) {
  const response = await fetch(`${baseUrl}${routePath}`, {
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

function configureIsolatedAppState(tempRoot) {
  process.env.HOME = tempRoot;
  process.env.XDG_STATE_HOME = path.join(tempRoot, "xdg-state");
  process.env.APPDATA = path.join(tempRoot, "AppData", "Roaming");
}

function createFixtureDatabase(databasePath) {
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

async function openBackupDrawer(page, baseUrl, tab) {
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

async function run(options) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-backup-drawer-"));
  const databasePath = path.join(tempRoot, "fixture", "backup-drawer-demo.sqlite");
  let serverInfo = null;
  let chrome = null;
  let client = null;

  configureIsolatedAppState(tempRoot);
  createFixtureDatabase(databasePath);

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

    await openBackupDrawer(page, baseUrl, options.tab);

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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await run(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
