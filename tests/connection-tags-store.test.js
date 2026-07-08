const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { AppStateStore } = require("../server/services/storage/appStateStore");

function createStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-tags-"));
  const store = new AppStateStore(path.join(directory, "state.db"));

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return { directory, store };
}

function createConnection(directory, overrides = {}) {
  return {
    id: "conn_one",
    label: "One",
    path: path.join(directory, "one.db"),
    lastOpenedAt: "2026-06-21T10:00:00.000Z",
    lastModifiedAt: null,
    sizeBytes: 0,
    readOnly: false,
    logoPath: null,
    ...overrides,
  };
}

test("connection tags are created, deduplicated case-insensitively, and assigned", (t) => {
  const { directory, store } = createStore(t);

  store.upsertRecentConnection(createConnection(directory));

  const tags = store.setConnectionTags("conn_one", [
    " Research ",
    "research",
    "JOURNALISM",
  ]);

  assert.deepEqual(
    tags.map(tag => tag.name),
    ["JOURNALISM", "Research"]
  );
  assert.deepEqual(
    store.getRecentConnection("conn_one").tags.map(tag => tag.name),
    ["JOURNALISM", "Research"]
  );
  assert.deepEqual(
    store.listConnectionTags().map(tag => [tag.name, tag.connectionCount]),
    [
      ["JOURNALISM", 1],
      ["Research", 1],
    ]
  );
});

test("connection tag assignment removal and connection deletion clean relations", (t) => {
  const { directory, store } = createStore(t);

  store.upsertRecentConnection(createConnection(directory));
  store.setConnectionTags("conn_one", ["Research", "Client"]);

  const researchTag = store.getConnectionTagByName("research");
  const remainingTags = store.removeConnectionTag("conn_one", researchTag.id);

  assert.deepEqual(
    remainingTags.map(tag => tag.name),
    ["Client"]
  );

  store.removeRecentConnection("conn_one");

  assert.deepEqual(
    store.listConnectionTags().map(tag => [tag.name, tag.connectionCount]),
    [
      ["Client", 0],
      ["Research", 0],
    ]
  );
});

test("deleting a tag removes assignments without deleting connections", (t) => {
  const { directory, store } = createStore(t);

  store.upsertRecentConnection(createConnection(directory));
  store.setConnectionTags("conn_one", ["Research"]);

  const tag = store.getConnectionTagByName("RESEARCH");
  assert.equal(store.deleteConnectionTag(tag.id), true);

  const connection = store.getRecentConnection("conn_one");

  assert.equal(connection.id, "conn_one");
  assert.deepEqual(connection.tags, []);
  assert.deepEqual(store.listConnectionTags(), []);
});
