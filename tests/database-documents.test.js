const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");

const { AppStateStore } = require("../server/services/storage/appStateStore");
const { ensureDatabaseDocuments } = require("../server/routes/documents");

function createStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-documents-"));
  const store = new AppStateStore(path.join(directory, "state.db"));

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return store;
}

test("database documents are scoped to one database and normalize filenames", (t) => {
  const store = createStore(t);
  const first = store.createDatabaseDocument("db-one", {
    filename: "../Daily Notes",
    content: "# Tasks\n\n- [ ] item1",
  });
  const second = store.createDatabaseDocument("db-one", {
    filename: "Daily Notes.md",
    content: "second",
  });

  assert.equal(first.filename, "Daily Notes.md");
  assert.equal(second.filename, "Daily Notes 2.md");
  assert.equal(store.listDatabaseDocuments("db-one").length, 2);
  assert.equal(store.listDatabaseDocuments("db-two").length, 0);
  assert.throws(() => store.getDatabaseDocument("db-two", first.id), /Document was not found/);
});

test("database document updates preserve raw markdown content", (t) => {
  const store = createStore(t);
  const document = store.createDatabaseDocument("db-one", {
    filename: "todo",
    content: "- [ ] item1",
  });
  const updated = store.updateDatabaseDocument("db-one", document.id, {
    filename: "todo-renamed",
    content: "- [x] item1\n1717682400",
  });

  assert.equal(updated.filename, "todo-renamed.md");
  assert.equal(updated.content, "- [x] item1\n1717682400");

  const deleted = store.deleteDatabaseDocument("db-one", document.id);
  assert.deepEqual(deleted, { id: document.id, deleted: true });
  assert.equal(store.listDatabaseDocuments("db-one").length, 0);
});

test("document folder creates one initial document for an empty database namespace", (t) => {
  const store = createStore(t);
  const connectionManager = {
    getActiveConnection: () => ({
      id: "db-one",
      label: "trump.sqlite",
      path: "/tmp/trump.sqlite",
      createdAt: "2026-07-09T07:57:36.027Z",
    }),
  };

  const firstList = ensureDatabaseDocuments({
    appStateStore: store,
    connectionManager,
    databaseKey: "db-one",
  });
  const secondList = ensureDatabaseDocuments({
    appStateStore: store,
    connectionManager,
    databaseKey: "db-one",
  });
  const document = store.getDatabaseDocument("db-one", firstList[0].id);
  const contentLines = document.content.split("\n");
  const createdAt = contentLines[2]?.replace(/^- created at:\s+/, "");
  const lastModified = contentLines[3]?.replace(/^- last modified:\s+/, "");

  assert.equal(firstList.length, 1);
  assert.equal(secondList.length, 1);
  assert.equal(document.filename, "trump.sqlite.md");
  assert.equal(contentLines[0], "# trump.sqlite");
  assert.equal(contentLines[2], "- created at:    2026-07-09T07:57:36.027Z");
  assert.match(contentLines[3], /^- last modified: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.notEqual(createdAt, lastModified);
  assert.equal(contentLines[5], "## Purpose");
});

test("initial database document uses the latest activity log timestamp for last modified", (t) => {
  const store = createStore(t);
  const connectionManager = {
    getActiveConnection: () => ({
      id: "db-one",
      label: "activity.sqlite",
      path: "/tmp/activity.sqlite",
      createdAt: "2026-07-09T07:57:36.027Z",
    }),
  };

  store.recordQueryExecution({
    databaseKey: "db-one",
    rawSql: "SELECT * FROM customers",
    status: "success",
    executedAt: "2026-07-08T22:47:55.050Z",
    executedBy: "user",
  });

  const list = ensureDatabaseDocuments({
    appStateStore: store,
    connectionManager,
    databaseKey: "db-one",
  });
  const document = store.getDatabaseDocument("db-one", list[0].id);
  const contentLines = document.content.split("\n");

  assert.equal(contentLines[0], "# activity.sqlite");
  assert.equal(contentLines[2], "- created at:    2026-07-09T07:57:36.027Z");
  assert.equal(contentLines[3], "- last modified: 2026-07-08T22:47:55.050Z");
});

test("database document folders can group and ungroup documents", (t) => {
  const store = createStore(t);
  const folder = store.createDatabaseDocumentFolder("db-one", {
    name: "  Research  ",
  });
  const document = store.createDatabaseDocument("db-one", {
    filename: "notes",
    content: "# Notes",
    folderId: folder.id,
  });

  assert.equal(folder.name, "Research");
  assert.equal(document.folderId, folder.id);
  assert.deepEqual(
    store.listDatabaseDocumentFolders("db-one").map(item => item.name),
    ["Research"],
  );
  assert.equal(store.listDatabaseDocuments("db-one")[0].folderId, folder.id);

  const movedToRoot = store.updateDatabaseDocument("db-one", document.id, {
    folderId: null,
  });

  assert.equal(movedToRoot.folderId, null);
  assert.throws(
    () => store.createDatabaseDocumentFolder("db-one", { name: "research" }),
    /A folder with this name already exists/,
  );
  assert.throws(
    () => store.updateDatabaseDocument("db-one", document.id, { folderId: "missing-folder" }),
    /Document folder was not found/,
  );
});

test("database document folder schema migrates existing document tables", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-documents-migration-"));
  const databasePath = path.join(directory, "state.db");
  const legacyDb = new Database(databasePath);

  legacyDb.exec(`
    CREATE TABLE database_documents (
      id TEXT PRIMARY KEY,
      database_key TEXT NOT NULL,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(database_key, filename)
    );

    INSERT INTO database_documents (
      id,
      database_key,
      title,
      filename,
      content,
      created_at,
      updated_at
    )
    VALUES (
      'doc-one',
      'db-one',
      'Notes',
      'notes.md',
      '# Notes',
      '2026-07-09T08:00:00.000Z',
      '2026-07-09T08:00:00.000Z'
    );
  `);
  legacyDb.close();

  const store = new AppStateStore(databasePath);

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const columns = store.db
    .prepare("PRAGMA table_info(database_documents)")
    .all()
    .map(column => column.name);
  const index = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_database_documents_folder_updated'")
    .get();

  assert.ok(columns.includes("folder_id"));
  assert.equal(index.name, "idx_database_documents_folder_updated");
  assert.equal(store.getDatabaseDocument("db-one", "doc-one").folderId, null);
});
