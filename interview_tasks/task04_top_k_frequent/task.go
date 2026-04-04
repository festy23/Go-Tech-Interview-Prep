package task04_top_k_frequent

// TopKFrequent returns k most frequent words.
import (
	"cmp"
	"slices"
)

func TopKFrequent(words []string, k int) []string {
	mp := make(map[string]int)

	for _, word := range words {
		mp[word]++
	}

	type Pair struct {
		Key   string
		Value int
	}
	pairs := make([]Pair, 0, len(mp))
	for k, v := range mp {
		pair := Pair{k, v}
		pairs = append(pairs, pair)
	}
	slices.SortFunc(pairs, func(a, b Pair) int {
		if a.Value != b.Value {
			return cmp.Compare(b.Value, a.Value)
		}
		return cmp.Compare(a.Key, b.Key)
	})

	ans := []string{}
	for i := range k {
		ans = append(ans, pairs[i].Key)
	}
	return ans
}
