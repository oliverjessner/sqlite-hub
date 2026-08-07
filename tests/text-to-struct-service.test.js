const assert = require("node:assert/strict");
const test = require("node:test");

const { TextToStructService, normalizeRequest } = require("../server/services/textToStructService");

const service = new TextToStructService();

function payload(overrides = {}) {
  return {
    input: "Oliver | Salzburg | 34",
    schema: {
      name: "string",
      city: "string",
      age: "integer",
    },
    parser: {
      type: "delimiter",
      delimiter: "|",
    },
    deduplicate: false,
    errors: "collect",
    output: "json",
    outputOptions: {},
    ...overrides,
  };
}

test("delimiter input converts to JSON with integer types", async () => {
  const result = await service.convert(payload());

  assert.deepEqual(result.records, [{ name: "Oliver", city: "Salzburg", age: 34 }]);
  assert.deepEqual(JSON.parse(result.output), result.records);
  assert.deepEqual(result.metadata, { recordCount: 1, errorCount: 0, format: "json" });
});

test("delimiter input converts to Markdown", async () => {
  const result = await service.convert(payload({ output: "markdown" }));

  assert.match(result.output, /\| name \| city \| age \|/);
  assert.match(result.output, /\| Oliver \| Salzburg \| 34 \|/);
});

test("delimiter input generates SQLite CREATE TABLE and INSERT SQL", async () => {
  const result = await service.convert(
    payload({
      output: "sqlite",
      outputOptions: { table: "people", createTable: true },
      schema: {
        id: { type: "integer", primaryKey: true, autoIncrement: true },
        name: { type: "string", required: true },
      },
      input: "1|Oliver",
    })
  );

  assert.match(result.output, /CREATE TABLE "people"/);
  assert.match(result.output, /"id" INTEGER PRIMARY KEY AUTOINCREMENT/);
  assert.match(result.output, /INSERT INTO "people"/);
  assert.match(result.output, /\(1, 'Oliver'\)/);
});

test("float, boolean, and array fields use Text2Struct conversions", async () => {
  const result = await service.convert(
    payload({
      input: "19.95|yes|red; blue",
      schema: {
        price: "float",
        active: "boolean",
        tags: { type: "array", separator: ";" },
      },
    })
  );

  assert.deepEqual(result.records, [{ price: 19.95, active: true, tags: ["red", "blue"] }]);
});

test("required field failures are collected with successful records preserved", async () => {
  const result = await service.convert(
    payload({
      input: "Oliver|34\n|29\nMax|31",
      schema: {
        name: { type: "string", required: true },
        age: "integer",
      },
    })
  );

  assert.deepEqual(result.records, [
    { name: "Oliver", age: 34 },
    { name: "Max", age: 31 },
  ]);
  assert.equal(result.errors.length, 1);
  assert.deepEqual(
    { row: result.errors[0].row, property: result.errors[0].property, code: result.errors[0].code },
    { row: 2, property: "name", code: "REQUIRED" }
  );
  assert.equal(result.metadata.errorCount, 1);
});

test("skip mode removes invalid rows without collecting errors", async () => {
  const result = await service.convert(
    payload({
      input: "Oliver|34\nMax|abc",
      schema: { name: "string", age: "integer" },
      errors: "skip",
    })
  );

  assert.deepEqual(result.records, [{ name: "Oliver", age: 34 }]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.metadata.errorCount, 0);
});

test("deduplicate true removes identical records", async () => {
  const result = await service.convert(
    payload({
      input: "Oliver|Salzburg\nOliver|Salzburg\nMax|Berlin",
      schema: { name: "string", city: "string" },
      deduplicate: true,
    })
  );

  assert.equal(result.records.length, 2);
});

test("deduplicate can compare one property", async () => {
  const result = await service.convert(
    payload({
      input: "Oliver|Salzburg\nOliver|Vienna\nMax|Berlin",
      schema: { name: "string", city: "string" },
      deduplicate: ["name"],
    })
  );

  assert.deepEqual(result.records, [
    { name: "Oliver", city: "Salzburg" },
    { name: "Max", city: "Berlin" },
  ]);
});

test("deduplicate can compare multiple properties", async () => {
  const result = await service.convert(
    payload({
      input: "Oliver|Salzburg|34\nOliver|Salzburg|35\nOliver|Vienna|34",
      deduplicate: ["name", "city"],
    })
  );

  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records[0], { name: "Oliver", city: "Salzburg", age: 34 });
});

test("unsupported parser, output, schema type, and error strategy are rejected", () => {
  assert.throws(() => normalizeRequest(payload({ parser: { type: "javascript" } })), /Unsupported parser/);
  assert.throws(() => normalizeRequest(payload({ output: "html" })), /Unsupported output/);
  assert.throws(() => normalizeRequest(payload({ schema: { name: "function" } })), /Unsupported schema type/);
  assert.throws(() => normalizeRequest(payload({ errors: "ignore" })), /Unsupported error strategy/);
});

test("transform and derive properties cannot cross the HTTP boundary", () => {
  assert.throws(
    () => normalizeRequest(payload({ schema: { name: { type: "string", transform: "value => value" } } })),
    /Unsupported schema field.*transform/
  );
  assert.throws(
    () => normalizeRequest(payload({ schema: { name: { type: "string", derive: "row => row.name" } } })),
    /Unsupported schema field.*derive/
  );
  assert.throws(() => normalizeRequest(payload({ transform: "value => value" })), /Unsupported request property/);
});

test("invalid property names, table names, oversized input, and stale dedupe fields are rejected", () => {
  assert.throws(() => normalizeRequest(payload({ schema: { "bad name": "string" } })), /Schema property/);
  assert.throws(
    () => normalizeRequest(payload({ output: "sqlite", outputOptions: { table: "items; DROP TABLE users", createTable: true } })),
    /valid SQLite identifier/
  );
  assert.throws(() => normalizeRequest(payload({ input: "x".repeat(1024 * 1024 + 1) })), /input must not exceed/);
  assert.throws(() => normalizeRequest(payload({ deduplicate: ["missing"] })), /not present in the schema/);
  assert.throws(
    () => normalizeRequest(payload({ outputOptions: { table: "items" } })),
    /Unsupported json output option property/
  );
});

test("the production dynamic import is cached at module scope", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").resolve(__dirname, "../server/services/textToStructService.js"),
    "utf8"
  );

  assert.match(source, /let text2structPromise;/);
  assert.match(source, /text2structPromise = import\("text2struct"\)/);
  assert.match(source, /return text2structPromise;/);
});
