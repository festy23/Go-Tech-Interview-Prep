package task13_safe_map

import (
	"fmt"
	"sync"
	"testing"
)

func TestSafeMap_Basic(t *testing.T) {
	m := NewSafeMap()
	m.Set("a", 1)
	m.Set("b", 2)

	if v, ok := m.Get("a"); !ok || v != 1 {
		t.Fatalf("Get(a)=(%d,%v), want (1,true)", v, ok)
	}
	if v, ok := m.Get("b"); !ok || v != 2 {
		t.Fatalf("Get(b)=(%d,%v), want (2,true)", v, ok)
	}
	if _, ok := m.Get("c"); ok {
		t.Fatal("Get(c) should return false")
	}
}

func TestSafeMap_Delete(t *testing.T) {
	m := NewSafeMap()
	m.Set("x", 10)
	m.Delete("x")

	if _, ok := m.Get("x"); ok {
		t.Fatal("key x should be deleted")
	}
	if m.Len() != 0 {
		t.Fatalf("Len()=%d, want 0", m.Len())
	}
}

func TestSafeMap_Overwrite(t *testing.T) {
	m := NewSafeMap()
	m.Set("k", 1)
	m.Set("k", 2)

	if v, _ := m.Get("k"); v != 2 {
		t.Fatalf("Get(k)=%d, want 2 after overwrite", v)
	}
	if m.Len() != 1 {
		t.Fatalf("Len()=%d, want 1", m.Len())
	}
}

func TestSafeMap_Len(t *testing.T) {
	m := NewSafeMap()
	if m.Len() != 0 {
		t.Fatalf("empty map Len()=%d, want 0", m.Len())
	}
	m.Set("a", 1)
	m.Set("b", 2)
	m.Set("c", 3)
	if m.Len() != 3 {
		t.Fatalf("Len()=%d, want 3", m.Len())
	}
}

func TestSafeMap_ConcurrentReadWrite(t *testing.T) {
	m := NewSafeMap()
	var wg sync.WaitGroup

	// concurrent writers
	for i := range 100 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			m.Set(fmt.Sprintf("key-%d", i), i)
		}(i)
	}

	// concurrent readers
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			m.Get("key-0")
			m.Len()
		}()
	}

	wg.Wait()

	if m.Len() != 100 {
		t.Fatalf("Len()=%d, want 100 after concurrent writes", m.Len())
	}
}

func TestSafeMap_ConcurrentDelete(t *testing.T) {
	m := NewSafeMap()
	for i := range 50 {
		m.Set(fmt.Sprintf("key-%d", i), i)
	}

	var wg sync.WaitGroup
	for i := range 50 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			m.Delete(fmt.Sprintf("key-%d", i))
		}(i)
	}
	wg.Wait()

	if m.Len() != 0 {
		t.Fatalf("Len()=%d, want 0 after deleting all keys", m.Len())
	}
}

func TestSafeMap_DeleteNonExistent(t *testing.T) {
	m := NewSafeMap()
	m.Set("a", 1)
	m.Delete("nonexistent") // should not panic
	if m.Len() != 1 {
		t.Fatalf("Len()=%d, want 1", m.Len())
	}
}
