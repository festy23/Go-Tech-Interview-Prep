package task20_errgroup

import (
	"context"
	"errors"
	"sort"
	"sync/atomic"
	"testing"
	"time"
)

func TestFetchAll_Success(t *testing.T) {
	urls := []string{"http://a", "http://b", "http://c"}
	fetcher := func(ctx context.Context, url string) (string, error) {
		return "data-" + url, nil
	}

	results, err := FetchAll(context.Background(), urls, fetcher)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 3 {
		t.Fatalf("got %d results, want 3", len(results))
	}

	sort.Slice(results, func(i, j int) bool { return results[i].URL < results[j].URL })
	for i, url := range urls {
		if results[i].URL != url || results[i].Data != "data-"+url {
			t.Fatalf("results[%d]=%+v, want {%s data-%s}", i, results[i], url, url)
		}
	}
}

func TestFetchAll_OneError(t *testing.T) {
	fetchErr := errors.New("fetch failed")
	urls := []string{"http://ok1", "http://fail", "http://ok2"}
	fetcher := func(ctx context.Context, url string) (string, error) {
		if url == "http://fail" {
			return "", fetchErr
		}
		time.Sleep(50 * time.Millisecond)
		return "data", nil
	}

	_, err := FetchAll(context.Background(), urls, fetcher)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestFetchAll_CancelsOnError(t *testing.T) {
	var started atomic.Int64
	urls := []string{"http://fast-fail", "http://slow1", "http://slow2"}

	fetcher := func(ctx context.Context, url string) (string, error) {
		started.Add(1)
		if url == "http://fast-fail" {
			return "", errors.New("boom")
		}
		select {
		case <-time.After(5 * time.Second):
			return "data", nil
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}

	_, err := FetchAll(context.Background(), urls, fetcher)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestFetchAll_EmptyURLs(t *testing.T) {
	fetcher := func(ctx context.Context, url string) (string, error) {
		t.Fatal("fetcher should not be called")
		return "", nil
	}

	results, err := FetchAll(context.Background(), nil, fetcher)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("expected empty results, got %v", results)
	}
}

func TestFetchAll_ParentContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	urls := []string{"http://a"}
	fetcher := func(ctx context.Context, url string) (string, error) {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(5 * time.Second):
			return "data", nil
		}
	}

	_, err := FetchAll(ctx, urls, fetcher)
	if err == nil {
		t.Fatal("expected error from cancelled parent context")
	}
}

func TestFetchAll_SingleURL(t *testing.T) {
	fetcher := func(ctx context.Context, url string) (string, error) {
		return "result", nil
	}

	results, err := FetchAll(context.Background(), []string{"http://only"}, fetcher)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 || results[0].Data != "result" {
		t.Fatalf("got %+v, want [{http://only result}]", results)
	}
}

func TestFetchAll_AllErrors(t *testing.T) {
	urls := []string{"http://a", "http://b", "http://c"}
	fetcher := func(ctx context.Context, url string) (string, error) {
		return "", errors.New("fail")
	}

	_, err := FetchAll(context.Background(), urls, fetcher)
	if err == nil {
		t.Fatal("expected error when all fetches fail")
	}
}
