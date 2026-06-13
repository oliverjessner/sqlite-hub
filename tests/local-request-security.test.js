const assert = require("node:assert/strict");
const test = require("node:test");
const {
  LOOPBACK_HOST,
  listenOnLoopback,
  localRequestSecurity,
} = require("../server/middleware/localRequestSecurity");

function runMiddleware({ method = "GET", protocol = "http", headers = {} } = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
  );
  const req = {
    method,
    protocol,
    get(name) {
      return normalizedHeaders[String(name).toLowerCase()];
    },
  };

  return new Promise((resolve) => {
    localRequestSecurity(req, {}, (error) => resolve(error ?? null));
  });
}

test("server listener binds explicitly to the IPv4 loopback address", () => {
  let receivedArguments = null;
  const listener = {};
  const app = {
    listen(...args) {
      receivedArguments = args;
      return listener;
    },
  };

  assert.equal(listenOnLoopback(app, 4173), listener);
  assert.deepEqual(receivedArguments, [4173, LOOPBACK_HOST]);
});

test("local API security accepts same-origin browser and CLI requests", async () => {
  assert.equal(
    await runMiddleware({
      method: "POST",
      headers: {
        host: "127.0.0.1:4173",
        origin: "http://127.0.0.1:4173",
        "sec-fetch-site": "same-origin",
      },
    }),
    null
  );
  assert.equal(
    await runMiddleware({
      method: "POST",
      headers: { host: "localhost:4173" },
    }),
    null
  );
});

test("local API security rejects foreign hosts and cross-origin mutations", async () => {
  const foreignHostError = await runMiddleware({
    headers: { host: "example.test:4173" },
  });
  const crossOriginError = await runMiddleware({
    method: "POST",
    headers: {
      host: "127.0.0.1:4173",
      origin: "https://example.test",
      "sec-fetch-site": "cross-site",
    },
  });
  const wrongSchemeError = await runMiddleware({
    method: "PATCH",
    headers: {
      host: "localhost:4173",
      origin: "https://localhost:4173",
    },
  });

  for (const error of [foreignHostError, crossOriginError, wrongSchemeError]) {
    assert.equal(error?.statusCode, 403);
    assert.equal(error?.code, "LOCAL_REQUEST_REQUIRED");
  }
});
