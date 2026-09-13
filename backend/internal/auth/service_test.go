package auth

import (
	"context"
	"errors"
	"testing"
	"time"
)

type userRepositoryStub struct {
	user User
	err  error
}

func (r userRepositoryStub) FindByLoginID(context.Context, string) (User, error) {
	return r.user, r.err
}

func (r userRepositoryStub) FindByID(context.Context, string) (User, error) {
	return r.user, r.err
}

func TestServiceLogin(t *testing.T) {
	passwordHash, err := HashPassword("strong password")
	if err != nil {
		t.Fatal(err)
	}
	users := userRepositoryStub{user: User{
		ID: "user-1", LoginID: "teacher1@teacher.com", Role: "teacher",
		FullName: "先生", PasswordHash: passwordHash, IsActive: true,
	}}
	repository := &sessionRepositoryStub{}
	sessions, _ := NewSessionService(repository, time.Hour)
	service := NewService(users, sessions)

	user, session, err := service.Login(context.Background(), " Teacher1@Teacher.com ", "strong password")
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if user.ID != "user-1" || session.Token == "" {
		t.Fatalf("Login() user = %#v, session = %#v", user, session)
	}
}

func TestServiceLoginRejectsInvalidCredentials(t *testing.T) {
	passwordHash, _ := HashPassword("correct password")
	sessions, _ := NewSessionService(&sessionRepositoryStub{}, time.Hour)

	tests := []struct {
		name     string
		users    userRepositoryStub
		password string
	}{
		{name: "unknown user", users: userRepositoryStub{err: ErrUserNotFound}, password: "wrong password"},
		{name: "wrong password", users: userRepositoryStub{user: User{PasswordHash: passwordHash, IsActive: true}}, password: "wrong password"},
		{name: "inactive user", users: userRepositoryStub{user: User{PasswordHash: passwordHash, IsActive: false}}, password: "correct password"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service := NewService(test.users, sessions)
			_, _, err := service.Login(context.Background(), "user@student.com", test.password)
			if !errors.Is(err, ErrInvalidCredentials) {
				t.Fatalf("Login() error = %v", err)
			}
		})
	}
}
