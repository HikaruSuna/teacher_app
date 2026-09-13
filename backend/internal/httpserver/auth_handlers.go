package httpserver

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/HikaruSuna/teacher_app/backend/internal/auth"
)

const (
	sessionCookieName = "tutor_session"
	maxLoginBodySize  = 16 * 1024
)

type loginRequest struct {
	LoginID  string `json:"login_id"`
	Password string `json:"password"`
}

type userResponse struct {
	ID       string `json:"id"`
	LoginID  string `json:"login_id"`
	FullName string `json:"full_name"`
	Role     string `json:"role"`
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var input loginRequest
	if err := decodeJSON(w, r, &input); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid_request", "login ID and password are required")
		return
	}

	input.LoginID = strings.ToLower(strings.TrimSpace(input.LoginID))
	if input.LoginID == "" || input.Password == "" {
		s.writeError(w, http.StatusBadRequest, "invalid_request", "login ID and password are required")
		return
	}

	allowed, retryAfter := s.loginLimiter.allow(input.LoginID)
	if !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(max(1, int(retryAfter.Seconds()))))
		s.writeError(w, http.StatusTooManyRequests, "too_many_attempts", "try again later")
		return
	}

	user, session, err := s.authentication.Login(r.Context(), input.LoginID, input.Password)
	if errors.Is(err, auth.ErrInvalidCredentials) {
		s.loginLimiter.failure(input.LoginID)
		s.writeError(w, http.StatusUnauthorized, "invalid_credentials", "login ID or password is incorrect")
		return
	}
	if err != nil {
		s.logger.Error("login failed", "error", err)
		s.writeError(w, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}

	s.loginLimiter.reset(input.LoginID)
	setSessionCookie(w, session)
	s.writeJSON(w, http.StatusOK, map[string]any{"user": publicUser(user)})
}

func (s *Server) currentUser(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		s.writeError(w, http.StatusUnauthorized, "unauthenticated", "login is required")
		return
	}

	user, err := s.authentication.CurrentUser(r.Context(), cookie.Value)
	if errors.Is(err, auth.ErrUnauthenticated) {
		s.writeError(w, http.StatusUnauthorized, "unauthenticated", "login is required")
		return
	}
	if err != nil {
		s.logger.Error("get current user", "error", err)
		s.writeError(w, http.StatusInternalServerError, "internal_error", "failed to get current user")
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]any{"user": publicUser(user)})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil && cookie.Value != "" {
		if err := s.authentication.Logout(r.Context(), cookie.Value); err != nil {
			s.logger.Error("logout failed", "error", err)
			s.writeError(w, http.StatusInternalServerError, "internal_error", "logout failed")
			return
		}
	}

	clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, destination any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxLoginBodySize)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("request must contain one JSON object")
	}
	return nil
}

func publicUser(user auth.User) userResponse {
	return userResponse{ID: user.ID, LoginID: user.LoginID, FullName: user.FullName, Role: user.Role}
}

func setSessionCookie(w http.ResponseWriter, session auth.Session) {
	maxAge := max(1, int(time.Until(session.ExpiresAt).Seconds()))
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    session.Token,
		Path:     "/",
		Expires:  session.ExpiresAt,
		MaxAge:   maxAge,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(1, 0).UTC(),
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}
