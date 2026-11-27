#!/bin/sh
# Takes /dist out of the image with COPY --from, as a site's Dockerfile does, and compares it with the
# built CMS. Needs Docker with BuildKit.
#
# Usage: release/verify-image.sh <image> <expected_dir>
set -eu

if [ "$#" -ne 2 ]; then
	echo "usage: $0 <image> <expected_dir>" >&2
	exit 2
fi

image=$1
expected=$2

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

printf 'FROM scratch\nCOPY --from=%s /dist /\n' "$image" |
	docker build --output "type=local,dest=$tmp" -

diff -r "$expected" "$tmp"
echo "/dist of ${image} matches ${expected}"
