package task08_lru_cache

import "testing"

func TestLRUCache(t *testing.T) {
	c := NewLRUCache(2)
	c.Put(1, 1)
	c.Put(2, 2)

	if v, ok := c.Get(1); !ok || v != 1 {
		t.Fatalf("expected key 1 = 1")
	}

	c.Put(3, 3) // evicts key 2
	if _, ok := c.Get(2); ok {
		t.Fatalf("expected key 2 to be evicted")
	}

	c.Put(4, 4) // evicts key 1
	if _, ok := c.Get(1); ok {
		t.Fatalf("expected key 1 to be evicted")
	}
	if v, ok := c.Get(3); !ok || v != 3 {
		t.Fatalf("expected key 3 = 3")
	}
	if v, ok := c.Get(4); !ok || v != 4 {
		t.Fatalf("expected key 4 = 4")
	}
}

func TestLRUCache_CapacityOne(t *testing.T) {
	c := NewLRUCache(1)
	c.Put(1, 10)
	if v, ok := c.Get(1); !ok || v != 10 {
		t.Fatalf("expected key 1 = 10")
	}

	c.Put(2, 20) // evicts key 1
	if _, ok := c.Get(1); ok {
		t.Fatalf("expected key 1 to be evicted")
	}
	if v, ok := c.Get(2); !ok || v != 20 {
		t.Fatalf("expected key 2 = 20")
	}
}

func TestLRUCache_UpdateExistingKey(t *testing.T) {
	c := NewLRUCache(2)
	c.Put(1, 1)
	c.Put(2, 2)
	c.Put(1, 100) // update key 1, should not evict

	if v, ok := c.Get(1); !ok || v != 100 {
		t.Fatalf("expected key 1 = 100 after update, got %d", v)
	}
	if v, ok := c.Get(2); !ok || v != 2 {
		t.Fatalf("expected key 2 = 2, got %d", v)
	}
}

func TestLRUCache_GetPromotesRecency(t *testing.T) {
	c := NewLRUCache(2)
	c.Put(1, 1)
	c.Put(2, 2)
	c.Get(1)     // promote key 1
	c.Put(3, 3)  // should evict key 2 (least recently used), NOT key 1

	if _, ok := c.Get(2); ok {
		t.Fatalf("expected key 2 evicted, not key 1")
	}
	if v, ok := c.Get(1); !ok || v != 1 {
		t.Fatalf("expected key 1 = 1")
	}
	if v, ok := c.Get(3); !ok || v != 3 {
		t.Fatalf("expected key 3 = 3")
	}
}

func TestLRUCache_PutPromotesRecency(t *testing.T) {
	c := NewLRUCache(3)
	c.Put(1, 1)
	c.Put(2, 2)
	c.Put(3, 3)
	c.Put(1, 10)  // update key 1 — promotes it
	c.Put(4, 4)   // should evict key 2 (oldest untouched)

	if _, ok := c.Get(2); ok {
		t.Fatalf("expected key 2 evicted")
	}
	if v, ok := c.Get(1); !ok || v != 10 {
		t.Fatalf("expected key 1 = 10")
	}
}

func TestLRUCache_MissReturnsZero(t *testing.T) {
	c := NewLRUCache(2)
	v, ok := c.Get(999)
	if ok {
		t.Fatalf("expected miss for key 999")
	}
	if v != 0 {
		t.Fatalf("expected 0 for missing key, got %d", v)
	}
}

func TestLRUCache_EvictionOrder(t *testing.T) {
	c := NewLRUCache(3)
	c.Put(1, 1)
	c.Put(2, 2)
	c.Put(3, 3)

	c.Get(1)
	c.Get(2)
	// access order: 3, 1, 2 — so 3 is LRU

	c.Put(4, 4) // evicts 3
	if _, ok := c.Get(3); ok {
		t.Fatalf("expected key 3 evicted")
	}

	c.Put(5, 5) // evicts 1
	if _, ok := c.Get(1); ok {
		t.Fatalf("expected key 1 evicted")
	}

	if v, ok := c.Get(2); !ok || v != 2 {
		t.Fatalf("expected key 2 = 2")
	}
	if v, ok := c.Get(4); !ok || v != 4 {
		t.Fatalf("expected key 4 = 4")
	}
	if v, ok := c.Get(5); !ok || v != 5 {
		t.Fatalf("expected key 5 = 5")
	}
}
