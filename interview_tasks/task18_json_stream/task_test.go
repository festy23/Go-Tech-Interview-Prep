package task18_json_stream

import (
	"strings"
	"testing"
)

func TestDecodeUsers_Basic(t *testing.T) {
	input := `[
		{"id": 1, "name": "Alice", "active": true},
		{"id": 2, "name": "Bob", "active": false},
		{"id": 3, "name": "Charlie", "active": true}
	]`

	got, err := DecodeUsers(strings.NewReader(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("got %d users, want 2 active users", len(got))
	}
	if got[0].Name != "Alice" || got[0].ID != 1 {
		t.Fatalf("got[0]=%+v, want Alice(1)", got[0])
	}
	if got[1].Name != "Charlie" || got[1].ID != 3 {
		t.Fatalf("got[1]=%+v, want Charlie(3)", got[1])
	}
}

func TestDecodeUsers_AllInactive(t *testing.T) {
	input := `[
		{"id": 1, "name": "X", "active": false},
		{"id": 2, "name": "Y", "active": false}
	]`
	got, err := DecodeUsers(strings.NewReader(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("got %d users, want 0", len(got))
	}
}

func TestDecodeUsers_AllActive(t *testing.T) {
	input := `[
		{"id": 1, "name": "A", "active": true},
		{"id": 2, "name": "B", "active": true}
	]`
	got, err := DecodeUsers(strings.NewReader(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d users, want 2", len(got))
	}
}

func TestDecodeUsers_EmptyArray(t *testing.T) {
	input := `[]`
	got, err := DecodeUsers(strings.NewReader(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("got %d users, want 0", len(got))
	}
}

func TestDecodeUsers_InvalidJSON(t *testing.T) {
	input := `not json at all`
	_, err := DecodeUsers(strings.NewReader(input))
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestDecodeUsers_SingleUser(t *testing.T) {
	input := `[{"id": 42, "name": "Solo", "active": true}]`
	got, err := DecodeUsers(strings.NewReader(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0].ID != 42 || got[0].Name != "Solo" {
		t.Fatalf("got %+v, want [{42 Solo true}]", got)
	}
}

func TestDecodeUsers_ExtraFields(t *testing.T) {
	input := `[{"id": 1, "name": "Test", "active": true, "email": "test@example.com", "age": 25}]`
	got, err := DecodeUsers(strings.NewReader(input))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0].Name != "Test" {
		t.Fatalf("should ignore extra fields, got %+v", got)
	}
}
