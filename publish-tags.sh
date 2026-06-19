#!/usr/bin/env bash
#
# publish-tags.sh — cut a new @jambonz/sdk release.
#
# Why this script exists: the npm package lives in typescript/, but the version
# that gets published is whatever is in typescript/package.json, and the publish
# workflow (.github/workflows/publish-sdk.yml) is triggered ONLY by pushing a
# `v*` tag. Running `npm version` inside typescript/ bumps the file but does not
# create the repo-root git commit/tag (it's a subdirectory of the git root), so
# a plain `git push --follow-tags` ends up with nothing to send — the version
# bump just sits uncommitted and no tag is created. This script does the git
# side explicitly and pushes the tag that fires the publish.
#
# Usage:
#   ./publish-tags.sh                # bump patch  (0.6.0 -> 0.6.1)
#   ./publish-tags.sh minor          # bump minor  (0.6.0 -> 0.7.0)
#   ./publish-tags.sh major          # bump major  (0.6.0 -> 1.0.0)
#   ./publish-tags.sh 0.7.0          # set an explicit version
#
# It bumps typescript/package.json, commits ONLY the version files, tags
# v<version> at the repo root, and pushes main + the tag. Any other uncommitted
# changes in your tree are left untouched (only the version files are staged).
# CI runs `npm ci` + `npm test` before it publishes, so a broken build fails the
# release rather than shipping it.

set -euo pipefail

bump="${1:-patch}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

# 1. must be on an up-to-date main (the tag should point at the published tree)
branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
  echo "error: on branch '$branch'; releases are cut from main" >&2
  exit 1
fi
git fetch -q origin main
if [[ -n "$(git rev-list HEAD..FETCH_HEAD 2>/dev/null || true)" ]]; then
  echo "error: local main is behind origin/main — run 'git pull' first" >&2
  exit 1
fi

# 2. bump the version in typescript/ WITHOUT npm's git step (we tag at the root).
#    tail -n1 guards against npm printing notices above the version line.
new_version="$(cd typescript && npm version "$bump" --no-git-tag-version | tail -n1)"
tag="$new_version"          # npm prints e.g. v0.7.0
version="${new_version#v}"  # 0.7.0

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "error: tag $tag already exists — is this version already released?" >&2
  git checkout -- typescript/package.json typescript/package-lock.json
  exit 1
fi

echo "Releasing @jambonz/sdk $version (tag $tag)"

# 3. commit ONLY the version files, tag, and push main + tag
git add typescript/package.json typescript/package-lock.json
git commit -m "$version"
git tag "$tag"
git push origin main
git push origin "$tag"

cat <<EOF

Pushed $tag.
The "Publish @jambonz/sdk" workflow now runs npm ci + npm test + npm publish.
Watch it in the repo's Actions tab (or:  gh run watch).
EOF
