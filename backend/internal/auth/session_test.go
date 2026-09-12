package auth

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"testing"
	"time"
)

type sessionRepositoryStub struct {
	createdUserID    string
	createdTokenHash []byte
	createdExpiresAt time.Time
	lookupTokenHash  []byte
	lookupAt         time.Time
	lookupUserID     string
	lookupError      error
	deletedTokenHash []byte
}

func (r *sessionRepositoryStub) Create(
	_ context.Context,
	userID string,
	tokenHash []byte,
	expiresAt time.Time,
) error {
	r.createdUserID = userID
	r.createdTokenHash = append([]byte(nil), tokenHash...)
	r.createdExpiresAt = expiresAt
	return nil
}

func (r *sessionRepositoryStub) UserIDByTokenHash(
	_ context.Context,
	tokenHash []byte,
	at time.Time,
) (string, error) {
	r.lookupTokenHash = append([]byte(nil), tokenHash...)
	r.lookupAt = at
	return r.lookupUserID, r.lookupError
}

func (r *sessionRepositoryStub) DeleteByTokenHash(_ context.Context, tokenHash []byte) error {
	r.deletedTokenHash = append([]byte(nil), tokenHash...)
	return nil
}

func TestSessionServiceCreateStoresOnlyTokenHash(t *testing.T) {
	repository := &sessionRepositoryStub{}
	service, err := NewSessionService(repository, 12*time.Hour)
	if err != nil {
		t.Fatalf("NewSessionService() error = %v", err)
	}
	fixedNow := time.Date(2026, time.September, 13, 10, 0, 0, 0, time.FixedZone("JST", 9*60*60))
	service.now = func() time.Time { return fixedNow }
	service.random = bytes.NewReader(bytes.Repeat([]byte{0x42}, sessionTokenLength))

	session, err := service.Create(context.Background(), "37b8c221-67e2-4a70-a38d-1f933b0a2a28")
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if session.Token == "" {
		t.Fatal("Create() returned an empty token")
	}
	if repository.createdUserID != "37b8c221-67e2-4a70-a38d-1f933b0a2a28" {
		t.Fatalf("created user ID = %q", repository.createdUserID)
	}
	if len(repository.createdTokenHash) != sha256.Size {
		t.Fatalf("stored token hash length = %d", len(repository.createdTokenHash))
	}
	expectedHash := hashSessionToken(session.Token)
	if !bytes.Equal(repository.createdTokenHash, expectedHash[:]) {
		t.Fatal("repository did not receive the session token hash")
	}
	if bytes.Equal(repository.createdTokenHash, []byte(session.Token)) {
		t.Fatal("repository received the plain session token")
	}
	wantExpiry := fixedNow.UTC().Add(12 * time.Hour)
	if !session.ExpiresAt.Equal(wantExpiry) || !repository.createdExpiresAt.Equal(wantExpiry) {
		t.Fatalf("expiry = %v, want %v", session.ExpiresAt, wantExpiry)
	}
}

func TestSessionServiceHashesTokenForAuthenticationAndDeletion(t *testing.T) {
	repository := &sessionRepositoryStub{lookupUserID: "user-1"}
	service, err := NewSessionService(repository, time.Hour)
	if err != nil {
		t.Fatalf("NewSessionService() error = %v", err)
	}
	fixedNow := time.Date(2026, time.September, 13, 1, 0, 0, 0, time.UTC)
	service.now = func() time.Time { return fixedNow }

	userID, err := service.Authenticate(context.Background(), "plain-session-token")
	if err != nil {
		t.Fatalf("Authenticate() error = %v", err)
	}
	if userID != "user-1" {
		t.Fatalf("user ID = %q", userID)
	}
	expectedHash := hashSessionToken("plain-session-token")
	if !bytes.Equal(repository.lookupTokenHash, expectedHash[:]) {
		t.Fatal("Authenticate() did not hash the token")
	}
	if !repository.lookupAt.Equal(fixedNow) {
		t.Fatalf("lookup time = %v, want %v", repository.lookupAt, fixedNow)
	}

	if err := service.Delete(context.Background(), "plain-session-token"); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if !bytes.Equal(repository.deletedTokenHash, expectedHash[:]) {
		t.Fatal("Delete() did not hash the token")
	}
}

func TestSessionServiceRejectsInvalidInputs(t *testing.T) {
	repository := &sessionRepositoryStub{}
	if _, err := NewSessionService(nil, time.Hour); !errors.Is(err, ErrSessionRepository) {
		t.Fatalf("NewSessionService() error = %v, want ErrSessionRepository", err)
	}
	if _, err := NewSessionService(repository, 0); !errors.Is(err, ErrInvalidSessionLifetime) {
		t.Fatalf("NewSessionService() error = %v, want ErrInvalidSessionLifetime", err)
	}

	service, err := NewSessionService(repository, time.Hour)
	if err != nil {
		t.Fatalf("NewSessionService() error = %v", err)
	}
	if _, err := service.Create(context.Background(), ""); !errors.Is(err, ErrUserIDRequired) {
		t.Fatalf("Create() error = %v, want ErrUserIDRequired", err)
	}
	if _, err := service.Authenticate(context.Background(), ""); !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("Authenticate() error = %v, want ErrSessionNotFound", err)
	}
}
