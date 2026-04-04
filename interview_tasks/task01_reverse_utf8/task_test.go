package task01_reverse_utf8

import "testing"

func TestReverseUTF8(t *testing.T) {
	tests := []struct {
		name string
		in   string
		out  string
	}{
		{"ascii", "golang", "gnalog"},
		{"unicode", "Привет", "тевирП"},
		{"emoji", "Go🙂👍", "👍🙂oG"},
		{"empty", "", ""},
		{"single_char", "x", "x"},
		{"single_rune", "Ы", "Ы"},
		{"palindrome", "abcba", "abcba"},
		{"spaces", "a b c", "c b a"},
		{"mixed_scripts", "Hello世界", "界世olleH"},
		{"numbers_and_letters", "abc123", "321cba"},
		{"only_emoji", "🎉🎊🎈", "🎈🎊🎉"},
		{"newlines_and_tabs", "a\nb\tc", "c\tb\na"},
		{"long_cyrillic", "Абракадабра", "арбадакарбА"},
		{"unicode_math_symbols", "∑∏∫√", "√∫∏∑"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ReverseUTF8(tc.in)
			if got != tc.out {
				t.Fatalf("ReverseUTF8(%q)=%q, want %q", tc.in, got, tc.out)
			}
		})
	}
}
