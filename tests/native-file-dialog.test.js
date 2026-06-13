const assert = require("node:assert/strict");
const test = require("node:test");
const {
  NativeFileDialogService,
  buildDialogAttempts,
  normalizeSelectedDatabasePath,
} = require("../server/services/nativeFileDialogService");

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
