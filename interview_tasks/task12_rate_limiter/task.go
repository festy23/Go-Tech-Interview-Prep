package task12_rate_limiter

import "time"

// RateLimiter allows at most maxRequests calls to Allow() within the given window.
// Uses a sliding window approach.
type RateLimiter struct {
	// TODO: implement fields
}

// NewRateLimiter creates a rate limiter: maxRequests per window duration.
func NewRateLimiter(maxRequests int, window time.Duration) *RateLimiter {
	// TODO: implement
	return &RateLimiter{}
}

// Allow returns true if the request is within the rate limit, false otherwise.
func (r *RateLimiter) Allow() bool {
	// TODO: implement sliding window check
	return false
}
