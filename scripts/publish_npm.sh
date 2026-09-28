#!/usr/bin/env bash
# Publishes the npm packages that build_release.sh made: each platform's binary package, then ezvals, which depends
# on exactly those as optional dependencies. A version already on npm is skipped, so a failed publish can be rerun.
# Authenticates as whoever is logged in to npm (npm login), or through trusted publishing in the release workflow.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' python/pyproject.toml)
published() { npm view "$1@$VERSION" version >/dev/null 2>&1; }

for pkg in npm/*/; do
  name=$(basename "$pkg")
  if published "$name"; then echo "$name@$VERSION is already on npm"; else (cd "$pkg" && npm publish --access public); fi
done

cd typescript
if published ezvals; then echo "ezvals@$VERSION is already on npm"; exit 0; fi
npm ci && npm run build
trap 'npm pkg delete optionalDependencies' EXIT
for pkg in ../npm/*/; do npm pkg set "optionalDependencies.$(basename "$pkg")=$VERSION"; done
npm publish --access public
