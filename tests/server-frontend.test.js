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

function request(pathname) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const request = http.get(
        { hostname: "127.0.0.1", port, path: pathname },
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
      request.on("error", (error) => {
        server.close(() => reject(error));
      });
    });
    server.on("error", reject);
  });
}

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
