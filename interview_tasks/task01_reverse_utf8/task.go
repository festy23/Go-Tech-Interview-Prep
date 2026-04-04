package task01_reverse_utf8

// ReverseUTF8 returns input string reversed by runes (UTF-8 safe).
func ReverseUTF8(s string) string {
	runes := []rune(s)
	for i := range len(runes) / 2 {
		temp := runes[i]
		runes[i] = runes[len(runes)-i-1]
		runes[len(runes)-i-1] = temp
	}
	return string(runes)
}
