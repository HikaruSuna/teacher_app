package auth

import (
	"context"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPostgresSessionRepository(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(pool.Close)

	loginID := "test" + strconv.FormatInt(time.Now().UnixNano(), 10) + "@student.com"
	var userID string
	err = pool.QueryRow(ctx, `
		insert into users (login_id, role, full_name, password_hash)
		values ($1, 'student', 'セッションテスト', 'integration-test-placeholder')
		returning id::text
	`, loginID).Scan(&userID)
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		_, _ = pool.Exec(cleanupCtx, `delete from users where id = $1`, userID)
	})

	repository := NewPostgresSessionRepository(pool)
	service, err := NewSessionService(repository, time.Hour)
	if err != nil {
		t.Fatalf("NewSessionService() error = %v", err)
	}

	session, err := service.Create(ctx, userID)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	var storedHash []byte
	if err := pool.QueryRow(ctx,
		`select token_hash from sessions where user_id = $1`,
		userID,
	).Scan(&storedHash); err != nil {
		t.Fatalf("read stored session: %v", err)
	}
	if len(storedHash) != 32 {
		t.Fatalf("stored hash length = %d, want 32", len(storedHash))
	}
	if string(storedHash) == session.Token {
		t.Fatal("database contains the plain session token")
	}

	gotUserID, err := service.Authenticate(ctx, session.Token)
	if err != nil {
		t.Fatalf("Authenticate() error = %v", err)
	}
	if gotUserID != userID {
		t.Fatalf("Authenticate() user ID = %q, want %q", gotUserID, userID)
	}

	if err := service.Delete(ctx, session.Token); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if _, err := service.Authenticate(ctx, session.Token); err != ErrSessionNotFound {
		t.Fatalf("Authenticate() after delete error = %v, want ErrSessionNotFound", err)
	}
}
