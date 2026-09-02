const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createBackupsRouter } = require("../server/routes/backups");
const { errorMiddleware } = require("../server/utils/errors");

test("backup downloads resolve filenames only inside the validated directory", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-backup-download-"));
  const downloadDirectory = path.join(root, "backups");
  const backupPath = path.join(downloadDirectory, "backup.sqlite");
  const outsidePath = path.join(root, "outside.sqlite");

  fs.mkdirSync(downloadDirectory);
  fs.writeFileSync(backupPath, "safe backup");
  fs.writeFileSync(outsidePath, "outside file");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const app = express();
  app.use(
    "/api/backups",
    createBackupsRouter({
      backupService: {
        getDownloadInfo(backupId) {
          return {
            directory: downloadDirectory,
            fileName: backupId === "safe" ? "backup.sqlite" : "../outside.sqlite",
            filename: "download.sqlite",
          };
        },
      },
    })
  );
  app.use(errorMiddleware);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  );

  const { port } = server.address();
  const safeResponse = await fetch(`http://127.0.0.1:${port}/api/backups/safe/download`);
  const escapedResponse = await fetch(
    `http://127.0.0.1:${port}/api/backups/escaped/download`
  );

  assert.equal(safeResponse.status, 200);
  assert.equal(await safeResponse.text(), "safe backup");
  assert.notEqual(escapedResponse.status, 200);
  assert.notEqual(await escapedResponse.text(), "outside file");
});
