const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");
const {
  NativeFileDialogService,
  buildDirectoryDialogAttempts,
  buildDialogAttempts,
  buildOpenDialogAttempts,
  normalizeOpenedDatabasePath,
  normalizeSelectedDatabasePath,
} = require("../server/services/nativeFileDialogService");
const { ValidationError } = require("../server/utils/errors");

test("native database dialog normalizes paths and adds a default extension", () => {
  assert.equal(normalizeSelectedDatabasePath("/tmp/customer-data"), "/tmp/customer-data.sqlite");
  assert.equal(normalizeSelectedDatabasePath("/tmp/customer-data.db\n"), "/tmp/customer-data.db");
  assert.equal(normalizeSelectedDatabasePath(""), null);
});

test("native database dialog builds platform-specific save commands", () => {
  const macAttempt = buildDialogAttempts({ platform: "darwin", homeDirectory: "/Users/test" })[0];
  const windowsAttempt = buildDialogAttempts({ platform: "win32", homeDirectory: "C:\\Users\\test" })[0];
  const linuxAttempts = buildDialogAttempts({ platform: "linux", homeDirectory: "/home/test" });

  assert.equal(macAttempt.command, "osascript");
  assert.match(macAttempt.args.join(" "), /choose file name/);
  assert.equal(windowsAttempt.command, "powershell.exe");
  assert.match(windowsAttempt.args.at(-1), /SaveFileDialog/);
  assert.deepEqual(linuxAttempts.map((attempt) => attempt.command), ["zenity", "kdialog"]);
});

test("native database dialog builds platform-specific open commands", () => {
  const macAttempt = buildOpenDialogAttempts({ platform: "darwin", homeDirectory: "/Users/test" })[0];
  const windowsAttempt = buildOpenDialogAttempts({ platform: "win32", homeDirectory: "C:\\Users\\test" })[0];
  const linuxAttempts = buildOpenDialogAttempts({ platform: "linux", homeDirectory: "/home/test" });

  assert.match(macAttempt.args.join(" "), /choose file with prompt/);
  assert.match(windowsAttempt.args.at(-1), /OpenFileDialog/);
  assert.deepEqual(linuxAttempts.map((attempt) => attempt.command), ["zenity", "kdialog"]);
});

test("native directory dialog builds platform-specific folder pickers", () => {
  const macAttempt = buildDirectoryDialogAttempts({ platform: "darwin", homeDirectory: "/Users/test" })[0];
  const windowsAttempt = buildDirectoryDialogAttempts({ platform: "win32", homeDirectory: "C:\\Users\\test" })[0];
  const linuxAttempts = buildDirectoryDialogAttempts({ platform: "linux", homeDirectory: "/home/test" });

  assert.match(macAttempt.args.join(" "), /choose folder/);
  assert.match(windowsAttempt.args.at(-1), /FolderBrowserDialog/);
  assert.deepEqual(linuxAttempts.map((attempt) => attempt.command), ["zenity", "kdialog"]);
});

test("open database dialog preserves the selected filename", () => {
  assert.equal(normalizeOpenedDatabasePath("/tmp/catalog\n"), "/tmp/catalog");
  assert.equal(normalizeOpenedDatabasePath(""), null);
});

test("native database dialog returns null when the user cancels", async () => {
  const service = new NativeFileDialogService({
    platform: "darwin",
    homeDirectory: "/Users/test",
    executeFile: async () => {
      const error = new Error("User canceled.");
      error.code = 1;
      throw error;
    },
  });

  assert.equal(await service.chooseCreateDatabasePath(), null);
});

test("native database dialog does not hide macOS script failures as cancellations", async () => {
  const service = new NativeFileDialogService({
    platform: "darwin",
    homeDirectory: "/Users/test",
    executeFile: async () => {
      const error = new Error("AppleScript syntax error");
      error.code = 1;
      throw error;
    },
  });

  await assert.rejects(service.chooseCreateDatabasePath(), (error) => {
    assert.equal(error.code, "NATIVE_FILE_DIALOG_FAILED");
    return true;
  });
});

test("native database dialog falls back from zenity to kdialog", async () => {
  const commands = [];
  const service = new NativeFileDialogService({
    platform: "linux",
    homeDirectory: "/home/test",
    executeFile: async (command) => {
      commands.push(command);

      if (command === "zenity") {
        const error = new Error("not found");
        error.code = "ENOENT";
        throw error;
      }

      return { stdout: "/home/test/catalog.sqlite3\n" };
    },
  });

  assert.equal(await service.chooseCreateDatabasePath(), "/home/test/catalog.sqlite3");
  assert.deepEqual(commands, ["zenity", "kdialog"]);
});

test("native open database dialog returns the selected existing path", async () => {
  const service = new NativeFileDialogService({
    platform: "linux",
    homeDirectory: "/home/test",
    executeFile: async () => ({ stdout: "/home/test/catalog.db\n" }),
  });

  assert.equal(await service.chooseOpenDatabasePath(), "/home/test/catalog.db");
});

test("native directory picker returns the selected folder", async () => {
  const service = new NativeFileDialogService({
    platform: "darwin",
    homeDirectory: "/Users/test",
    executeFile: async () => ({ stdout: "/Users/test/Library/Application Support\n" }),
  });

  assert.equal(await service.chooseDirectoryPath(), "/Users/test/Library/Application Support");
});

test("native reveal validates and canonicalizes SQLite database paths", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-reveal-"));
  const nestedDirectory = path.join(root, "nested");
  const databasePath = path.join(root, "catalog.sqlite");
  const db = new Database(databasePath);
  const calls = [];

  db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY)");
  db.close();
  fs.mkdirSync(nestedDirectory);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const service = new NativeFileDialogService({
    platform: "linux",
    executeFile: async (command, args) => {
      calls.push({ command, args });
    },
  });

  assert.equal(await service.revealPath(databasePath), fs.realpathSync.native(databasePath));
  assert.deepEqual(calls, [
    {
      command: "xdg-open",
      args: [path.dirname(fs.realpathSync.native(databasePath))],
    },
  ]);
  await assert.rejects(
    service.revealPath(`${nestedDirectory}${path.sep}..${path.sep}catalog.sqlite`),
    ValidationError
  );
  assert.equal(calls.length, 1);
});
