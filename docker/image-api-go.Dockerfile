FROM golang:1.23-alpine AS builder

WORKDIR /src

COPY apps/image-runtime-go ./apps/image-runtime-go
COPY apps/image-api-go ./apps/image-api-go

WORKDIR /src/apps/image-api-go
RUN go mod download

ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /app/image-api ./cmd/image-api

FROM alpine:3.20

WORKDIR /app

COPY --from=builder /app/image-api /app/image-api

EXPOSE 7810

CMD ["/app/image-api"]
