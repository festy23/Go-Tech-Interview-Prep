package task13_safe_map

// SafeMap is a concurrency-safe map[string]int.
// All methods must be safe for concurrent use from multiple goroutines.
type SafeMap struct {
	// TODO: implement fields (hint: sync.RWMutex + map)
}

// NewSafeMap creates a new SafeMap.
func NewSafeMap() *SafeMap {
	// TODO: implement
	return &SafeMap{}
}

// Set stores key-value pair.
func (m *SafeMap) Set(key string, value int) {
	// TODO: implement
}

// Get returns (value, true) if key exists, otherwise (0, false).
func (m *SafeMap) Get(key string) (int, bool) {
	// TODO: implement
	return 0, false
}

// Delete removes a key.
func (m *SafeMap) Delete(key string) {
	// TODO: implement
}

// Len returns the number of stored keys.
func (m *SafeMap) Len() int {
	// TODO: implement
	return 0
}
