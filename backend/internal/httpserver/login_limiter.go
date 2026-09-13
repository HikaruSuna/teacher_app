package httpserver

import (
	"sync"
	"time"
)

type loginAttempt struct {
	failures    int
	windowStart time.Time
}

type loginLimiter struct {
	mu       sync.Mutex
	attempts map[string]loginAttempt
	maximum  int
	window   time.Duration
	now      func() time.Time
}

func newLoginLimiter(maximum int, window time.Duration) *loginLimiter {
	return &loginLimiter{
		attempts: make(map[string]loginAttempt),
		maximum:  maximum,
		window:   window,
		now:      time.Now,
	}
}

func (l *loginLimiter) allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	attempt, exists := l.attempts[key]
	if !exists || now.Sub(attempt.windowStart) >= l.window {
		delete(l.attempts, key)
		return true, 0
	}
	if attempt.failures < l.maximum {
		return true, 0
	}
	return false, l.window - now.Sub(attempt.windowStart)
}

func (l *loginLimiter) failure(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	attempt, exists := l.attempts[key]
	if !exists || now.Sub(attempt.windowStart) >= l.window {
		l.attempts[key] = loginAttempt{failures: 1, windowStart: now}
		return
	}
	attempt.failures++
	l.attempts[key] = attempt
}

func (l *loginLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}
