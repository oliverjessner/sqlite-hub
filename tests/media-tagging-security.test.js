const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const test = require("node:test");
const { MediaTaggingService } = require("../server/services/sqlite/mediaTaggingService");
const { getTableDetail } = require("../server/services/sqlite/introspection");
const { ValidationError } = require("../server/utils/errors");
const { quoteIdentifier } = require("../server/utils/identifier");

function createService(db) {
  return new MediaTaggingService({
    connectionManager: {
      getActiveConnection: () => ({
        id: "media-db",
        label: "Media",
        path: "/tmp/media.sqlite",
        readOnly: false,
      }),
      getActiveDatabase: () => db,
    },
    appStateStore: {
      getMediaTaggingConfig: () => null,
    },
  });
}

test("media tagging custom queries remain read-only and preserve workflow behavior", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE media_assets (
        id INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL,
        is_tagged INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE media_tags (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        isParentTag INTEGER NOT NULL DEFAULT 0,
        parentTagId INTEGER REFERENCES media_tags(id) ON DELETE SET NULL
      );
      CREATE TABLE media_asset_tags (
        media_asset_id INTEGER NOT NULL,
        media_tag_id INTEGER NOT NULL,
        PRIMARY KEY (media_asset_id, media_tag_id),
        FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE,
        FOREIGN KEY (media_tag_id) REFERENCES media_tags(id) ON DELETE CASCADE
      );
      INSERT INTO media_assets (id, file_path, is_tagged) VALUES
        (1, 'first.jpg', 0),
        (2, 'second.jpg', 1);
    `);

    const service = createService(db);
    const config = {
      mediaTable: "media_assets",
      pathColumn: "file_path",
      taggedColumn: "is_tagged",
      untaggedQuery:
        "SELECT id, file_path, is_tagged FROM media_assets WHERE is_tagged = 0",
      taggedQuery:
        "SELECT id, file_path, is_tagged FROM media_assets WHERE is_tagged = 1",
    };
    const state = service.getViewState({
      config,
    });

    const injectedState = service.getViewState({
      config: {
        ...config,
        untaggedQuery:
          "SELECT id, file_path, is_tagged FROM media_assets) AS injected; DROP TABLE media_assets; --",
      },
    });

    assert.equal(state.workflow.status.taggedCount, 1);
    assert.equal(state.workflow.status.remainingCount, 1);
    assert.equal(state.workflow.status.totalCount, 2);
    assert.equal(state.workflow.currentItem.row.id, 1);
    assert.ok(
      injectedState.issues.some((issue) => issue.code === "UNTAGGED_QUERY_INVALID")
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM media_assets").get().count, 2);
  } finally {
    db.close();
  }
});

test("media tagging updates use schema-resolved identifiers", () => {
  const db = new Database(":memory:");
  const primaryKeyTable = 'media" primary';
  const rowIdTable = 'media" rowid';
  const taggedColumn = 'is" tagged';

  try {
    db.exec(
      [
        `CREATE TABLE ${quoteIdentifier(primaryKeyTable)} (id INTEGER PRIMARY KEY, ${quoteIdentifier(taggedColumn)} INTEGER)`,
        `INSERT INTO ${quoteIdentifier(primaryKeyTable)} VALUES (1, 0)`,
        `CREATE TABLE ${quoteIdentifier(rowIdTable)} (path TEXT, ${quoteIdentifier(taggedColumn)} INTEGER)`,
        `INSERT INTO ${quoteIdentifier(rowIdTable)} VALUES ('asset.jpg', 0)`,
      ].join("; ")
    );

    const service = createService(db);
    const primaryKeyDetail = getTableDetail(db, primaryKeyTable, { includeRowCount: false });
    const rowIdDetail = getTableDetail(db, rowIdTable, { includeRowCount: false });

    service.markMediaRowTagged(db, primaryKeyDetail, taggedColumn, { id: 1 });
    service.markMediaRowTagged(db, rowIdDetail, taggedColumn, {
      __sqlite_hub_media_rowid: 1,
    });

    assert.equal(
      db.prepare(
        `SELECT ${quoteIdentifier(taggedColumn)} AS tagged FROM ${quoteIdentifier(primaryKeyTable)}`
      ).get().tagged,
      1
    );
    assert.equal(
      db.prepare(
        `SELECT ${quoteIdentifier(taggedColumn)} AS tagged FROM ${quoteIdentifier(rowIdTable)}`
      ).get().tagged,
      1
    );
    assert.throws(
      () =>
        service.markMediaRowTagged(
          db,
          primaryKeyDetail,
          `${taggedColumn}" = 1; DROP TABLE ${primaryKeyTable}; --`,
          { id: 1 }
        ),
      (error) => error instanceof ValidationError
    );
    assert.ok(
      db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(
        primaryKeyTable
      )
    );
  } finally {
    db.close();
  }
});
