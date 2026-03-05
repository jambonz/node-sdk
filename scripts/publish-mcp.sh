#!/usr/bin/env bash
set -euo pipefail

LEVEL=${1:-patch}
cd "$(dirname "$0")/../mcp-server"

VERSION=$(npm version "$LEVEL" --no-git-tag-version | tr -d 'v')
cd ..

git add mcp-server/package.json mcp-server/package-lock.json
git commit -m "mcp v${VERSION}"
git tag "mcp-v${VERSION}"
git push && git push --tags

echo "Tagged mcp-v${VERSION} — publish workflow will run automatically."
