package httpserver

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/HikaruSuna/teacher_app/backend/internal/auth"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAuthenticationFlowWithPostgres(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(pool.Close)

	passwordHash, err := auth.HashPassword("integration-password")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	loginID := "api" + strconv.FormatInt(time.Now().UnixNano(), 10) + "@teacher.com"
	var userID string
	err = pool.QueryRow(ctx, `
		insert into users (login_id, role, full_name, password_hash)
		values ($1, 'teacher', 'APIテスト先生', $2)
		returning id::text
	`, loginID, passwordHash).Scan(&userID)
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		_, _ = pool.Exec(cleanupCtx, `delete from users where id = $1`, userID)
	})

	sessionRepository := auth.NewPostgresSessionRepository(pool)
	sessionService, err := auth.NewSessionService(sessionRepository, 12*time.Hour)
	if err != nil {
		t.Fatalf("create session service: %v", err)
	}
	authentication := auth.NewService(auth.NewPostgresUserRepository(pool), sessionService)
	handler := New(pool, authentication, "http://localhost:5173", testLogger())

	loginRequest := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(
		`{"login_id":"`+loginID+`","password":"integration-password"}`,
	))
	loginRequest.Header.Set("Origin", "http://localhost:5173")
	loginResponse := httptest.NewRecorder()
	handler.ServeHTTP(loginResponse, loginRequest)
	if loginResponse.Code != http.StatusOK {
		t.Fatalf("login status = %d, body = %s", loginResponse.Code, loginResponse.Body.String())
	}
	cookies := loginResponse.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("login cookie count = %d", len(cookies))
	}

	meRequest := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meRequest.AddCookie(cookies[0])
	meResponse := httptest.NewRecorder()
	handler.ServeHTTP(meResponse, meRequest)
	if meResponse.Code != http.StatusOK || !strings.Contains(meResponse.Body.String(), loginID) {
		t.Fatalf("me status = %d, body = %s", meResponse.Code, meResponse.Body.String())
	}

	logoutRequest := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	logoutRequest.Header.Set("Origin", "http://localhost:5173")
	logoutRequest.AddCookie(cookies[0])
	logoutResponse := httptest.NewRecorder()
	handler.ServeHTTP(logoutResponse, logoutRequest)
	if logoutResponse.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d", logoutResponse.Code)
	}

	meAfterLogout := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meAfterLogout.AddCookie(cookies[0])
	meAfterLogoutResponse := httptest.NewRecorder()
	handler.ServeHTTP(meAfterLogoutResponse, meAfterLogout)
	if meAfterLogoutResponse.Code != http.StatusUnauthorized {
		t.Fatalf("me after logout status = %d", meAfterLogoutResponse.Code)
	}
}
