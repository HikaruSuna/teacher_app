package config

import "testing"

func TestLoadUsesDefaults(t *testing.T) {
	t.Setenv("HTTP_ADDR", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("FRONTEND_ORIGIN", "")

	got := Load()
	if got.HTTPAddr != "127.0.0.1:8080" {
		t.Fatalf("HTTPAddr = %q", got.HTTPAddr)
	}
	if got.FrontendOrigin != "http://localhost:5173" {
		t.Fatalf("FrontendOrigin = %q", got.FrontendOrigin)
	}
}

func TestLoadUsesEnvironment(t *testing.T) {
	t.Setenv("HTTP_ADDR", "127.0.0.1:9000")
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("FRONTEND_ORIGIN", "http://localhost:4173")

	got := Load()
	if got.HTTPAddr != "127.0.0.1:9000" {
		t.Fatalf("HTTPAddr = %q", got.HTTPAddr)
	}
	if got.DatabaseURL != "postgres://example" {
		t.Fatalf("DatabaseURL = %q", got.DatabaseURL)
	}
	if got.FrontendOrigin != "http://localhost:4173" {
		t.Fatalf("FrontendOrigin = %q", got.FrontendOrigin)
	}
}
