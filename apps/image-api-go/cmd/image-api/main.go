package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/config"
	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/httpapi"
	"github.com/yantianqi1/image-studio/apps/image-api-go/internal/service"
	"github.com/yantianqi1/image-studio/apps/image-runtime-go/pkg/storage"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("go image api stopped with error", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	assetStorage, err := storage.BuildAssetStorage(storage.Config{
		Backend:            cfg.StorageBackend,
		GeneratedAssetsDir: cfg.GeneratedAssetsDir,
		GCSBucket:          cfg.StorageGCSBucket,
		GCSPrefix:          cfg.StorageGCSPrefix,
	})
	if err != nil {
		return err
	}
	repository := service.NewRepositoryWithConfig(pool, assetStorage, service.RepositoryConfig{
		SessionSecret: cfg.SessionSecret,
	})
	handler := httpapi.NewHandler(repository, httpapi.Config{
		InternalDebugToken:            cfg.InternalDebugToken,
		InternalServiceToken:          cfg.InternalServiceToken,
		InternalServiceTokenNext:      cfg.InternalServiceTokenNext,
		EnableInternalCreate:          cfg.EnableInternalCreate,
		EnablePublicCreate:            cfg.EnablePublicCreate,
		EnableDebugOwnerHeaders:       cfg.EnableDebugOwnerHeaders,
		Ready:                         readyFunc(pool, assetStorage),
		UserSessionCookieName:         cfg.UserSessionCookieName,
		AnonymousSessionCookieName:    cfg.AnonymousSessionCookieName,
		AnonymousSessionCookieSecure:  cfg.AnonymousSessionCookieSecure,
		AnonymousSessionMaxAgeSeconds: cfg.AnonymousSessionMaxAgeSeconds,
	})
	return serve(ctx, cfg.HTTPAddr, handler, logger)
}

func serve(ctx context.Context, addr string, handler http.Handler, logger *slog.Logger) error {
	server := &http.Server{Addr: addr, Handler: handler}
	errs := make(chan error, 1)
	go func() {
		logger.Info("go image api listening", "addr", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errs <- err
		}
	}()
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	case err := <-errs:
		return err
	}
}

func readyFunc(pool *pgxpool.Pool, assetStorage storage.AssetStorage) func(context.Context) error {
	return func(ctx context.Context) error {
		if err := pool.Ping(ctx); err != nil {
			return err
		}
		temp, err := assetStorage.WriteTemp([]byte("ready"), "text/plain")
		if err != nil {
			return fmt.Errorf("write ready temp asset: %w", err)
		}
		return assetStorage.Delete(temp.Key)
	}
}
