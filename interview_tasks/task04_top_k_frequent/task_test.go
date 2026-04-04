package task04_top_k_frequent

import (
	"reflect"
	"testing"
)

func TestTopKFrequent(t *testing.T) {
	tests := []struct {
		name  string
		words []string
		k     int
		want  []string
	}{
		{
			"basic_tie",
			[]string{"i", "love", "leetcode", "i", "love", "coding"},
			2,
			[]string{"i", "love"},
		},
		{
			"varied_frequency",
			[]string{"the", "day", "is", "sunny", "the", "the", "the", "sunny", "is", "is"},
			4,
			[]string{"the", "is", "sunny", "day"},
		},
		{
			"k_equals_1",
			[]string{"a", "b", "a", "c", "a"},
			1,
			[]string{"a"},
		},
		{
			"all_same_frequency",
			[]string{"c", "b", "a"},
			3,
			[]string{"a", "b", "c"},
		},
		{
			"single_word_repeated",
			[]string{"go", "go", "go"},
			1,
			[]string{"go"},
		},
		{
			"lexicographic_tiebreak",
			[]string{"banana", "apple", "cherry", "apple", "banana", "cherry"},
			2,
			[]string{"apple", "banana"},
		},
		{
			"k_equals_total_unique",
			[]string{"x", "y", "z", "x", "y", "x"},
			3,
			[]string{"x", "y", "z"},
		},
		{
			"many_ties",
			[]string{"d", "c", "b", "a", "d", "c", "b", "a"},
			2,
			[]string{"a", "b"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := TopKFrequent(tc.words, tc.k)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("TopKFrequent(%v, %d)=%v, want %v", tc.words, tc.k, got, tc.want)
			}
		})
	}
}
