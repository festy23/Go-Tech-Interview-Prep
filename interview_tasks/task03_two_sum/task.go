package task03_two_sum

// TwoSum returns indices of two numbers such that they add to target.
// Return nil if no pair exists.
func TwoSum(nums []int, target int) []int {
	mp := make(map[int]int)
	//TwoSum([2 7 11 15],9)=[], want [0 1]
	for i, n := range nums { // nums = [2 7 11 15]
		if v, flag := mp[target-n]; flag { // число target-n есть в мапе
			return []int{v, i}
		}
		mp[n] = i // числа нет в мапе
	}
	return nil
}
