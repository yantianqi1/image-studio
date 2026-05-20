FROM golang:1.23-alpine AS builder

WORKDIR /src/apps/worker-go

COPY apps/worker-go/go.mod apps/worker-go/go.sum ./
RUN go mod download

COPY apps/worker-go ./

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /app/image-worker ./cmd/image-worker

FROM alpine:3.20

WORKDIR /app

COPY --from=builder /app/image-worker /app/image-worker

CMD ["/app/image-worker"]
