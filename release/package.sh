#!/bin/sh
# Packs a release: <out_dir>/pocketbase-cms_<version>.zip, holding cms/ (the built CMS), pb_hooks/
# (the JavaScript hooks) and LICENSE. The GHCR image is built from the same zip (release/Dockerfile).
#
# Usage: release/package.sh <tag> [build_dir] [out_dir]
#
# The tag is the version of everything in the repository: v<major>.<minor>.<patch>, optionally with a
# pre-release suffix such as -rc.1. Major 2 and later are refused, because the Go module path in
# go.mod would need a /v2 suffix first. Build metadata (+...) is not allowed in an image tag.
# Needs zip.
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 3 ]; then
	echo "usage: $0 <tag> [build_dir] [out_dir]" >&2
	exit 2
fi

tag=$1
number='(0|[1-9][0-9]*)'
identifier='(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)'
if ! printf '%s\n' "$tag" | grep -Eq "^v[01]\.${number}\.${number}(-${identifier}(\.${identifier})*)?\$"; then
	echo "Not a release tag: ${tag} (expected v<0 or 1>.<minor>.<patch>[-<pre-release>], such as v0.1.0)" >&2
	exit 1
fi
version=${tag#v}

root=$(cd "$(dirname "$0")/.." && pwd)
build=${2:-$root/build}
out=${3:-$root/release-out}

if [ ! -f "$build/index.html" ]; then
	echo "No built CMS in ${build}. Run \`pnpm build\` first." >&2
	exit 1
fi

mkdir -p "$out"
out=$(cd "$out" && pwd)
zip_file="$out/pocketbase-cms_${version}.zip"

staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT

cp -R "$build" "$staging/cms"
cp -R "$root/hooks/pb_hooks" "$staging/pb_hooks"
cp "$root/LICENSE" "$staging/LICENSE"

# zip adds to an existing archive, so start from nothing.
rm -f "$zip_file"
(cd "$staging" && zip -q -r -X "$zip_file" cms pb_hooks LICENSE)

echo "$zip_file"
