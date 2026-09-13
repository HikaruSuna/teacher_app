package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUnauthenticated    = errors.New("unauthenticated")
)

type Service struct {
	users    UserRepository
	sessions *SessionService
}

func NewService(users UserRepository, sessions *SessionService) *Service {
	return &Service{users: users, sessions: sessions}
}

func (s *Service) Login(ctx context.Context, loginID, password string) (User, Session, error) {
	loginID = strings.ToLower(strings.TrimSpace(loginID))
	user, err := s.users.FindByLoginID(ctx, loginID)
	if errors.Is(err, ErrUserNotFound) {
		if password != "" {
			_, _ = HashPassword(password)
		}
		return User{}, Session{}, ErrInvalidCredentials
	}
	if err != nil {
		return User{}, Session{}, fmt.Errorf("find login user: %w", err)
	}

	matched, err := VerifyPassword(password, user.PasswordHash)
	if err != nil {
		return User{}, Session{}, fmt.Errorf("verify password: %w", err)
	}
	if !matched || !user.IsActive {
		return User{}, Session{}, ErrInvalidCredentials
	}

	session, err := s.sessions.Create(ctx, user.ID)
	if err != nil {
		return User{}, Session{}, fmt.Errorf("create session: %w", err)
	}
	return user, session, nil
}

func (s *Service) CurrentUser(ctx context.Context, token string) (User, error) {
	userID, err := s.sessions.Authenticate(ctx, token)
	if errors.Is(err, ErrSessionNotFound) {
		return User{}, ErrUnauthenticated
	}
	if err != nil {
		return User{}, fmt.Errorf("authenticate session: %w", err)
	}

	user, err := s.users.FindByID(ctx, userID)
	if errors.Is(err, ErrUserNotFound) || (err == nil && !user.IsActive) {
		return User{}, ErrUnauthenticated
	}
	if err != nil {
		return User{}, fmt.Errorf("find current user: %w", err)
	}
	return user, nil
}

func (s *Service) Logout(ctx context.Context, token string) error {
	if err := s.sessions.Delete(ctx, token); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}
