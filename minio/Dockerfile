# MinIO no longer publishes container images, so build the server from the
# upstream release tag. Bump MINIO_RELEASE to upgrade.
ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z

FROM golang:1.24-alpine AS build
ARG MINIO_RELEASE
RUN apk add --no-cache git
ENV CGO_ENABLED=0
RUN git clone --depth 1 --branch ${MINIO_RELEASE} https://github.com/minio/minio.git /src
WORKDIR /src
RUN go build -trimpath -tags kqueue \
      -ldflags "-s -w $(go run buildscripts/gen-ldflags.go)" \
      -o /out/minio .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates \
 && adduser -D -H -u 1000 minio \
 && mkdir /data && chown minio:minio /data
COPY --from=build /out/minio /usr/local/bin/minio
USER minio
VOLUME /data
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
