package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	argonMemory      = 64 * 1024
	argonIterations  = 3
	argonParallelism = 2
	argonSaltLength  = 16
	argonKeyLength   = 32
)

var (
	ErrPasswordRequired    = errors.New("password is required")
	ErrInvalidPasswordHash = errors.New("invalid password hash")
)

type passwordParameters struct {
	memory      uint32
	iterations  uint32
	parallelism uint8
	saltLength  uint32
	keyLength   uint32
}

var defaultPasswordParameters = passwordParameters{
	memory:      argonMemory,
	iterations:  argonIterations,
	parallelism: argonParallelism,
	saltLength:  argonSaltLength,
	keyLength:   argonKeyLength,
}

func HashPassword(password string) (string, error) {
	return hashPassword(password, defaultPasswordParameters)
}

func hashPassword(password string, parameters passwordParameters) (string, error) {
	if password == "" {
		return "", ErrPasswordRequired
	}

	salt := make([]byte, parameters.saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate password salt: %w", err)
	}

	key := argon2.IDKey(
		[]byte(password),
		salt,
		parameters.iterations,
		parameters.memory,
		parameters.parallelism,
		parameters.keyLength,
	)

	encodedSalt := base64.RawStdEncoding.EncodeToString(salt)
	encodedKey := base64.RawStdEncoding.EncodeToString(key)
	return fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		parameters.memory,
		parameters.iterations,
		parameters.parallelism,
		encodedSalt,
		encodedKey,
	), nil
}

func VerifyPassword(password, encodedHash string) (bool, error) {
	parameters, salt, expectedKey, err := parsePasswordHash(encodedHash)
	if err != nil {
		return false, err
	}

	actualKey := argon2.IDKey(
		[]byte(password),
		salt,
		parameters.iterations,
		parameters.memory,
		parameters.parallelism,
		uint32(len(expectedKey)),
	)

	return subtle.ConstantTimeCompare(actualKey, expectedKey) == 1, nil
}

func parsePasswordHash(encodedHash string) (passwordParameters, []byte, []byte, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return passwordParameters{}, nil, nil, ErrInvalidPasswordHash
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return passwordParameters{}, nil, nil, ErrInvalidPasswordHash
	}

	parameters := passwordParameters{}
	if _, err := fmt.Sscanf(
		parts[3],
		"m=%d,t=%d,p=%d",
		&parameters.memory,
		&parameters.iterations,
		&parameters.parallelism,
	); err != nil {
		return passwordParameters{}, nil, nil, ErrInvalidPasswordHash
	}
	canonicalParameters := fmt.Sprintf(
		"m=%d,t=%d,p=%d",
		parameters.memory,
		parameters.iterations,
		parameters.parallelism,
	)
	if parts[3] != canonicalParameters {
		return passwordParameters{}, nil, nil, ErrInvalidPasswordHash
	}

	if parameters.memory < 8*1024 || parameters.memory > 256*1024 ||
		parameters.iterations == 0 || parameters.iterations > 10 ||
		parameters.parallelism == 0 || parameters.parallelism > 8 {
		return passwordParameters{}, nil, nil, ErrInvalidPasswordHash
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < 16 || len(salt) > 64 {
		return passwordParameters{}, nil, nil, ErrInvalidPasswordHash
	}

	key, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(key) < 16 || len(key) > 64 {
		return passwordParameters{}, nil, nil, ErrInvalidPasswordHash
	}

	parameters.saltLength = uint32(len(salt))
	parameters.keyLength = uint32(len(key))
	return parameters, salt, key, nil
}
