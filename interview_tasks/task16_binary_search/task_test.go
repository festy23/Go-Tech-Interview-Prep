package task16_binary_search

import "testing"

func TestSearchRange(t *testing.T) {
	tests := []struct {
		name   string
		nums   []int
		target int
		want   [2]int
	}{
		{"multiple_occurrences", []int{5, 7, 7, 8, 8, 10}, 8, [2]int{3, 4}},
		{"not_found", []int{5, 7, 7, 8, 8, 10}, 6, [2]int{-1, -1}},
		{"empty_array", []int{}, 0, [2]int{-1, -1}},
		{"single_match", []int{1}, 1, [2]int{0, 0}},
		{"single_no_match", []int{2}, 1, [2]int{-1, -1}},
		{"all_same", []int{3, 3, 3, 3, 3}, 3, [2]int{0, 4}},
		{"first_element", []int{1, 2, 3, 4, 5}, 1, [2]int{0, 0}},
		{"last_element", []int{1, 2, 3, 4, 5}, 5, [2]int{4, 4}},
		{"three_in_middle", []int{1, 2, 2, 2, 3}, 2, [2]int{1, 3}},
		{"target_less_than_all", []int{5, 6, 7}, 1, [2]int{-1, -1}},
		{"target_greater_than_all", []int{5, 6, 7}, 10, [2]int{-1, -1}},
		{"two_elements_both_match", []int{4, 4}, 4, [2]int{0, 1}},
		{"long_array", []int{1, 1, 1, 2, 2, 3, 3, 3, 3, 4, 5, 5}, 3, [2]int{5, 8}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := SearchRange(tc.nums, tc.target)
			if got != tc.want {
				t.Fatalf("SearchRange(%v, %d) = %v, want %v", tc.nums, tc.target, got, tc.want)
			}
		})
	}
}
