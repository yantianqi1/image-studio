package config

import "os"

const defaultHTTPAddr = ":7820"

type Config struct {
	DatabaseURL string
	HTTPAddr    string
}

func Load() Config {
	return Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		HTTPAddr:    stringDefault("GO_CORE_API_HTTP_ADDR", defaultHTTPAddr),
	}
}

func stringDefault(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
