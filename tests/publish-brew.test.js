const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const script = fs.readFileSync(path.resolve(__dirname, "../scripts/publish_brew.sh"), "utf8");
const blocks = [...script.matchAll(/    # better-sqlite3 ships[^\n]*\n([\s\S]*?)    bin\.install_symlink/g)]
  .map((match) => match[1].replaceAll("${PACKAGE_NAME}", "sqlite-hub"));
const rubyAvailable = spawnSync("ruby", ["--version"]).status === 0;

function prune(libexec, platform, arch) {
  const ruby = `
require "pathname"
module OS
  def self.mac?
    ARGV[1] == "darwin"
  end
end
module Hardware
  module CPU
    def self.arm?
      ARGV[2] == "arm64"
    end
  end
end
libexec = Pathname(ARGV[0])
${blocks[0]}
`;
  const result = spawnSync("ruby", ["-e", ruby, libexec, platform, arch], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-brew-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const modulePath = path.join(directory, "lib/node_modules/sqlite-hub/node_modules/better-sqlite3");
  return { directory, modulePath, prebuilds: path.join(modulePath, "prebuilds") };
}

test("Homebrew install and dry-run preview use the same native cleanup", () => {
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0], blocks[1]);
});

for (const platform of ["darwin", "linux"]) {
  for (const arch of ["arm64", "x64"]) {
    test(`Homebrew keeps only the ${platform}-${arch} prebuild`, { skip: !rubyAvailable }, (t) => {
      const { directory, prebuilds } = fixture(t);
      fs.mkdirSync(prebuilds, { recursive: true });
      for (const target of ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "linuxmusl-arm64", "linuxmusl-x64", "win32-arm64", "win32-x64"]) {
        fs.writeFileSync(path.join(prebuilds, `${target}.node`), "binary fixture");
      }
      fs.writeFileSync(path.join(prebuilds, "README"), "keep documentation");
      prune(directory, platform, arch);
      assert.deepEqual(fs.readdirSync(prebuilds).sort(), ["README", `${platform}-${arch}.node`].sort());
      prune(directory, platform, arch);
      assert.equal(fs.existsSync(path.join(prebuilds, `${platform}-${arch}.node`)), true);
    });
  }
}

test("Homebrew cleanup preserves a source-built addon when no prebuilds exist", { skip: !rubyAvailable }, (t) => {
  const { directory, modulePath } = fixture(t);
  const addon = path.join(modulePath, "build/Release/better_sqlite3.node");
  fs.mkdirSync(path.dirname(addon), { recursive: true });
  fs.writeFileSync(addon, "source-built fixture");
  prune(directory, "darwin", "arm64");
  assert.equal(fs.readFileSync(addon, "utf8"), "source-built fixture");
});

test("better-sqlite3 still executes SQL after Homebrew prunes its bundled binaries", {
  skip: !rubyAvailable || !["darwin", "linux"].includes(process.platform) || (process.platform === "linux" && !process.report.getReport().header.glibcVersionRuntime),
}, (t) => {
  const { directory, modulePath, prebuilds } = fixture(t);
  fs.cpSync(path.dirname(require.resolve("better-sqlite3/package.json")), modulePath, { recursive: true });
  prune(directory, process.platform, process.arch);
  const Database = require(modulePath);
  const db = new Database(":memory:");
  try {
    assert.equal(db.prepare("SELECT 1 AS value").get().value, 1);
    assert.deepEqual(fs.readdirSync(prebuilds), [`${process.platform}-${process.arch}.node`]);
  } finally {
    db.close();
  }
});
