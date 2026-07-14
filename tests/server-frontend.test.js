const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { app } = require("../server/server");

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
  for (const pathname of ["/", "/index.html"]) {
    const response = await request(pathname);

    assert.equal(response.statusCode, 200, pathname);
    assert.match(response.headers["content-type"], /text\/html/);
    assert.match(response.body, /SQLite Hub/);
  }
});
