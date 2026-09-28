#!/usr/bin/env bash
# Builds a release from this checkout: the host binary for each platform, a Python wheel per platform in dist/,
# and an npm package per platform in npm/ holding just its binary. The release workflow runs this too.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' python/pyproject.toml)
make ui skill-docs
rm -rf dist npm
# GOOS GOARCH wheel-platform node-platform node-arch
while read -r goos goarch wheel node_os node_arch; do
  ext=""; [ "$goos" = windows ] && ext=".exe"
  rm -rf python/ezvals/bin && mkdir -p python/ezvals/bin
  CGO_ENABLED=0 GOOS=$goos GOARCH=$goarch go build -ldflags "-X main.version=$VERSION" -o "python/ezvals/bin/ezvals$ext" ./cmd/ezvals
  (cd python && EZVALS_WHEEL_PLATFORM=$wheel uv build --wheel --out-dir ../dist)
  pkg="npm/ezvals-$node_os-$node_arch"
  mkdir -p "$pkg"
  cp "python/ezvals/bin/ezvals$ext" "$pkg/ezvals$ext"
  jq -n --arg name "ezvals-$node_os-$node_arch" --arg version "$VERSION" --arg os "$node_os" --arg cpu "$node_arch" --arg file "ezvals$ext" \
    '{name: $name, version: $version, description: "The ezvals host binary for \($os) \($cpu)", license: "MIT", repository: {type: "git", url: "git+https://github.com/camronh/EZVals.git"}, os: [$os], cpu: [$cpu], files: [$file]}' > "$pkg/package.json"
done <<'PLATFORMS'
darwin arm64 macosx_11_0_arm64 darwin arm64
darwin amd64 macosx_10_12_x86_64 darwin x64
linux amd64 manylinux_2_17_x86_64 linux x64
linux arm64 manylinux_2_17_aarch64 linux arm64
windows amd64 win_amd64 win32 x64
PLATFORMS
# Leave this machine's own host binary in place for local use.
go build -ldflags "-X main.version=$VERSION" -o python/ezvals/bin/ezvals ./cmd/ezvals
ls dist npm/*
