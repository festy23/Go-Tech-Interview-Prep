package task05_merge_intervals

import (
	"reflect"
	"testing"
)

func TestMergeIntervals(t *testing.T) {
	tests := []struct {
		name string
		in   [][]int
		out  [][]int
	}{
		{"overlap_and_gap", [][]int{{1, 3}, {2, 6}, {8, 10}, {15, 18}}, [][]int{{1, 6}, {8, 10}, {15, 18}}},
		{"touch_boundary", [][]int{{1, 4}, {4, 5}}, [][]int{{1, 5}}},
		{"single_interval", [][]int{{1, 4}}, [][]int{{1, 4}}},
		{"all_overlap", [][]int{{1, 4}, {2, 5}, {3, 6}}, [][]int{{1, 6}}},
		{"no_overlap", [][]int{{1, 2}, {4, 5}, {7, 8}}, [][]int{{1, 2}, {4, 5}, {7, 8}}},
		{"unsorted_input", [][]int{{5, 8}, {1, 3}, {2, 6}}, [][]int{{1, 8}}},
		{"contained_interval", [][]int{{1, 10}, {2, 5}, {3, 7}}, [][]int{{1, 10}}},
		{"identical_intervals", [][]int{{1, 5}, {1, 5}}, [][]int{{1, 5}}},
		{"chain_merge", [][]int{{1, 2}, {2, 3}, {3, 4}, {4, 5}}, [][]int{{1, 5}}},
		{"large_gap", [][]int{{1, 2}, {100, 200}}, [][]int{{1, 2}, {100, 200}}},
		{"single_point_intervals", [][]int{{1, 1}, {2, 2}, {3, 3}}, [][]int{{1, 1}, {2, 2}, {3, 3}}},
		{"point_touches_range", [][]int{{1, 1}, {1, 5}}, [][]int{{1, 5}}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := MergeIntervals(tc.in)
			if !reflect.DeepEqual(got, tc.out) {
				t.Fatalf("MergeIntervals(%v)=%v, want %v", tc.in, got, tc.out)
			}
		})
	}
}
