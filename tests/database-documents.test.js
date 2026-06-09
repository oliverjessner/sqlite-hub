const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

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

  assert.equal(firstList.length, 1);
  assert.equal(secondList.length, 1);
  assert.equal(document.filename, "trump.sqlite.md");
  assert.equal(document.content, "# trump.sqlite\n");
});
