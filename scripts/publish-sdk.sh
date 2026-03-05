#!/usr/bin/env bash
set -euo pipefail

LEVEL=${1:-patch}
cd "$(dirname "$0")/../typescript"

VERSION=$(npm version "$LEVEL" --no-git-tag-version | tr -d 'v')
cd ..

git add typescript/package.json typescript/package-lock.json
git commit -m "sdk v${VERSION}"
git tag "v${VERSION}"
git push && git push --tags

echo "Tagged v${VERSION} — publish workflow will run automatically."
