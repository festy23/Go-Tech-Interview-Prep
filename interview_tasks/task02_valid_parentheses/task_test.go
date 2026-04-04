package task02_valid_parentheses

import "testing"

func TestIsValidParentheses(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want bool
	}{
		{"empty", "", true},
		{"all_types", "()[]{}", true},
		{"nested", "([{}])", true},
		{"mismatch", "(]", false},
		{"wrong_order", "([)]", false},
		{"unclosed", "((", false},
		{"single_open", "(", false},
		{"single_close", ")", false},
		{"deep_nesting", "((((((()))))))", true},
		{"only_closes", "))))", false},
		{"only_opens", "((((", false},
		{"close_before_open", ")(", false},
		{"complex_valid", "{[()]}([]{})", true},
		{"complex_invalid", "{[(])}", false},
		{"repeated_pairs", "()()()", true},
		{"mixed_invalid_end", "()[]{)(", false},
		{"single_pair_round", "()", true},
		{"single_pair_square", "[]", true},
		{"single_pair_curly", "{}", true},
		{"long_balanced", "([{()}])[{()}]([{()}])", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsValidParentheses(tc.in); got != tc.want {
				t.Fatalf("IsValidParentheses(%q)=%v, want %v", tc.in, got, tc.want)
			}
		})
	}
}
