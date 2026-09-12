package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"time"
)

const sessionTokenLength = 32

var (
	ErrInvalidSessionLifetime = errors.New("session lifetime must be positive")
	ErrSessionRepository      = errors.New("session repository is required")
	ErrSessionNotFound        = errors.New("session not found")
	ErrUserIDRequired         = errors.New("user ID is required")
)

type Session struct {
	Token     string
	ExpiresAt time.Time
}

type SessionRepository interface {
	Create(context.Context, string, []byte, time.Time) error
	UserIDByTokenHash(context.Context, []byte, time.Time) (string, error)
	DeleteByTokenHash(context.Context, []byte) error
}

type SessionService struct {
	repository SessionRepository
	lifetime   time.Duration
	now        func() time.Time
	random     io.Reader
}

func NewSessionService(repository SessionRepository, lifetime time.Duration) (*SessionService, error) {
	if repository == nil {
		return nil, ErrSessionRepository
	}
	if lifetime <= 0 {
		return nil, ErrInvalidSessionLifetime
	}
	return &SessionService{
		repository: repository,
		lifetime:   lifetime,
		now:        time.Now,
		random:     rand.Reader,
	}, nil
}

func (s *SessionService) Create(ctx context.Context, userID string) (Session, error) {
	if userID == "" {
		return Session{}, ErrUserIDRequired
	}

	tokenBytes := make([]byte, sessionTokenLength)
	if _, err := io.ReadFull(s.random, tokenBytes); err != nil {
		return Session{}, fmt.Errorf("generate session token: %w", err)
	}

	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	tokenHash := hashSessionToken(token)
	expiresAt := s.now().UTC().Add(s.lifetime)

	if err := s.repository.Create(ctx, userID, tokenHash[:], expiresAt); err != nil {
		return Session{}, fmt.Errorf("store session: %w", err)
	}

	return Session{Token: token, ExpiresAt: expiresAt}, nil
}

func (s *SessionService) Authenticate(ctx context.Context, token string) (string, error) {
	if token == "" {
		return "", ErrSessionNotFound
	}
	tokenHash := hashSessionToken(token)
	return s.repository.UserIDByTokenHash(ctx, tokenHash[:], s.now().UTC())
}

func (s *SessionService) Delete(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	tokenHash := hashSessionToken(token)
	return s.repository.DeleteByTokenHash(ctx, tokenHash[:])
}

func hashSessionToken(token string) [sha256.Size]byte {
	return sha256.Sum256([]byte(token))
}
