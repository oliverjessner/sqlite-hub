#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0
ALLOW_DIRTY=0
DIST_TAG=""
ACCESS=""
OTP=""
GH_REMOTE="origin"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/publish_npm.sh [options]

Options:
  --tag NAME          Publish to a custom npm dist-tag instead of `latest`.
  --access LEVEL      Forward `--access` to `npm publish` (for scoped packages).
  --otp CODE          One-time password for npm 2FA protected publishes.
  --allow-dirty       Allow publishing from a dirty worktree.
  --dry-run           Build the tarball and run `npm publish --dry-run`.
  --help              Show this help text.

Requirements:
  - git
  - node
  - npm

Notes:
  - A clean worktree is required by default so the published package matches git.
  - In `--allow-dirty` mode, git branch/tag sync is skipped on purpose.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      DIST_TAG="${2:-}"
      shift 2
      ;;
    --access)
      ACCESS="${2:-}"
      shift 2
      ;;
    --otp)
      OTP="${2:-}"
      shift 2
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
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

is_clean_worktree() {
  git diff --quiet --ignore-submodules HEAD -- && git diff --cached --quiet --ignore-submodules --
}

ensure_clean_worktree() {
  if [[ "$ALLOW_DIRTY" == "1" ]]; then
    return
  fi

  if ! is_clean_worktree; then
    echo "Working tree is not clean. Commit or stash changes first, or rerun with --allow-dirty." >&2
    exit 1
  fi
}

ensure_branch_on_remote() {
  local current_branch
  current_branch="$(git rev-parse --abbrev-ref HEAD)"

  if [[ "$current_branch" == "HEAD" ]]; then
    info "Detached HEAD detected, skipping branch push"
    return
  fi

  if git ls-remote --exit-code --heads "$GH_REMOTE" "$current_branch" >/dev/null 2>&1; then
    info "Pushing branch $current_branch to $GH_REMOTE"
    run git push "$GH_REMOTE" "$current_branch"
  else
    info "Branch $current_branch does not exist on $GH_REMOTE yet, pushing it"
    run git push -u "$GH_REMOTE" "$current_branch"
  fi
}

ensure_git_tag() {
  if git rev-parse "$GIT_TAG" >/dev/null 2>&1; then
    info "Tag $GIT_TAG already exists locally"
  else
    info "Creating git tag $GIT_TAG"
    run git tag -a "$GIT_TAG" -m "Release $GIT_TAG"
  fi

  if git ls-remote --exit-code --tags "$GH_REMOTE" "refs/tags/$GIT_TAG" >/dev/null 2>&1; then
    info "Tag $GIT_TAG already exists on $GH_REMOTE"
  else
    info "Pushing tag $GIT_TAG to $GH_REMOTE"
    run git push "$GH_REMOTE" "$GIT_TAG"
  fi
}

ensure_npm_auth() {
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Dry run, skipping npm auth check"
    return
  fi

  info "Checking npm auth"
  npm whoami >/dev/null
}

ensure_version_not_published() {
  if [[ "$DRY_RUN" == "1" ]]; then
    info "Dry run, skipping npm registry version check"
    return
  fi

  if npm view "${PACKAGE_NAME}@${VERSION}" version >/dev/null 2>&1; then
    echo "Version ${PACKAGE_NAME}@${VERSION} is already published on npm." >&2
    exit 1
  fi
}

pack_package() {
  PACK_DIR="$(mktemp -d)"
  trap 'rm -rf "$PACK_DIR"' EXIT

  info "Packing npm tarball"
  local pack_output
  pack_output="$(cd "$PACK_DIR" && npm pack "$ROOT_DIR")"
  TARBALL_NAME="$(printf '%s\n' "$pack_output" | awk '/\.tgz$/ { name = $0 } END { print name }')"

  if [[ -z "$TARBALL_NAME" || ! -f "$PACK_DIR/$TARBALL_NAME" ]]; then
    echo "Failed to locate npm tarball in pack output:" >&2
    printf '%s\n' "$pack_output" >&2
    exit 1
  fi

  TARBALL_PATH="$PACK_DIR/$TARBALL_NAME"
}

publish_tarball() {
  local publish_cmd=(npm publish "$TARBALL_PATH")

  if [[ -n "$DIST_TAG" ]]; then
    publish_cmd+=(--tag "$DIST_TAG")
  fi

  if [[ -n "$ACCESS" ]]; then
    publish_cmd+=(--access "$ACCESS")
  fi

  if [[ -n "$OTP" ]]; then
    publish_cmd+=(--otp "$OTP")
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    publish_cmd+=(--dry-run)
  fi

  info "Publishing ${PACKAGE_NAME}@${VERSION} to npm"
  "${publish_cmd[@]}"
}

require_cmd git
require_cmd node
require_cmd npm

ensure_clean_worktree

PACKAGE_NAME="$(json_field name)"
VERSION="$(json_field version)"
GIT_TAG="v${VERSION}"

info "Preparing npm publish for ${PACKAGE_NAME}@${VERSION}"

if is_clean_worktree; then
  ensure_branch_on_remote
  ensure_git_tag
else
  info "Dirty worktree allowed, skipping git branch/tag sync"
fi

ensure_npm_auth
ensure_version_not_published
pack_package
publish_tarball

if [[ "$DRY_RUN" == "1" ]]; then
  info "Dry run completed for ${PACKAGE_NAME}@${VERSION}"
else
  info "Published ${PACKAGE_NAME}@${VERSION}"
  info "Install with: npm install -g ${PACKAGE_NAME}"
fi
