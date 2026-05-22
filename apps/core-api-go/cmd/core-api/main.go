package main

import (
	"log/slog"
	"net/http"
	"os"

	"github.com/yantianqi1/image-studio/apps/core-api-go/internal/config"
	"github.com/yantianqi1/image-studio/apps/core-api-go/internal/db"
	"github.com/yantianqi1/image-studio/apps/core-api-go/internal/httpapi"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(); err != nil {
		logger.Error("go core api stopped with error", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()
	checker := db.Checker{DatabaseURL: cfg.DatabaseURL}
	handler := httpapi.NewHandler(httpapi.Config{Ready: checker})
	return http.ListenAndServe(cfg.HTTPAddr, handler)
}
