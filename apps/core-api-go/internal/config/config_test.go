package config

import "testing"

func TestLoadUsesDatabaseURLAndDefaultAddress(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://studio@localhost:5432/studio")

	cfg := Load()

	if cfg.DatabaseURL != "postgres://studio@localhost:5432/studio" {
		t.Fatalf("unexpected database url: %q", cfg.DatabaseURL)
	}
	if cfg.HTTPAddr != ":7820" {
		t.Fatalf("unexpected default addr: %q", cfg.HTTPAddr)
	}
}

func TestLoadAllowsAddressOverride(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://studio@localhost:5432/studio")
	t.Setenv("GO_CORE_API_HTTP_ADDR", ":7999")

	cfg := Load()

	if cfg.HTTPAddr != ":7999" {
		t.Fatalf("unexpected addr override: %q", cfg.HTTPAddr)
	}
}
