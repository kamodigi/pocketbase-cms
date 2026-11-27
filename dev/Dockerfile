# Development PocketBase: the official binary, nothing else. See compose.yaml.
FROM alpine:3.24 AS downloader

ARG PB_VERSION
ARG TARGETARCH

COPY download-pocketbase.sh /usr/local/bin/download-pocketbase.sh
RUN apk add --no-cache ca-certificates curl unzip \
	&& download-pocketbase.sh "${PB_VERSION}" "${TARGETARCH}" /pb

FROM alpine:3.24

RUN apk add --no-cache ca-certificates tzdata wget

WORKDIR /pb
COPY --from=downloader /pb/pocketbase /pb/pocketbase
COPY entrypoint.sh /entrypoint.sh

EXPOSE 8090

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
	CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["serve", "--http=0.0.0.0:8090"]
