# ghcr.io/kamodigi/pocketbase-cms: the built CMS in /dist, for a site's Dockerfile to copy. It is
# never run, so it holds nothing but files:
#
#   COPY --from=ghcr.io/kamodigi/pocketbase-cms:<version> /dist /pb/pb_public/cms
#
# The build context is an unpacked release zip (see release/package.sh).
FROM scratch

ARG VERSION
ARG REVISION

LABEL org.opencontainers.image.title="pocketbase-cms" \
	org.opencontainers.image.description="An admin UI for PocketBase. Copy /dist into pb_public/cms/." \
	org.opencontainers.image.source="https://github.com/kamodigi/pocketbase-cms" \
	org.opencontainers.image.licenses="MIT" \
	org.opencontainers.image.version="${VERSION}" \
	org.opencontainers.image.revision="${REVISION}"

COPY LICENSE /LICENSE
COPY cms /dist
