const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { AppError } = require("../utils/errors");

const execFileAsync = promisify(execFile);
const DEFAULT_DATABASE_FILENAME = "new-database.sqlite";

function escapePowerShellSingleQuotedString(value) {
  return String(value).replaceAll("'", "''");
}

function buildDialogAttempts({ platform = process.platform, homeDirectory = os.homedir() } = {}) {
  const defaultPath = path.join(homeDirectory, DEFAULT_DATABASE_FILENAME);

  if (platform === "darwin") {
    return [
      {
        command: "osascript",
        args: [
          "-e",
          "on run argv",
          "-e",
          'set selectedFile to choose file name with prompt "Create SQLite Database" default location POSIX file (item 1 of argv) default name (item 2 of argv)',
          "-e",
          "return POSIX path of selectedFile",
          "-e",
          "end run",
          homeDirectory,
          DEFAULT_DATABASE_FILENAME,
        ],
        cancelledExitCodes: new Set([1]),
        cancelledErrorPattern: /user canceled|-128/i,
      },
    ];
  }

  if (platform === "win32") {
    const initialDirectory = escapePowerShellSingleQuotedString(homeDirectory);
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.SaveFileDialog",
      "$dialog.Title = 'Create SQLite Database'",
      "$dialog.Filter = 'SQLite databases (*.db;*.sqlite;*.sqlite3)|*.db;*.sqlite;*.sqlite3|All files (*.*)|*.*'",
      "$dialog.DefaultExt = 'sqlite'",
      "$dialog.AddExtension = $true",
      `$dialog.InitialDirectory = '${initialDirectory}'`,
      `$dialog.FileName = '${DEFAULT_DATABASE_FILENAME}'`,
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
      "  [Console]::Out.Write($dialog.FileName)",
      "} else {",
      "  exit 2",
      "}",
    ].join("; ");

    return [
      {
        command: "powershell.exe",
        args: ["-NoProfile", "-STA", "-Command", script],
        cancelledExitCodes: new Set([2]),
      },
    ];
  }

  return [
    {
      command: "zenity",
      args: [
        "--file-selection",
        "--save",
        "--title=Create SQLite Database",
        `--filename=${defaultPath}`,
        "--file-filter=SQLite databases | *.db *.sqlite *.sqlite3",
        "--file-filter=All files | *",
      ],
      cancelledExitCodes: new Set([1]),
    },
    {
      command: "kdialog",
      args: [
        "--getsavefilename",
        defaultPath,
        "SQLite databases (*.db *.sqlite *.sqlite3)",
        "--title",
        "Create SQLite Database",
      ],
      cancelledExitCodes: new Set([1]),
    },
  ];
}

function buildOpenDialogAttempts({ platform = process.platform, homeDirectory = os.homedir() } = {}) {
  if (platform === "darwin") {
    return [
      {
        command: "osascript",
        args: [
          "-e",
          "on run argv",
          "-e",
          'set selectedFile to choose file with prompt "Open SQLite Database" default location POSIX file (item 1 of argv)',
          "-e",
          "return POSIX path of selectedFile",
          "-e",
          "end run",
          homeDirectory,
        ],
        cancelledExitCodes: new Set([1]),
        cancelledErrorPattern: /user canceled|-128/i,
      },
    ];
  }

  if (platform === "win32") {
    const initialDirectory = escapePowerShellSingleQuotedString(homeDirectory);
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
      "$dialog.Title = 'Open SQLite Database'",
      "$dialog.Filter = 'SQLite databases (*.db;*.sqlite;*.sqlite3)|*.db;*.sqlite;*.sqlite3|All files (*.*)|*.*'",
      "$dialog.CheckFileExists = $true",
      `$dialog.InitialDirectory = '${initialDirectory}'`,
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
      "  [Console]::Out.Write($dialog.FileName)",
      "} else {",
      "  exit 2",
      "}",
    ].join("; ");

    return [
      {
        command: "powershell.exe",
        args: ["-NoProfile", "-STA", "-Command", script],
        cancelledExitCodes: new Set([2]),
      },
    ];
  }

  return [
    {
      command: "zenity",
      args: [
        "--file-selection",
        "--title=Open SQLite Database",
        `--filename=${homeDirectory}${path.sep}`,
        "--file-filter=SQLite databases | *.db *.sqlite *.sqlite3",
        "--file-filter=All files | *",
      ],
      cancelledExitCodes: new Set([1]),
    },
    {
      command: "kdialog",
      args: [
        "--getopenfilename",
        homeDirectory,
        "SQLite databases (*.db *.sqlite *.sqlite3);;All files (*)",
        "--title",
        "Open SQLite Database",
      ],
      cancelledExitCodes: new Set([1]),
    },
  ];
}

function normalizeSelectedDatabasePath(value) {
  const selectedPath = String(value ?? "").trim();

  if (!selectedPath) {
    return null;
  }

  return path.extname(selectedPath) ? selectedPath : `${selectedPath}.sqlite`;
}

function normalizeOpenedDatabasePath(value) {
  return String(value ?? "").trim() || null;
}

function isMissingDialogCommand(error) {
  return error?.code === "ENOENT";
}

function isCancelledDialog(error, attempt) {
  if (!attempt.cancelledExitCodes.has(Number(error?.code))) {
    return false;
  }

  if (!attempt.cancelledErrorPattern) {
    return true;
  }

  return attempt.cancelledErrorPattern.test(`${error?.message ?? ""}\n${error?.stderr ?? ""}`);
}

class NativeFileDialogService {
  constructor(options = {}) {
    this.platform = options.platform ?? process.platform;
    this.homeDirectory = options.homeDirectory ?? os.homedir();
    this.executeFile = options.executeFile ?? execFileAsync;
  }

  async chooseCreateDatabasePath() {
    const attempts = buildDialogAttempts({
      platform: this.platform,
      homeDirectory: this.homeDirectory,
    });

    return this.runDialogAttempts(attempts, normalizeSelectedDatabasePath);
  }

  async chooseOpenDatabasePath() {
    const attempts = buildOpenDialogAttempts({
      platform: this.platform,
      homeDirectory: this.homeDirectory,
    });

    return this.runDialogAttempts(attempts, normalizeOpenedDatabasePath);
  }

  async runDialogAttempts(attempts, normalizePath) {
    for (const attempt of attempts) {
      try {
        const result = await this.executeFile(attempt.command, attempt.args, {
          maxBuffer: 64 * 1024,
          windowsHide: true,
        });

        return normalizePath(result?.stdout);
      } catch (error) {
        if (isCancelledDialog(error, attempt)) {
          return null;
        }

        if (isMissingDialogCommand(error)) {
          continue;
        }

        throw new AppError("The native file dialog could not be opened.", 500, {
          code: "NATIVE_FILE_DIALOG_FAILED",
          details: { platform: this.platform },
        });
      }
    }

    throw new AppError("No supported native file dialog is available on this system.", 501, {
      code: "NATIVE_FILE_DIALOG_UNAVAILABLE",
      details: { platform: this.platform },
    });
  }
}

module.exports = {
  DEFAULT_DATABASE_FILENAME,
  NativeFileDialogService,
  buildDialogAttempts,
  buildOpenDialogAttempts,
  normalizeOpenedDatabasePath,
  normalizeSelectedDatabasePath,
};
