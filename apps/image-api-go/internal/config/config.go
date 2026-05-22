package config

import (
	"fmt"
	"os"
)

const defaultHTTPAddr = ":7810"
const defaultUserSessionCookieName = "studio_user_session"
const defaultAnonymousSessionCookieName = "studio_anonymous_session"
const defaultAnonymousSessionMaxAgeSeconds = 365 * 24 * 60 * 60

type Config struct {
	DatabaseURL                   string
	HTTPAddr                      string
	GeneratedAssetsDir            string
	StorageBackend                string
	StorageGCSBucket              string
	StorageGCSPrefix              string
	InternalDebugToken            string
	InternalServiceToken          string
	InternalServiceTokenNext      string
	EnableInternalCreate          bool
	EnablePublicCreate            bool
	EnableDebugOwnerHeaders       bool
	UserSessionCookieName         string
	AnonymousSessionCookieName    string
	AnonymousSessionCookieSecure  bool
	AnonymousSessionMaxAgeSeconds int
	SessionSecret                 string
}

func Load() (Config, error) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	anonymousMaxAge, err := intDefault(
		"ANONYMOUS_SESSION_MAX_AGE_SECONDS",
		defaultAnonymousSessionMaxAgeSeconds,
	)
	if err != nil {
		return Config{}, err
	}
	return Config{
		DatabaseURL:          databaseURL,
		HTTPAddr:             stringDefault("GO_IMAGE_API_HTTP_ADDR", defaultHTTPAddr),
		GeneratedAssetsDir:   stringDefault("GENERATED_ASSETS_DIR", "./generated-assets"),
		StorageBackend:       stringDefault("ASSET_STORAGE_BACKEND", "local"),
		StorageGCSBucket:     os.Getenv("ASSET_STORAGE_GCS_BUCKET"),
		StorageGCSPrefix:     stringDefault("ASSET_STORAGE_GCS_PREFIX", "generated-assets"),
		InternalDebugToken:   os.Getenv("GO_IMAGE_API_INTERNAL_DEBUG_TOKEN"),
		InternalServiceToken: os.Getenv("INTERNAL_SERVICE_TOKEN"),
		InternalServiceTokenNext: os.Getenv(
			"INTERNAL_SERVICE_TOKEN_NEXT",
		),
		EnableInternalCreate: os.Getenv("GO_IMAGE_API_ENABLE_INTERNAL_CREATE") == "true",
		EnablePublicCreate:   os.Getenv("GO_IMAGE_API_CREATE_ENABLED") == "true",
		EnableDebugOwnerHeaders: os.Getenv(
			"GO_IMAGE_API_ENABLE_DEBUG_OWNER_HEADERS",
		) == "true",
		UserSessionCookieName: stringDefault("USER_SESSION_COOKIE_NAME", defaultUserSessionCookieName),
		AnonymousSessionCookieName: stringDefault(
			"ANONYMOUS_SESSION_COOKIE_NAME",
			defaultAnonymousSessionCookieName,
		),
		AnonymousSessionCookieSecure:  os.Getenv("ANONYMOUS_SESSION_COOKIE_SECURE") == "true",
		AnonymousSessionMaxAgeSeconds: anonymousMaxAge,
		SessionSecret:                 stringDefault("SESSION_SECRET", "replace-me"),
	}, nil
}

func stringDefault(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func intDefault(key string, fallback int) (int, error) {
	value := os.Getenv(key)
	if value == "" {
		return fallback, nil
	}
	var parsed int
	if _, err := fmt.Sscanf(value, "%d", &parsed); err != nil {
		return 0, fmt.Errorf("%s must be an integer", key)
	}
	if parsed <= 0 {
		return 0, fmt.Errorf("%s must be positive", key)
	}
	return parsed, nil
}
