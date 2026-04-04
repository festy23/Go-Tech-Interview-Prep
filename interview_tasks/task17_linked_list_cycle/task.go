package task17_linked_list_cycle

// ListNode represents a node in a singly linked list.
type ListNode struct {
	Val  int
	Next *ListNode
}

// HasCycle returns true if the linked list contains a cycle.
// Use Floyd's cycle detection algorithm (tortoise and hare).
func HasCycle(head *ListNode) bool {
	// TODO: implement Floyd's algorithm
	return false
}

// FindCycleStart returns the node where the cycle begins, or nil if no cycle.
func FindCycleStart(head *ListNode) *ListNode {
	// TODO: implement — find the entry point of the cycle
	return nil
}
