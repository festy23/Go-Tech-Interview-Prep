package task10_http_middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthMiddleware_OK(t *testing.T) {
	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusTeapot)
	})

	h := AuthMiddleware("secret", next)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-API-Key", "secret")
	rr := httptest.NewRecorder()

	h.ServeHTTP(rr, req)

	if !nextCalled {
		t.Fatalf("next handler must be called")
	}
	if rr.Code != http.StatusTeapot {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusTeapot)
	}
}

func TestAuthMiddleware_Unauthorized(t *testing.T) {
	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
	})

	h := AuthMiddleware("secret", next)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()

	h.ServeHTTP(rr, req)

	if nextCalled {
		t.Fatalf("next handler must not be called")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddleware_WrongKey(t *testing.T) {
	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
	})

	h := AuthMiddleware("secret", next)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-API-Key", "wrong-key")
	rr := httptest.NewRecorder()

	h.ServeHTTP(rr, req)

	if nextCalled {
		t.Fatalf("next handler must not be called with wrong key")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddleware_EmptyKey(t *testing.T) {
	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
	})

	h := AuthMiddleware("secret", next)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-API-Key", "")
	rr := httptest.NewRecorder()

	h.ServeHTTP(rr, req)

	if nextCalled {
		t.Fatalf("next handler must not be called with empty key")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddleware_PostMethod(t *testing.T) {
	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusCreated)
	})

	h := AuthMiddleware("my-key", next)
	req := httptest.NewRequest(http.MethodPost, "/api/data", nil)
	req.Header.Set("X-API-Key", "my-key")
	rr := httptest.NewRecorder()

	h.ServeHTTP(rr, req)

	if !nextCalled {
		t.Fatalf("next handler must be called with valid key")
	}
	if rr.Code != http.StatusCreated {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusCreated)
	}
}

func TestAuthMiddleware_CaseSensitive(t *testing.T) {
	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
	})

	h := AuthMiddleware("Secret", next)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-API-Key", "secret")
	rr := httptest.NewRecorder()

	h.ServeHTTP(rr, req)

	if nextCalled {
		t.Fatalf("key comparison must be case-sensitive")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rr.Code, http.StatusUnauthorized)
	}
}
