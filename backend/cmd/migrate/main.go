package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/HikaruSuna/teacher_app/backend/internal/config"
	"github.com/HikaruSuna/teacher_app/backend/internal/database"
	"github.com/HikaruSuna/teacher_app/backend/migrations"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	settings := config.Load()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pool, err := database.Open(ctx, settings.DatabaseURL)
	if err != nil {
		logger.Error("connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := migrations.Apply(ctx, pool); err != nil {
		logger.Error("apply migrations", "error", err)
		os.Exit(1)
	}

	logger.Info("migrations applied")
}
