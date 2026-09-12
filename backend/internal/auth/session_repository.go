package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresSessionRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresSessionRepository(pool *pgxpool.Pool) *PostgresSessionRepository {
	return &PostgresSessionRepository{pool: pool}
}

func (r *PostgresSessionRepository) Create(
	ctx context.Context,
	userID string,
	tokenHash []byte,
	expiresAt time.Time,
) error {
	_, err := r.pool.Exec(ctx, `
		insert into sessions (user_id, token_hash, expires_at)
		values ($1, $2, $3)
	`, userID, tokenHash, expiresAt)
	if err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

func (r *PostgresSessionRepository) UserIDByTokenHash(
	ctx context.Context,
	tokenHash []byte,
	now time.Time,
) (string, error) {
	var userID string
	err := r.pool.QueryRow(ctx, `
		select sessions.user_id::text
		from sessions
		join users on users.id = sessions.user_id
		where sessions.token_hash = $1
		  and sessions.expires_at > $2
		  and users.is_active = true
	`, tokenHash, now).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrSessionNotFound
	}
	if err != nil {
		return "", fmt.Errorf("find session: %w", err)
	}
	return userID, nil
}

func (r *PostgresSessionRepository) DeleteByTokenHash(ctx context.Context, tokenHash []byte) error {
	if _, err := r.pool.Exec(ctx, `delete from sessions where token_hash = $1`, tokenHash); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}
