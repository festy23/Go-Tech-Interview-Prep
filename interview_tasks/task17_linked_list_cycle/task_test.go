package task17_linked_list_cycle

import "testing"

func makeList(vals []int) *ListNode {
	if len(vals) == 0 {
		return nil
	}
	head := &ListNode{Val: vals[0]}
	curr := head
	for _, v := range vals[1:] {
		curr.Next = &ListNode{Val: v}
		curr = curr.Next
	}
	return head
}

func makeListWithCycle(vals []int, cycleAt int) (*ListNode, *ListNode) {
	head := makeList(vals)
	if cycleAt < 0 {
		return head, nil
	}

	var cycleNode *ListNode
	curr := head
	for i := 0; curr != nil; i++ {
		if i == cycleAt {
			cycleNode = curr
		}
		if curr.Next == nil {
			curr.Next = cycleNode
			break
		}
		curr = curr.Next
	}
	return head, cycleNode
}

func TestHasCycle(t *testing.T) {
	tests := []struct {
		name    string
		vals    []int
		cycleAt int
		want    bool
	}{
		{"no_cycle", []int{1, 2, 3, 4}, -1, false},
		{"cycle_at_start", []int{1, 2, 3}, 0, true},
		{"cycle_in_middle", []int{1, 2, 3, 4}, 1, true},
		{"cycle_at_last", []int{1, 2, 3}, 2, true},
		{"single_node_no_cycle", []int{1}, -1, false},
		{"single_node_self_cycle", []int{1}, 0, true},
		{"nil_head", nil, -1, false},
		{"two_nodes_cycle", []int{1, 2}, 0, true},
		{"two_nodes_no_cycle", []int{1, 2}, -1, false},
		{"long_list_cycle", []int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}, 3, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			head, _ := makeListWithCycle(tc.vals, tc.cycleAt)
			got := HasCycle(head)
			if got != tc.want {
				t.Fatalf("HasCycle()=%v, want %v", got, tc.want)
			}
		})
	}
}

func TestFindCycleStart(t *testing.T) {
	tests := []struct {
		name    string
		vals    []int
		cycleAt int
	}{
		{"no_cycle", []int{1, 2, 3}, -1},
		{"cycle_at_0", []int{1, 2, 3, 4}, 0},
		{"cycle_at_1", []int{1, 2, 3, 4}, 1},
		{"cycle_at_2", []int{1, 2, 3, 4, 5}, 2},
		{"single_self", []int{1}, 0},
		{"nil_list", nil, -1},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			head, cycleNode := makeListWithCycle(tc.vals, tc.cycleAt)
			got := FindCycleStart(head)
			if got != cycleNode {
				t.Fatalf("FindCycleStart() returned wrong node")
			}
		})
	}
}
