#!/bin/sh
# PocketBase reads migrations from one directory, so gather the example presets
# and the dev-only seed into it before starting.
set -eu
mkdir -p /pb/pb_migrations
cp /migrations/*/*.js /pb/pb_migrations/
exec /pb/pocketbase "$@"
