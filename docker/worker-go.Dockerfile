FROM golang:1.23-alpine AS builder

WORKDIR /src

COPY apps/image-runtime-go/go.mod apps/image-runtime-go/go.sum ./apps/image-runtime-go/
COPY apps/worker-go/go.mod apps/worker-go/go.sum ./apps/worker-go/
WORKDIR /src/apps/image-runtime-go
RUN go mod download

WORKDIR /src/apps/worker-go
RUN go mod download

WORKDIR /src
COPY apps/image-runtime-go ./apps/image-runtime-go
COPY apps/worker-go ./apps/worker-go
WORKDIR /src/apps/image-runtime-go

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /app/assetctl ./cmd/assetctl

WORKDIR /src/apps/worker-go

RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /app/image-worker ./cmd/image-worker

FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY --from=builder /app/image-worker /app/image-worker
COPY --from=builder /app/assetctl /app/assetctl

EXPOSE 7900

CMD ["/app/image-worker"]
