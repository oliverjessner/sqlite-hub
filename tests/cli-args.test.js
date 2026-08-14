const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getHelpText,
  normalizeExportFormat,
  parseCliArguments,
} = require("../bin/sqlite-hub");

function command(argv) {
  const parsed = parseCliArguments(argv);
  return {
    resource: parsed.resource,
    action: parsed.action,
    arguments: parsed.arguments,
    options: parsed.options,
  };
}

test("starts the server implicitly and explicitly", () => {
  assert.deepEqual(command([]), {
    resource: "serve",
    action: null,
    arguments: [],
    options: { port: 4173, open: false },
  });
  assert.deepEqual(command(["serve", "--port", "4174", "--open"]), {
    resource: "serve",
    action: null,
    arguments: [],
    options: { port: 4174, open: true },
  });
  assert.equal(parseCliArguments([]).implicit, true);
});

test("parses app info and global flags", () => {
  assert.deepEqual(command(["info", "--port=4175"]), {
    resource: "info",
    action: null,
    arguments: [],
    options: { port: 4175 },
  });
  assert.deepEqual(parseCliArguments(["--help"]), { help: true, helpPath: [] });
  assert.deepEqual(parseCliArguments(["-v"]), { version: true });
});

test("parses database commands", () => {
  assert.deepEqual(command(["db", "list", "--json"]), {
    resource: "db",
    action: "list",
    arguments: [],
    options: { json: true },
  });
  assert.deepEqual(command(["db", "info", "Unit-00"]), {
    resource: "db",
    action: "info",
    arguments: ["Unit-00"],
    options: {},
  });
});

test("parses table and row commands", () => {
  assert.deepEqual(command(["table", "list", "--db", "Unit-00", "--json"]), {
    resource: "table",
    action: "list",
    arguments: [],
    options: { db: "Unit-00", json: true },
  });
  assert.deepEqual(command(["table", "info", "users", "--db=Unit-00"]), {
    resource: "table",
    action: "info",
    arguments: ["users"],
    options: { db: "Unit-00" },
  });
  assert.deepEqual(command(["row", "get", "companies", "abc-123", "--db", "Unit-00"]), {
    resource: "row",
    action: "get",
    arguments: ["companies", "abc-123"],
    options: { db: "Unit-00" },
  });
});

test("parses all query commands", () => {
  assert.deepEqual(command(["query", "list", "--db", "Unit-00"]), {
    resource: "query",
    action: "list",
    arguments: [],
    options: { db: "Unit-00" },
  });
  assert.deepEqual(command(["query", "show", "Stock Winners", "--db", "Unit-00", "--json"]), {
    resource: "query",
    action: "show",
    arguments: ["Stock Winners"],
    options: { db: "Unit-00", json: true },
  });
  assert.deepEqual(command([
    "query", "run", "SELECT 1", "--db", "Unit-00", "--save", "One", "--json",
  ]), {
    resource: "query",
    action: "run",
    arguments: ["SELECT 1"],
    options: { db: "Unit-00", save: "One", json: true },
  });
  assert.deepEqual(command(["query", "exec", "One", "--db", "Unit-00"]), {
    resource: "query",
    action: "exec",
    arguments: ["One"],
    options: { db: "Unit-00" },
  });
  assert.deepEqual(command([
    "query", "save", "SELECT 1", "--db", "Unit-00", "--name", "One", "--notes", "Smoke",
  ]), {
    resource: "query",
    action: "save",
    arguments: ["SELECT 1"],
    options: { db: "Unit-00", name: "One", notes: "Smoke" },
  });
  assert.deepEqual(command([
    "query", "export", "One", "--db", "Unit-00", "--format=json", "--output", "one.json",
  ]), {
    resource: "query",
    action: "export",
    arguments: ["One"],
    options: { db: "Unit-00", format: "json", output: "one.json" },
  });
});

test("parses document commands", () => {
  assert.deepEqual(command(["doc", "list", "--db", "Unit-00", "--json"]), {
    resource: "doc",
    action: "list",
    arguments: [],
    options: { db: "Unit-00", json: true },
  });
  assert.deepEqual(command(["doc", "show", "Research Notes", "--db", "Unit-00"]), {
    resource: "doc",
    action: "show",
    arguments: ["Research Notes"],
    options: { db: "Unit-00" },
  });
  assert.deepEqual(command([
    "doc", "export", "Research Notes", "--db", "Unit-00", "--output", "notes.md",
  ]), {
    resource: "doc",
    action: "export",
    arguments: ["Research Notes"],
    options: { db: "Unit-00", output: "notes.md" },
  });
});

test("parses backup commands", () => {
  assert.deepEqual(command(["backup", "list", "--db", "Unit-00", "--json"]), {
    resource: "backup",
    action: "list",
    arguments: [],
    options: { db: "Unit-00", json: true },
  });
  assert.deepEqual(command([
    "backup", "create", "--db", "Unit-00", "--name", "Before import", "--notes", "Safe point",
  ]), {
    resource: "backup",
    action: "create",
    arguments: [],
    options: { db: "Unit-00", name: "Before import", notes: "Safe point" },
  });
});

test("parses type generation and all retained options", () => {
  assert.deepEqual(command([
    "types", "generate", "users",
    "--db", "Unit-00",
    "--lang", "ts",
    "--name", "User",
    "--naming", "camel",
    "--nullable", "optional",
    "--comments",
    "--defaults-as-comments",
    "--json-type", "record",
    "--include-generated",
    "--include-hidden",
    "--output", "User.ts",
    "--force",
  ]), {
    resource: "types",
    action: "generate",
    arguments: ["users"],
    options: {
      db: "Unit-00",
      lang: "ts",
      name: "User",
      naming: "camel",
      nullable: "optional",
      comments: true,
      defaultsAsComments: true,
      jsonType: "record",
      includeGenerated: true,
      includeHidden: true,
      output: "User.ts",
      force: true,
    },
  });
});

test("provides resource and action help", () => {
  assert.deepEqual(parseCliArguments(["query", "--help"]), {
    help: true,
    helpPath: ["query"],
  });
  assert.deepEqual(parseCliArguments(["query", "run", "--help"]), {
    help: true,
    helpPath: ["query", "run"],
  });
  assert.match(getHelpText(["backup", "create"]), /backup create --db/);
});

test("rejects invalid commands, arguments, and options with usage", () => {
  assert.throws(() => parseCliArguments(["frobnicate"]), /Unknown command: frobnicate[\s\S]*Usage:/);
  assert.throws(() => parseCliArguments(["query", "delete"]), /Unknown query action: delete[\s\S]*Usage:/);
  assert.throws(() => parseCliArguments(["db", "info"]), /Missing argument for db info[\s\S]*Usage:/);
  assert.throws(() => parseCliArguments(["table", "list"]), /table list requires --db[\s\S]*Usage:/);
  assert.throws(() => parseCliArguments(["query", "save", "SELECT 1", "--db", "db"]), /requires --name/);
  assert.throws(() => parseCliArguments(["serve", "--json"]), /Unknown option for serve: --json/);
});

test("rejects colon options and discarded flag entry points", () => {
  assert.throws(
    () => parseCliArguments(["table", "list", "--db:Unit-00"]),
    /Unknown option for table list: --db:Unit-00/
  );
  assert.throws(() => parseCliArguments(["--database", "Unit-00"]), /Unknown command: --database/);
});

test("validates ports, export formats, and type languages", () => {
  assert.equal(normalizeExportFormat("TSV"), "tsv");
  assert.throws(() => parseCliArguments(["serve", "--port", "0"]), /Invalid port/);
  assert.throws(
    () => parseCliArguments(["query", "export", "One", "--db", "db", "--format", "xlsx"]),
    /Unsupported export format/
  );
  assert.throws(
    () => parseCliArguments(["types", "generate", "users", "--db", "db", "--lang", "python"]),
    /Unsupported language/
  );
});

test("does not combine type JSON output with file output", () => {
  assert.throws(
    () => parseCliArguments([
      "types", "generate", "users", "--db", "db", "--lang", "ts", "--json", "--output", "User.ts",
    ]),
    /--json cannot be combined with --output/
  );
});
