package auth

import (
	"errors"
	"strings"
	"testing"
)

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}
	if strings.Contains(hash, "correct horse battery staple") {
		t.Fatal("hash contains the plain password")
	}
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Fatalf("hash = %q, want Argon2id format", hash)
	}

	matched, err := VerifyPassword("correct horse battery staple", hash)
	if err != nil {
		t.Fatalf("VerifyPassword() error = %v", err)
	}
	if !matched {
		t.Fatal("VerifyPassword() = false for the correct password")
	}

	matched, err = VerifyPassword("wrong password", hash)
	if err != nil {
		t.Fatalf("VerifyPassword() wrong password error = %v", err)
	}
	if matched {
		t.Fatal("VerifyPassword() = true for a wrong password")
	}
}

func TestHashPasswordUsesUniqueSalt(t *testing.T) {
	first, err := HashPassword("same password")
	if err != nil {
		t.Fatalf("first HashPassword() error = %v", err)
	}
	second, err := HashPassword("same password")
	if err != nil {
		t.Fatalf("second HashPassword() error = %v", err)
	}
	if first == second {
		t.Fatal("HashPassword() returned identical hashes")
	}
}

func TestHashPasswordRejectsEmptyPassword(t *testing.T) {
	_, err := HashPassword("")
	if !errors.Is(err, ErrPasswordRequired) {
		t.Fatalf("HashPassword() error = %v, want ErrPasswordRequired", err)
	}
}

func TestVerifyPasswordRejectsInvalidHash(t *testing.T) {
	_, err := VerifyPassword("password", "not-a-password-hash")
	if !errors.Is(err, ErrInvalidPasswordHash) {
		t.Fatalf("VerifyPassword() error = %v, want ErrInvalidPasswordHash", err)
	}
}
