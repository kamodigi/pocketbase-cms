# Development PocketBase: the official binary, nothing else. See compose.yaml.
FROM alpine:3.22 AS downloader

ARG PB_VERSION
ARG TARGETARCH

RUN apk add --no-cache ca-certificates unzip wget \
	&& wget -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
	&& unzip /tmp/pb.zip pocketbase -d /pb \
	&& chmod +x /pb/pocketbase

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata wget

WORKDIR /pb
COPY --from=downloader /pb/pocketbase /pb/pocketbase
COPY entrypoint.sh /entrypoint.sh

EXPOSE 8090

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
	CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["serve", "--http=0.0.0.0:8090"]
