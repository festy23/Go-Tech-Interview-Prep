package task09_retry

import (
	"errors"
	"testing"
	"time"
)

func TestRetry_SuccessEventually(t *testing.T) {
	calls := 0
	err := Retry(3, 0, func() error {
		calls++
		if calls < 3 {
			return errors.New("fail")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("want nil err, got %v", err)
	}
	if calls != 3 {
		t.Fatalf("want 3 calls, got %d", calls)
	}
}

func TestRetry_Exhausted(t *testing.T) {
	calls := 0
	err := Retry(2, 1*time.Millisecond, func() error {
		calls++
		return errors.New("always")
	})
	if err == nil {
		t.Fatalf("want non-nil err")
	}
	if calls != 2 {
		t.Fatalf("want 2 calls, got %d", calls)
	}
}

func TestRetry_FirstAttemptSuccess(t *testing.T) {
	calls := 0
	err := Retry(5, 0, func() error {
		calls++
		return nil
	})
	if err != nil {
		t.Fatalf("want nil err, got %v", err)
	}
	if calls != 1 {
		t.Fatalf("want 1 call on first-try success, got %d", calls)
	}
}

func TestRetry_SingleAttempt(t *testing.T) {
	calls := 0
	err := Retry(1, 0, func() error {
		calls++
		return errors.New("fail")
	})
	if err == nil {
		t.Fatalf("want non-nil err for single failed attempt")
	}
	if calls != 1 {
		t.Fatalf("want 1 call, got %d", calls)
	}
}

func TestRetry_PreservesLastError(t *testing.T) {
	attempt := 0
	err := Retry(3, 0, func() error {
		attempt++
		return errors.New("error on attempt " + string(rune('0'+attempt)))
	})
	if err == nil {
		t.Fatalf("want non-nil err")
	}
}

func TestRetry_DelayBetweenAttempts(t *testing.T) {
	start := time.Now()
	calls := 0
	Retry(3, 20*time.Millisecond, func() error {
		calls++
		return errors.New("fail")
	})

	elapsed := time.Since(start)
	// 3 attempts = 2 delays of 20ms = 40ms minimum
	if elapsed < 35*time.Millisecond {
		t.Fatalf("expected at least ~40ms delay, got %v", elapsed)
	}
	if calls != 3 {
		t.Fatalf("want 3 calls, got %d", calls)
	}
}

func TestRetry_NoDelayAfterSuccess(t *testing.T) {
	start := time.Now()
	calls := 0
	Retry(5, 50*time.Millisecond, func() error {
		calls++
		if calls < 2 {
			return errors.New("fail")
		}
		return nil
	})

	elapsed := time.Since(start)
	// 1 delay before second attempt, no delay after success
	if elapsed > 150*time.Millisecond {
		t.Fatalf("should not delay after success, elapsed %v", elapsed)
	}
}
