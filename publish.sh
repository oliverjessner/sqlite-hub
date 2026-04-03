#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0
SKIP_AUDIT=0
ALLOW_DIRTY=0
VERSION_OVERRIDE=""
TAP_REPO_OVERRIDE=""
TAP_DIR_OVERRIDE=""
FORMULA_NAME_OVERRIDE=""
GH_REMOTE="origin"

usage() {
  cat <<'EOF'
Usage:
  ./publish.sh [options]

Options:
  --version X.Y.Z      Override the package.json version for this publish run.
  --tap-repo OWNER/REPO
                       Homebrew tap repository. Default: <origin-owner>/homebrew-tap
  --tap-dir PATH       Local clone path for the tap repo. Default: ../homebrew-tap
  --formula-name NAME  Formula name. Default: package.json name
  --allow-dirty        Allow publishing with uncommitted changes in the source repo.
  --skip-audit         Skip `brew audit` for the generated formula.
  --dry-run            Print the steps without pushing or writing changes.
  --help               Show this help text.

Requirements:
  - git
  - gh (authenticated)
  - curl
  - shasum
  - node
  - brew (optional, only for audit)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION_OVERRIDE="${2:-}"
      shift 2
      ;;
    --tap-repo)
      TAP_REPO_OVERRIDE="${2:-}"
      shift 2
      ;;
    --tap-dir)
      TAP_DIR_OVERRIDE="${2:-}"
      shift 2
      ;;
    --formula-name)
      FORMULA_NAME_OVERRIDE="${2:-}"
      shift 2
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    --skip-audit)
      SKIP_AUDIT=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi

  "$@"
}

info() {
  printf '==> %s\n' "$*"
}

parse_github_slug() {
  node - "$1" <<'NODE'
const remote = process.argv[2] ?? "";
const normalized = remote
  .replace(/^git@github\.com:/, "")
  .replace(/^https?:\/\/github\.com\//, "")
  .replace(/\.git$/, "")
  .replace(/\/+$/, "");

if (!/^[^/]+\/[^/]+$/.test(normalized)) {
  console.error(`Could not derive GitHub owner/repo from remote: ${remote}`);
  process.exit(1);
}

process.stdout.write(normalized);
NODE
}

json_field() {
  node - "$1" <<'NODE'
const field = process.argv[2];
const pkg = require("./package.json");
const value = pkg[field];

if (value === undefined || value === null) {
  process.exit(1);
}

process.stdout.write(String(value));
NODE
}

ruby_string() {
  node - "$1" <<'NODE'
process.stdout.write(JSON.stringify(process.argv[2] ?? ""));
NODE
}

formula_class_name() {
  node - "$1" <<'NODE'
const name = process.argv[2] ?? "";
const value = name
  .split(/[^A-Za-z0-9]+/)
  .filter(Boolean)
  .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
  .join("");

process.stdout.write(value);
NODE
}

ensure_clean_worktree() {
  if [[ "$ALLOW_DIRTY" == "1" ]]; then
    return
  fi

  if ! git diff --quiet --ignore-submodules HEAD -- || ! git diff --cached --quiet --ignore-submodules --; then
    echo "Working tree is not clean. Commit or stash changes first, or rerun with --allow-dirty." >&2
    exit 1
  fi
}

ensure_tap_repo() {
  if [[ -d "$TAP_DIR/.git" ]]; then
    info "Using existing tap checkout at $TAP_DIR"
    return
  fi

  if gh repo view "$TAP_REPO" >/dev/null 2>&1; then
    info "Cloning existing tap repo $TAP_REPO"
    run gh repo clone "$TAP_REPO" "$TAP_DIR"
    return
  fi

  info "Creating tap repo $TAP_REPO"
  run gh repo create "$TAP_REPO" --public --clone=false --description "Homebrew tap for $OWNER tools"
  run gh repo clone "$TAP_REPO" "$TAP_DIR"
}

ensure_git_tag() {
  if git rev-parse "$TAG" >/dev/null 2>&1; then
    info "Tag $TAG already exists locally"
  else
    info "Creating git tag $TAG"
    run git tag -a "$TAG" -m "Release $TAG"
  fi

  if git ls-remote --exit-code --tags "$GH_REMOTE" "refs/tags/$TAG" >/dev/null 2>&1; then
    info "Tag $TAG already exists on $GH_REMOTE"
  else
    info "Pushing tag $TAG to $GH_REMOTE"
    run git push "$GH_REMOTE" "$TAG"
  fi
}

ensure_github_release() {
  if gh release view "$TAG" --repo "$SOURCE_REPO" >/dev/null 2>&1; then
    info "GitHub release $TAG already exists"
    return
  fi

  info "Creating GitHub release $TAG"
  run gh release create "$TAG" \
    --repo "$SOURCE_REPO" \
    --title "$TAG" \
    --generate-notes
}

download_source_archive() {
  ARCHIVE_DIR="$(mktemp -d)"
  ARCHIVE_PATH="$ARCHIVE_DIR/${PACKAGE_NAME}-${VERSION}.tar.gz"
  trap 'rm -rf "$ARCHIVE_DIR"' EXIT

  info "Downloading source archive $ARCHIVE_URL"
  run curl -LfsS "$ARCHIVE_URL" -o "$ARCHIVE_PATH"

  if [[ "$DRY_RUN" == "1" ]]; then
    ARCHIVE_SHA256="DRY_RUN_SHA256"
  else
    ARCHIVE_SHA256="$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')"
  fi
}

write_formula() {
  local formula_dir="$TAP_DIR/Formula"
  local formula_path="$formula_dir/${FORMULA_NAME}.rb"

  mkdir -p "$formula_dir"

  cat >"$formula_path" <<EOF
class ${FORMULA_CLASS} < Formula
  desc ${DESC_RUBY}
  homepage ${HOMEPAGE_RUBY}
  url ${ARCHIVE_URL_RUBY}
  sha256 ${SHA256_RUBY}
  version ${VERSION_RUBY}

  depends_on "node"
  depends_on "python" => :build

  def install
    ENV["npm_config_build_from_source"] = "true"
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    output = shell_output("#{bin}/${FORMULA_NAME} --help")
    assert_match "SQLite Hub CLI", output
  end
end
EOF

  FORMULA_PATH="$formula_path"
}

commit_and_push_tap() {
  local formula_rel_path="Formula/${FORMULA_NAME}.rb"

  if [[ -z "$(git -C "$TAP_DIR" status --porcelain -- "$formula_rel_path")" ]]; then
    info "Formula already up to date in tap repo"
    return
  fi

  info "Committing formula update to tap repo"
  run git -C "$TAP_DIR" add "$formula_rel_path"
  run git -C "$TAP_DIR" commit -m "${FORMULA_NAME} ${VERSION}"
  run git -C "$TAP_DIR" push origin HEAD
}

run_brew_audit() {
  if [[ "$SKIP_AUDIT" == "1" ]]; then
    info "Skipping brew audit"
    return
  fi

  if ! command -v brew >/dev/null 2>&1; then
    info "brew not found, skipping audit"
    return
  fi

  info "Running brew audit on generated formula"
  run brew audit --strict --formula "$FORMULA_PATH"
}

require_cmd git
require_cmd gh
require_cmd curl
require_cmd shasum
require_cmd node

ensure_clean_worktree

SOURCE_REMOTE_URL="$(git config --get remote.${GH_REMOTE}.url)"
SOURCE_REPO="$(parse_github_slug "$SOURCE_REMOTE_URL")"
OWNER="${SOURCE_REPO%%/*}"
REPO_NAME="${SOURCE_REPO##*/}"
PACKAGE_NAME="$(json_field name)"
VERSION="${VERSION_OVERRIDE:-$(json_field version)}"
DESCRIPTION="$(json_field description)"
HOMEPAGE="https://github.com/${SOURCE_REPO}"
TAG="v${VERSION}"
ARCHIVE_URL="https://github.com/${SOURCE_REPO}/archive/refs/tags/${TAG}.tar.gz"
TAP_REPO="${TAP_REPO_OVERRIDE:-${OWNER}/homebrew-tap}"
TAP_DIR="${TAP_DIR_OVERRIDE:-$(cd "$ROOT_DIR/.." && pwd)/homebrew-tap}"
FORMULA_NAME="${FORMULA_NAME_OVERRIDE:-$PACKAGE_NAME}"
FORMULA_CLASS="$(formula_class_name "$FORMULA_NAME")"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

DESC_RUBY="$(ruby_string "$DESCRIPTION")"
HOMEPAGE_RUBY="$(ruby_string "$HOMEPAGE")"
ARCHIVE_URL_RUBY="$(ruby_string "$ARCHIVE_URL")"
VERSION_RUBY="$(ruby_string "$VERSION")"

info "Publishing ${PACKAGE_NAME} ${VERSION}"
info "Source repo: ${SOURCE_REPO}"
info "Tap repo: ${TAP_REPO}"
info "Tap dir: ${TAP_DIR}"
info "Formula: ${FORMULA_NAME}"

if git ls-remote --exit-code --heads "$GH_REMOTE" "$CURRENT_BRANCH" >/dev/null 2>&1; then
  info "Pushing branch $CURRENT_BRANCH to $GH_REMOTE"
  run git push "$GH_REMOTE" "$CURRENT_BRANCH"
else
  info "Branch $CURRENT_BRANCH does not exist on $GH_REMOTE yet, pushing it"
  run git push -u "$GH_REMOTE" "$CURRENT_BRANCH"
fi

ensure_git_tag
ensure_github_release
download_source_archive

SHA256_RUBY="$(ruby_string "$ARCHIVE_SHA256")"

if [[ "$DRY_RUN" == "1" ]]; then
  info "Dry run formula preview"
  FORMULA_PATH="${TAP_DIR}/Formula/${FORMULA_NAME}.rb"
  cat <<EOF
class ${FORMULA_CLASS} < Formula
  desc ${DESC_RUBY}
  homepage ${HOMEPAGE_RUBY}
  url ${ARCHIVE_URL_RUBY}
  sha256 ${SHA256_RUBY}
  version ${VERSION_RUBY}

  depends_on "node"
  depends_on "python" => :build

  def install
    ENV["npm_config_build_from_source"] = "true"
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    output = shell_output("#{bin}/${FORMULA_NAME} --help")
    assert_match "SQLite Hub CLI", output
  end
end
EOF
  exit 0
fi

ensure_tap_repo
write_formula
run_brew_audit
commit_and_push_tap

info "Published ${FORMULA_NAME} ${VERSION}"
info "Install with: brew tap ${TAP_REPO} && brew install ${FORMULA_NAME}"
