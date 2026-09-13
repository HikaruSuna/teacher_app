package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrUserNotFound = errors.New("user not found")

type User struct {
	ID           string
	LoginID      string
	Role         string
	FullName     string
	PasswordHash string
	IsActive     bool
}

type UserRepository interface {
	FindByLoginID(context.Context, string) (User, error)
	FindByID(context.Context, string) (User, error)
}

type PostgresUserRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresUserRepository(pool *pgxpool.Pool) *PostgresUserRepository {
	return &PostgresUserRepository{pool: pool}
}

func (r *PostgresUserRepository) FindByLoginID(ctx context.Context, loginID string) (User, error) {
	return r.find(ctx, `
		select id::text, login_id, role, full_name, password_hash, is_active
		from users where login_id = $1
	`, strings.ToLower(strings.TrimSpace(loginID)))
}

func (r *PostgresUserRepository) FindByID(ctx context.Context, id string) (User, error) {
	return r.find(ctx, `
		select id::text, login_id, role, full_name, password_hash, is_active
		from users where id = $1
	`, id)
}

func (r *PostgresUserRepository) find(ctx context.Context, query string, value string) (User, error) {
	var user User
	err := r.pool.QueryRow(ctx, query, value).Scan(
		&user.ID,
		&user.LoginID,
		&user.Role,
		&user.FullName,
		&user.PasswordHash,
		&user.IsActive,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUserNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("find user: %w", err)
	}
	return user, nil
}
