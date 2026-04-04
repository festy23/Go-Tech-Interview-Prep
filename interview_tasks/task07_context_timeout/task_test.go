package task07_context_timeout

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestRunWithTimeout_Success(t *testing.T) {
	got, err := RunWithTimeout(100*time.Millisecond, func() (string, error) {
		time.Sleep(10 * time.Millisecond)
		return "ok", nil
	})
	if err != nil || got != "ok" {
		t.Fatalf("got (%q,%v), want (ok,nil)", got, err)
	}
}

func TestRunWithTimeout_Deadline(t *testing.T) {
	_, err := RunWithTimeout(20*time.Millisecond, func() (string, error) {
		time.Sleep(100 * time.Millisecond)
		return "late", nil
	})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("want DeadlineExceeded, got %v", err)
	}
}

func TestRunWithTimeout_FnReturnsError(t *testing.T) {
	fnErr := errors.New("something broke")
	got, err := RunWithTimeout(100*time.Millisecond, func() (string, error) {
		return "", fnErr
	})
	if !errors.Is(err, fnErr) {
		t.Fatalf("want fn error, got %v", err)
	}
	if got != "" {
		t.Fatalf("want empty string on error, got %q", got)
	}
}

func TestRunWithTimeout_InstantSuccess(t *testing.T) {
	got, err := RunWithTimeout(50*time.Millisecond, func() (string, error) {
		return "instant", nil
	})
	if err != nil || got != "instant" {
		t.Fatalf("got (%q,%v), want (instant,nil)", got, err)
	}
}

func TestRunWithTimeout_ZeroTimeout(t *testing.T) {
	_, err := RunWithTimeout(0, func() (string, error) {
		time.Sleep(10 * time.Millisecond)
		return "ok", nil
	})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("want DeadlineExceeded for zero timeout, got %v", err)
	}
}

func TestRunWithTimeout_ResultNotCorrupted(t *testing.T) {
	longStr := "this is a longer result string that should be returned intact"
	got, err := RunWithTimeout(200*time.Millisecond, func() (string, error) {
		time.Sleep(10 * time.Millisecond)
		return longStr, nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != longStr {
		t.Fatalf("result corrupted: got %q", got)
	}
}
