package task08_lru_cache

// LRUCache keeps most recently used keys.
// Get returns (value, true) if exists, otherwise (0, false).
type LRUCache struct {
	// TODO: implement O(1) get/put using hashmap + doubly linked list
}

func NewLRUCache(capacity int) *LRUCache {
	return &LRUCache{}
}

func (c *LRUCache) Get(key int) (int, bool) {
	return 0, false
}

func (c *LRUCache) Put(key int, value int) {
}
