package httpserver

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/HikaruSuna/teacher_app/backend/internal/auth"
)

type authenticationStub struct {
	loginUser     auth.User
	loginSession  auth.Session
	loginError    error
	loginCalls    int
	loginID       string
	loginPassword string
	currentUser   auth.User
	currentError  error
	currentToken  string
	logoutToken   string
	logoutError   error
}

func (s *authenticationStub) Login(_ context.Context, loginID, password string) (auth.User, auth.Session, error) {
	s.loginCalls++
	s.loginID = loginID
	s.loginPassword = password
	return s.loginUser, s.loginSession, s.loginError
}

func (s *authenticationStub) CurrentUser(_ context.Context, token string) (auth.User, error) {
	s.currentToken = token
	return s.currentUser, s.currentError
}

func (s *authenticationStub) Logout(_ context.Context, token string) error {
	s.logoutToken = token
	return s.logoutError
}

func TestLoginSetsSessionCookieAndReturnsPublicUser(t *testing.T) {
	authentication := &authenticationStub{
		loginUser: auth.User{
			ID: "user-1", LoginID: "teacher1@teacher.com", FullName: "先生",
			Role: "teacher", PasswordHash: "must-not-be-returned", IsActive: true,
		},
		loginSession: auth.Session{Token: "plain-session-token", ExpiresAt: time.Now().Add(12 * time.Hour)},
	}
	handler := New(databaseStub{}, authentication, "http://localhost:5173", testLogger())
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login",
		strings.NewReader(`{"login_id":" Teacher1@Teacher.com ","password":"secret"}`))
	request.Header.Set("Origin", "http://localhost:5173")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if authentication.loginID != "teacher1@teacher.com" || authentication.loginPassword != "secret" {
		t.Fatalf("login input = %q / %q", authentication.loginID, authentication.loginPassword)
	}
	if strings.Contains(response.Body.String(), "must-not-be-returned") {
		t.Fatal("response contains the password hash")
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookie count = %d", len(cookies))
	}
	cookie := cookies[0]
	if cookie.Name != sessionCookieName || cookie.Value != "plain-session-token" || !cookie.HttpOnly {
		t.Fatalf("session cookie = %#v", cookie)
	}
	if cookie.SameSite != http.SameSiteLaxMode || cookie.MaxAge <= 0 {
		t.Fatalf("session cookie attributes = %#v", cookie)
	}
}

func TestLoginRejectsInvalidCredentialsAndLimitsAttempts(t *testing.T) {
	authentication := &authenticationStub{loginError: auth.ErrInvalidCredentials}
	handler := New(databaseStub{}, authentication, "http://localhost:5173", testLogger())

	for attempt := 1; attempt <= 6; attempt++ {
		request := httptest.NewRequest(http.MethodPost, "/api/auth/login",
			strings.NewReader(`{"login_id":"student1@student.com","password":"wrong"}`))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)

		wantStatus := http.StatusUnauthorized
		if attempt == 6 {
			wantStatus = http.StatusTooManyRequests
		}
		if response.Code != wantStatus {
			t.Fatalf("attempt %d status = %d, want %d", attempt, response.Code, wantStatus)
		}
	}
	if authentication.loginCalls != 5 {
		t.Fatalf("Login() calls = %d, want 5", authentication.loginCalls)
	}
}

func TestCurrentUserUsesSessionCookie(t *testing.T) {
	authentication := &authenticationStub{currentUser: auth.User{
		ID: "user-2", LoginID: "student1@student.com", FullName: "生徒", Role: "student", IsActive: true,
	}}
	handler := New(databaseStub{}, authentication, "http://localhost:5173", testLogger())
	request := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "session-token"})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK || authentication.currentToken != "session-token" {
		t.Fatalf("status = %d, token = %q", response.Code, authentication.currentToken)
	}
	if !strings.Contains(response.Body.String(), `"role":"student"`) {
		t.Fatalf("body = %s", response.Body.String())
	}
}

func TestCurrentUserRejectsMissingOrInvalidSession(t *testing.T) {
	tests := []struct {
		name           string
		authentication *authenticationStub
		withCookie     bool
	}{
		{name: "missing cookie", authentication: &authenticationStub{}},
		{name: "invalid session", authentication: &authenticationStub{currentError: auth.ErrUnauthenticated}, withCookie: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler := New(databaseStub{}, test.authentication, "http://localhost:5173", testLogger())
			request := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
			if test.withCookie {
				request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "invalid"})
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d", response.Code)
			}
		})
	}
}

func TestLogoutDeletesSessionAndClearsCookie(t *testing.T) {
	authentication := &authenticationStub{}
	handler := New(databaseStub{}, authentication, "http://localhost:5173", testLogger())
	request := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	request.Header.Set("Origin", "http://localhost:5173")
	request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "session-token"})
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent || authentication.logoutToken != "session-token" {
		t.Fatalf("status = %d, token = %q", response.Code, authentication.logoutToken)
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 || cookies[0].MaxAge != -1 || cookies[0].Value != "" {
		t.Fatalf("cleared cookie = %#v", cookies)
	}
}

func TestAuthenticationRejectsUnknownJSONAndForeignOrigin(t *testing.T) {
	authentication := &authenticationStub{}
	handler := New(databaseStub{}, authentication, "http://localhost:5173", testLogger())

	unknownField := httptest.NewRequest(http.MethodPost, "/api/auth/login",
		strings.NewReader(`{"login_id":"student1@student.com","password":"secret","admin":true}`))
	unknownResponse := httptest.NewRecorder()
	handler.ServeHTTP(unknownResponse, unknownField)
	if unknownResponse.Code != http.StatusBadRequest {
		t.Fatalf("unknown field status = %d", unknownResponse.Code)
	}

	foreignOrigin := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	foreignOrigin.Header.Set("Origin", "https://example.com")
	foreignResponse := httptest.NewRecorder()
	handler.ServeHTTP(foreignResponse, foreignOrigin)
	if foreignResponse.Code != http.StatusForbidden {
		t.Fatalf("foreign origin status = %d", foreignResponse.Code)
	}
}

func TestAuthenticationReturnsInternalError(t *testing.T) {
	authentication := &authenticationStub{loginError: errors.New("database failed")}
	handler := New(databaseStub{}, authentication, "http://localhost:5173", testLogger())
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login",
		strings.NewReader(`{"login_id":"student1@student.com","password":"secret"}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d", response.Code)
	}
}
