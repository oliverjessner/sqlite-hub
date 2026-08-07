const assert = require("node:assert/strict");
const express = require("express");
const test = require("node:test");

const { createTextToStructRouter } = require("../server/routes/textToStruct");
const { TextToStructService } = require("../server/services/textToStructService");
const { errorMiddleware } = require("../server/utils/errors");

async function startApi(t, textToStructService = new TextToStructService()) {
  const app = express();
  app.use(express.json());
  app.use("/api/text-to-struct", createTextToStructRouter({ textToStructService }));
  app.use(errorMiddleware);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));

  return `http://127.0.0.1:${server.address().port}/api/text-to-struct/convert`;
}

test("conversion route returns the SQLite Hub envelope without a database service", async (t) => {
  const url = await startApi(t);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: "Oliver|34\nMax|29",
      schema: { name: "string", age: "integer" },
      parser: { type: "delimiter", delimiter: "|" },
      errors: "collect",
      output: "json",
      outputOptions: {},
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.message, "Text converted.");
  assert.equal(body.data.records.length, 2);
  assert.deepEqual(body.data.errors, []);
  assert.deepEqual(body.metadata, { recordCount: 2, errorCount: 0, format: "json" });
  assert.deepEqual(body.warnings, []);
});

test("conversion route returns validation errors for unsupported values", async (t) => {
  const url = await startApi(t);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: "Oliver",
      schema: { name: "string" },
      parser: { type: "eval" },
      errors: "collect",
      output: "json",
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "TEXT_TO_STRUCT_VALIDATION_ERROR");
  assert.match(body.message, /Unsupported parser type/);
});

test("route maps service result fields into the expected envelope", async (t) => {
  const url = await startApi(t, {
    async convert(body) {
      assert.equal(body.input, "one");
      return {
        output: '[{"value":"one"}]',
        records: [{ value: "one" }],
        errors: [{ row: 2, property: "value", code: "REQUIRED", message: "required" }],
        metadata: { recordCount: 1, errorCount: 1, format: "json" },
      };
    },
  });
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: "one" }),
  });
  const body = await response.json();

  assert.equal(body.data.output, '[{"value":"one"}]');
  assert.equal(body.data.errors.length, 1);
  assert.equal(body.metadata.errorCount, 1);
});
