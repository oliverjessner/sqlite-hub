const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const isolatedStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-frontend-state-"));
const originalEnvironment = {
  APPDATA: process.env.APPDATA,
  HOME: process.env.HOME,
  XDG_STATE_HOME: process.env.XDG_STATE_HOME,
};

if (process.platform === "win32") {
  process.env.APPDATA = isolatedStateRoot;
} else if (process.platform === "darwin") {
  process.env.HOME = isolatedStateRoot;
} else {
  process.env.XDG_STATE_HOME = isolatedStateRoot;
}

const serverModule = require("../server/server");
const { app } = serverModule;
const ONE_PIXEL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3aUAAAAASUVORK5CYII=";

for (const [key, value] of Object.entries(originalEnvironment)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test.after(() => {
  serverModule.appStateStore.db.close();
  fs.rmSync(isolatedStateRoot, { recursive: true, force: true });
});

function request(pathname, method = "GET") {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const request = http.request(
        { hostname: "127.0.0.1", port, path: pathname, method },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => {
            server.close((error) => {
              if (error) reject(error);
              else resolve({ statusCode: response.statusCode, headers: response.headers, body });
            });
          });
        },
      );
      request.end();
      request.on("error", (error) => {
        server.close(() => reject(error));
      });
    });
    server.on("error", reject);
  });
}

test("startServer returns the port assigned when port zero is requested", async (t) => {
  const { port, server, url } = await serverModule.startServer({ port: 0 });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  assert.ok(port > 0);
  assert.equal(url, `http://127.0.0.1:${port}`);
  const response = await fetch(`${url}/api/health`);
  assert.equal(response.status, 200);
});

test("serves the SPA entrypoint from the root and direct index routes", async () => {
  assert.equal(serverModule.appStateStore.filePath.startsWith(isolatedStateRoot), true);

  for (const pathname of ["/", "/index.html"]) {
    const response = await request(pathname);

    assert.equal(response.statusCode, 200, pathname);
    assert.match(response.headers["content-type"], /text\/html/);
    assert.match(response.body, /SQLite Hub/);
    assert.match(response.body, /\/assets\/images\/logo\.webp/);
  }
});

test("serves the application logo as the favicon fallback", async () => {
  const response = await request("/favicon.ico");

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /image\/webp/);
  assert.ok(response.body.length > 0);
});

test("serves automatically published chart PNGs from the public chart URL", async () => {
  const published = serverModule.chartImageService.saveChartImage(
    "conn_testdatabase",
    42,
    ONE_PIXEL_PNG_DATA_URL,
  );
  const response = await request(published.url);

  assert.equal(published.url, "/conn_testdatabase/chart/42.png");
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /image\/png/);
  assert.ok(response.body.length > 0);
});


test("web app no longer registers an MCP endpoint or starts MCP services", async () => {
  for (const method of ["GET", "POST", "OPTIONS"]) {
    assert.equal((await request("/mcp", method)).statusCode, 404);
  }
  assert.equal(serverModule.mcpServices, undefined);
  assert.notEqual(serverModule.appStateStore.getMcpStatus().serverRunning, true);
});
