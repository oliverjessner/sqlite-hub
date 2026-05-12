const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const test = require("node:test");
const { ValidationError } = require("../server/utils/errors");
const {
  resolvePathInsideDirectory,
  resolveUserPath,
} = require("../server/utils/fileValidation");
const { MediaTaggingService } = require("../server/services/sqlite/mediaTaggingService");

function createTempDirectory(t) {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-security-"));
  t.after(() => fs.rmSync(directoryPath, { recursive: true, force: true }));
  return directoryPath;
}

test("resolveUserPath rejects parent traversal segments", () => {
  assert.throws(() => resolveUserPath("../outside.db"), ValidationError);
  assert.throws(() => resolveUserPath("~/../outside.db"), ValidationError);
  assert.throws(() => resolveUserPath("data/\0outside.db"), ValidationError);
});

test("resolvePathInsideDirectory resolves only paths under the supplied root", (t) => {
  const root = createTempDirectory(t);
  const insidePath = path.join(root, "media", "photo.jpg");

  assert.equal(
    resolvePathInsideDirectory(root, "media/photo.jpg", "Media file path"),
    insidePath
  );
  assert.equal(
    resolvePathInsideDirectory(root, insidePath, "Media file path"),
    insidePath
  );
  assert.throws(
    () =>
      resolvePathInsideDirectory(
        root,
        path.join(path.dirname(root), "secret.txt"),
        "Media file path"
      ),
    ValidationError
  );
  assert.throws(
    () => resolvePathInsideDirectory(root, "../secret.txt", "Media file path"),
    ValidationError
  );
});

test("media file resolution is scoped to the active database directory", (t) => {
  const root = createTempDirectory(t);
  const mediaDirectory = path.join(root, "media");
  const mediaPath = path.join(mediaDirectory, "photo.jpg");

  fs.mkdirSync(mediaDirectory, { recursive: true });
  fs.writeFileSync(mediaPath, "image");

  const service = new MediaTaggingService({
    connectionManager: {
      getActiveConnection: () => ({
        path: path.join(root, "database.sqlite"),
      }),
    },
    appStateStore: {},
  });

  assert.equal(service.resolveMediaFilePath("media/photo.jpg"), mediaPath);
  assert.equal(
    service.resolveMediaFilePath(pathToFileURL(mediaPath).toString()),
    mediaPath
  );
  assert.deepEqual(service.getMediaFileForRequest("media/photo.jpg"), {
    directory: mediaDirectory,
    fileName: "photo.jpg",
  });
  assert.throws(() => service.resolveMediaFilePath("../secret.jpg"), ValidationError);
  assert.throws(
    () => service.resolveMediaFilePath(path.join(path.dirname(root), "secret.jpg")),
    ValidationError
  );
});
