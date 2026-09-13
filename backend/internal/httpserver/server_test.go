package httpserver

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type databaseStub struct {
	err error
}

func (d databaseStub) Ping(context.Context) error {
	return d.err
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(io.Discard, nil))
}

func TestHealth(t *testing.T) {
	handler := New(databaseStub{}, nil, "http://localhost:5173", testLogger())
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	request.Header.Set("Origin", "http://localhost:5173")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if !strings.Contains(response.Body.String(), `"database":"connected"`) {
		t.Fatalf("body = %s", response.Body.String())
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatal("expected allowed frontend origin")
	}
	if response.Header().Get("X-Request-ID") == "" {
		t.Fatal("expected request ID")
	}
}

func TestHealthWhenDatabaseIsUnavailable(t *testing.T) {
	handler := New(databaseStub{err: errors.New("unavailable")}, nil, "http://localhost:5173", testLogger())
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
	if !strings.Contains(response.Body.String(), `"code":"database_unavailable"`) {
		t.Fatalf("body = %s", response.Body.String())
	}
}
