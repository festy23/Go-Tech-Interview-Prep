package task03_two_sum

import (
	"reflect"
	"testing"
)

func TestTwoSum(t *testing.T) {
	tests := []struct {
		name   string
		nums   []int
		target int
		want   []int
	}{
		{"basic", []int{2, 7, 11, 15}, 9, []int{0, 1}},
		{"middle_pair", []int{3, 2, 4}, 6, []int{1, 2}},
		{"duplicates", []int{3, 3}, 6, []int{0, 1}},
		{"no_solution", []int{1, 2, 3}, 100, nil},
		{"negative_numbers", []int{-1, -2, -3, -4, -5}, -8, []int{2, 4}},
		{"mixed_signs", []int{-3, 4, 3, 90}, 0, []int{0, 2}},
		{"zero_target", []int{0, 4, 3, 0}, 0, []int{0, 3}},
		{"large_values", []int{1000000, 500000, -1000000, 999999}, 0, []int{0, 2}},
		{"first_and_last", []int{1, 5, 5, 11}, 12, []int{0, 3}},
		{"single_element", []int{5}, 5, nil},
		{"two_elements_no_match", []int{1, 3}, 5, nil},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := TwoSum(tc.nums, tc.target)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("TwoSum(%v,%d)=%v, want %v", tc.nums, tc.target, got, tc.want)
			}
		})
	}
}
