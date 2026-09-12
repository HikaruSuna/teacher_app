package config

import "os"

type Config struct {
	HTTPAddr       string
	DatabaseURL    string
	FrontendOrigin string
}

func Load() Config {
	return Config{
		HTTPAddr:       valueOrDefault("HTTP_ADDR", "127.0.0.1:8080"),
		DatabaseURL:    valueOrDefault("DATABASE_URL", "postgres://tutor:tutor_dev_password@localhost:5432/tutor?sslmode=disable"),
		FrontendOrigin: valueOrDefault("FRONTEND_ORIGIN", "http://localhost:5173"),
	}
}

func valueOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
