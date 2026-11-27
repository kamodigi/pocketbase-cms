#!/bin/sh
# Downloads the official PocketBase build for Linux from https://ganigeorgiev.com/pocketbase/pocketbase,
# checks it against the release's checksums.txt and unpacks the binary into <dest_dir>.
# tests/pocketbase.ts does the same in TypeScript for the tests.
#
# Usage: download-pocketbase.sh <version, such as 0.42.3> <arch, such as amd64> <dest_dir>
#
# Unlike GitHub Releases, a file's URL holds the id of the release record
# (/api/files/releases/<id>/<file>), so the id is looked up by tag first, with the same filter
# as `pocketbase update`. Needs curl, sha256sum and unzip.
set -eu

if [ "$#" -ne 3 ]; then
	echo "usage: $0 <version> <arch> <dest_dir>" >&2
	exit 2
fi

version=$1
arch=$2
dest=$3

base_url=https://ganigeorgiev.com
zip_name="pocketbase_${version}_linux_${arch}.zip"
filter="channel.repository.project.name=\"pocketbase\" && channel.repository.name=\"pocketbase\" && channel.name=\"default\" && draft=false && tag=\"v${version}\""

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

curl -fsS --retry 3 -G "${base_url}/api/collections/releases/records" \
	--data-urlencode "filter=${filter}" \
	--data-urlencode "fields=id" \
	--data-urlencode "perPage=1" \
	--data-urlencode "skipTotal=1" \
	-o "$tmp/release.json"

# With fields=id the answer is only {"items":[{"id":"..."}],...}, so sed is enough.
record_id=$(sed -n 's/.*"items":\[{"id":"\([a-z0-9]*\)"}.*/\1/p' "$tmp/release.json")
if [ -z "$record_id" ]; then
	echo "No PocketBase v${version} release at ${base_url}: $(cat "$tmp/release.json")" >&2
	exit 1
fi

files_url="${base_url}/api/files/releases/${record_id}"
curl -fsSL --retry 3 -o "$tmp/checksums.txt" "${files_url}/checksums.txt"
curl -fsSL --retry 3 -o "$tmp/${zip_name}" "${files_url}/${zip_name}"

# grep fails, and so the script, when checksums.txt has no line for the file.
(cd "$tmp" && grep "  ${zip_name}\$" checksums.txt | sha256sum -c -)

mkdir -p "$dest"
unzip -q -o "$tmp/${zip_name}" pocketbase -d "$dest"
chmod +x "$dest/pocketbase"
