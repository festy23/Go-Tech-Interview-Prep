package task12_rate_limiter

import (
	"testing"
	"time"
)

func TestRateLimiter_Basic(t *testing.T) {
	rl := NewRateLimiter(3, 100*time.Millisecond)

	for i := range 3 {
		if !rl.Allow() {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
	if rl.Allow() {
		t.Fatal("4th request should be rejected")
	}
}

func TestRateLimiter_WindowExpiry(t *testing.T) {
	rl := NewRateLimiter(2, 50*time.Millisecond)

	if !rl.Allow() {
		t.Fatal("1st request should be allowed")
	}
	if !rl.Allow() {
		t.Fatal("2nd request should be allowed")
	}
	if rl.Allow() {
		t.Fatal("3rd request should be rejected")
	}

	time.Sleep(60 * time.Millisecond)

	if !rl.Allow() {
		t.Fatal("request after window expiry should be allowed")
	}
}

func TestRateLimiter_SingleRequest(t *testing.T) {
	rl := NewRateLimiter(1, 100*time.Millisecond)

	if !rl.Allow() {
		t.Fatal("first request should be allowed")
	}
	if rl.Allow() {
		t.Fatal("second request should be rejected")
	}

	time.Sleep(110 * time.Millisecond)
	if !rl.Allow() {
		t.Fatal("request after window should be allowed")
	}
}

func TestRateLimiter_HighLimit(t *testing.T) {
	rl := NewRateLimiter(100, 1*time.Second)

	for i := range 100 {
		if !rl.Allow() {
			t.Fatalf("request %d should be allowed within limit 100", i+1)
		}
	}
	if rl.Allow() {
		t.Fatal("101st request should be rejected")
	}
}

func TestRateLimiter_SlidingWindow(t *testing.T) {
	rl := NewRateLimiter(2, 80*time.Millisecond)

	rl.Allow() // t=0
	time.Sleep(50 * time.Millisecond)
	rl.Allow() // t=50ms

	time.Sleep(40 * time.Millisecond)
	// t=90ms: first request expired (was at t=0, window=80ms)
	if !rl.Allow() {
		t.Fatal("should allow after first request expired from window")
	}
}
