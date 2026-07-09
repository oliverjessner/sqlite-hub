const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

async function importStore() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, "../frontend/js/store.js")).href;
  return import(`${moduleUrl}?document-last-modified-store=${Date.now()}`);
}

test("document magic snippets update metadata markers", async () => {
  const { updateDocumentMagicSnippets } = await importStore();
  const context = {
    document: {
      createdAt: "2026-07-09T10:00:00.000Z",
      updatedAt: "2026-07-09T11:00:00.000Z",
    },
    databaseCreatedAt: "2026-07-09T07:57:36.027Z",
    latestActivityLogTimestamp: "2026-07-09T12:34:56.789Z",
  };
  const content = [
    "# customer.sqlite",
    "",
    "- created at:",
    "- last modified:",
    "",
    "## Purpose",
    "",
  ].join("\n");
  const legacyContent = [
    "# customer.sqlite",
    "",
    "created at:",
    "last modified:",
    "",
    "## Purpose",
    "",
  ].join("\n");
  const contentWithoutMarker = "# Notes\n\nNo marker here.";

  assert.equal(
    updateDocumentMagicSnippets(content, context),
    [
      "# customer.sqlite",
      "",
      "- created at:    2026-07-09T07:57:36.027Z",
      "- last modified: 2026-07-09T12:34:56.789Z",
      "",
      "## Purpose",
      "",
    ].join("\n")
  );
  assert.equal(
    updateDocumentMagicSnippets(legacyContent, context),
    [
      "# customer.sqlite",
      "",
      "- created at:    2026-07-09T07:57:36.027Z",
      "- last modified: 2026-07-09T12:34:56.789Z",
      "",
      "## Purpose",
      "",
    ].join("\n")
  );
  assert.equal(updateDocumentMagicSnippets(contentWithoutMarker, context), contentWithoutMarker);
  assert.equal(updateDocumentMagicSnippets(content, {}), content);
});

test("document last modified helper extracts the latest activity log timestamp", async () => {
  const { getLatestActivityLogTimestampFromResponse } = await importStore();

  assert.equal(
    getLatestActivityLogTimestampFromResponse({
      data: {
        items: [
          {
            occurredAt: "2026-07-08T22:47:55.050Z",
          },
        ],
      },
    }),
    "2026-07-08T22:47:55.050Z",
  );
  assert.equal(getLatestActivityLogTimestampFromResponse({ data: { items: [] } }), null);
});

test("document magic snippets insert and replace database info", async () => {
  const { insertDocumentMagicSnippet, updateDocumentMagicSnippets, upsertDocumentMagicSnippet } = await importStore();
  const databaseInfo = [
    "## Database Info",
    "",
    "- Database Size: 24 KB",
    "- Estimated pages: 6",
    "- Tables: 6",
    "- Journal Mode: DELETE",
  ].join("\n");
  const updatedDatabaseInfo = [
    "## Database Info",
    "",
    "- Database Size: 48 KB",
    "- Estimated pages: 12",
    "- Tables: 8",
    "- Journal Mode: WAL",
  ].join("\n");
  const markedDatabaseInfo = [
    "<!-- sqlite-hub:magic database-info -->",
    databaseInfo,
    "<!-- /sqlite-hub:magic database-info -->",
  ].join("\n");
  const markedUpdatedDatabaseInfo = [
    "<!-- sqlite-hub:magic database-info -->",
    updatedDatabaseInfo,
    "<!-- /sqlite-hub:magic database-info -->",
  ].join("\n");
  const overview = {
    file: {
      sizeBytes: 24 * 1024,
    },
    sqlite: {
      pageCount: 6,
      journalMode: "delete",
    },
    counts: {
      tables: 6,
    },
  };

  assert.equal(
    upsertDocumentMagicSnippet(
      "# Notes\n",
      "database-info",
      { databaseInfoMarkdown: databaseInfo },
    ),
    `# Notes\n\n${markedDatabaseInfo}`,
  );
  assert.equal(
    upsertDocumentMagicSnippet(
      `# Notes\n\n${databaseInfo}\n\n## Purpose\n`,
      "database-info",
      { databaseInfoMarkdown: updatedDatabaseInfo },
    ),
    `# Notes\n\n${markedUpdatedDatabaseInfo}\n\n## Purpose\n`,
  );
  assert.equal(
    updateDocumentMagicSnippets(`# Notes\n\n${databaseInfo}`, { overview }),
    [
      "# Notes",
      "",
      "<!-- sqlite-hub:magic database-info -->",
      "## Database Info",
      "",
      "- Database Size: 24 KB",
      "- Estimated pages: 6",
      "- Tables: 6",
      "- Journal Mode: DELETE",
      "<!-- /sqlite-hub:magic database-info -->",
    ].join("\n"),
  );
  assert.deepEqual(
    insertDocumentMagicSnippet(
      `# Notes\n\n${databaseInfo}`,
      "database-info",
      { databaseInfoMarkdown: updatedDatabaseInfo },
    ),
    {
      alreadyInserted: true,
      content: `# Notes\n\n${databaseInfo}`,
      inserted: false,
    },
  );
});

test("document magic snippets insert time metadata only when missing", async () => {
  const { insertDocumentMagicSnippet } = await importStore();
  const context = {
    document: {
      createdAt: "2026-07-08T22:33:36.817Z",
      updatedAt: "2026-07-08T22:40:00.000Z",
    },
    databaseCreatedAt: "2026-07-08T20:12:10.000Z",
    latestActivityLogTimestamp: "2026-07-08T22:49:58.019Z",
  };
  const metadata = [
    "- created at:    2026-07-08T20:12:10.000Z",
    "- last modified: 2026-07-08T22:49:58.019Z",
  ].join("\n");

  assert.deepEqual(
    insertDocumentMagicSnippet("# Notes\n", "document-metadata", context),
    {
      alreadyInserted: false,
      content: `# Notes\n\n${metadata}`,
      inserted: true,
    },
  );
  assert.deepEqual(
    insertDocumentMagicSnippet("# Notes\n\n## Purpose", "document-metadata", context, {
      start: "# Notes".length,
      end: "# Notes".length,
    }),
    {
      alreadyInserted: false,
      content: `# Notes\n\n${metadata}\n\n## Purpose`,
      inserted: true,
    },
  );
  assert.deepEqual(
    insertDocumentMagicSnippet(`# Notes\n\n${metadata}`, "document-metadata", context),
    {
      alreadyInserted: true,
      content: `# Notes\n\n${metadata}`,
      inserted: false,
    },
  );
});

test("saved queries markdown renders a plain insert list", async () => {
  const { buildSavedQueriesMarkdown } = await importStore();

  assert.equal(
    buildSavedQueriesMarkdown([
      {
        displayTitle: "a",
      },
      {
        title: "b",
      },
    ]),
    ["## Saved Queries", "", "- a", "- b"].join("\n"),
  );
  assert.equal(buildSavedQueriesMarkdown([]), "");
});

test("table definition magic snippet renders schema sql and sample data", async () => {
  const {
    buildTableDefinitionMagicSnippet,
    getDocumentTableDefinitionMagicSnippets,
    hasDocumentTableDefinitionMagicSnippet,
    updateDocumentMagicSnippets,
  } = await importStore();
  const table = {
    name: "users",
    ddl: [
      "CREATE TABLE users (",
      "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
      "  name TEXT NOT NULL,",
      "  email TEXT UNIQUE,",
      "  role_id INTEGER NOT NULL REFERENCES roles(id),",
      "  status TEXT CHECK (status IN ('active', 'disabled')),",
      "  bio TEXT,",
      "  avatar BLOB",
      ")",
    ].join("\n"),
    columns: [
      { name: "id", declaredType: "INTEGER", affinity: "INTEGER", primaryKeyPosition: 1, notNull: false, visible: true },
      { name: "name", declaredType: "TEXT", affinity: "TEXT", primaryKeyPosition: 0, notNull: true, visible: true },
      { name: "email", declaredType: "TEXT", affinity: "TEXT", primaryKeyPosition: 0, notNull: false, visible: true },
      { name: "role_id", declaredType: "INTEGER", affinity: "INTEGER", primaryKeyPosition: 0, notNull: true, visible: true },
      { name: "status", declaredType: "TEXT", affinity: "TEXT", primaryKeyPosition: 0, notNull: false, visible: true },
      { name: "bio", declaredType: "TEXT", affinity: "TEXT", primaryKeyPosition: 0, notNull: false, visible: true },
      { name: "avatar", declaredType: "BLOB", affinity: "BLOB", primaryKeyPosition: 0, notNull: false, visible: true },
      { name: "rank", declaredType: "", affinity: "BLOB", primaryKeyPosition: 0, notNull: false, visible: false },
    ],
    checkConstraints: [{ expression: "status IN ('active', 'disabled')" }],
    foreignKeys: [
      {
        referencedTable: "roles",
        mappings: [{ from: "role_id", to: "id" }],
      },
    ],
    indexes: [
      {
        unique: true,
        columns: [{ name: "email" }],
      },
    ],
  };
  const sampleData = {
    limit: 5,
    columns: ["id", "name", "email", "role_id", "bio", "avatar"],
    rows: [
      {
        id: 1,
        name: "Alice | Admin",
        email: "alice@example.test",
        role_id: 2,
        bio: [
          "This is a very long text value that should be truncated before it can break the document table output.",
          "It keeps going with more details that are not useful inside an inline Markdown sample cell.",
        ].join(" "),
        avatar: { __type: "blob", sizeBytes: 25400 },
      },
      {
        id: 2,
        name: "Bob",
        email: null,
        role_id: 2,
        bio: "Line one\nLine two",
        avatar: null,
      },
    ],
  };
  const snippet = buildTableDefinitionMagicSnippet({
    tableName: "users",
    markdownTable: true,
    sqlDefinition: true,
    sampleData: true,
    sampleRowCount: 5,
    table,
    sampleData,
  });
  const parsed = getDocumentTableDefinitionMagicSnippets(snippet);
  const replacement = buildTableDefinitionMagicSnippet({
    tableName: "users",
    markdownTable: true,
    sqlDefinition: false,
    sampleData: false,
    sampleRowCount: 5,
    table: {
      ...table,
      columns: [
        ...table.columns,
        { name: "created_at", declaredType: "TEXT", affinity: "TEXT", primaryKeyPosition: 0, notNull: false, visible: true },
      ],
    },
  });

  assert.match(snippet, /sqlite-hub:magic table-definition/);
  assert.match(snippet, /## Definition: users/);
  assert.match(snippet, /\| id \| INTEGER \| PRIMARY KEY, AUTOINCREMENT \|/);
  assert.match(snippet, /\| email \| TEXT \| UNIQUE \|/);
  assert.match(snippet, /\| role_id \| INTEGER \| NOT NULL, REFERENCES roles\(id\) \|/);
  assert.match(snippet, /\| status \| TEXT \| CHECK \(status IN \('active', 'disabled'\)\) \|/);
  assert.match(snippet, /```sql\nCREATE TABLE users/);
  assert.match(snippet, /\| 1 \| Alice \\\| Admin \| alice@example\.test \| 2 \|/);
  assert.match(snippet, /It keeps going\.\.\./);
  assert.match(snippet, /\[BLOB - 25 KB\]/);
  assert.match(snippet, /NULL/);
  assert.doesNotMatch(snippet, /rank/);
  assert.equal(hasDocumentTableDefinitionMagicSnippet(snippet, "users"), true);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].options.tableName, "users");
  assert.match(
    updateDocumentMagicSnippets(snippet, {
      tableDefinitionSnippets: new Map([[parsed[0].key, { markdown: replacement }]]),
    }),
    /created_at/,
  );
});
