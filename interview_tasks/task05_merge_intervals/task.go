package task05_merge_intervals

import (
	"cmp"
	"slices"
)

// MergeIntervals merges overlapping intervals.
// Input intervals are [start,end] inclusive.
func MergeIntervals(intervals [][]int) [][]int {
	// [0,1] [0, 10]  -> [0, 10]
	// [0, 10] [5, 9]
	// сортируем интервалы по началу, потом по концу
	slices.SortFunc(intervals, func(a, b []int) int {
		return cmp.Compare(a[0], b[0])
	})
	res := [][]int{}

	res = append(res, intervals[0])
	for i := 1; i < len(intervals); i++ {
		start, end := intervals[i][0], intervals[i][1]
		if start <= res[len(res)-1][1] { // old interval
			res[len(res)-1][1] = max(end, res[len(res)-1][1])
		} else { //start > prev_end -> new interval
			res = append(res, intervals[i])
		}
	}

	return res
}
