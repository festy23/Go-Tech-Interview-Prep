package task02_valid_parentheses

// IsValidParentheses reports whether brackets are balanced.
// Allowed brackets: (), [], {}
func IsValidParentheses(s string) bool {

	stack := []rune{}

	for _, v := range s {
		if v == '(' || v == '[' || v == '{' {
			stack = append(stack, v)
		} else {
			if len(stack) == 0 {
				return false
			}
			last_brace := stack[len(stack)-1]
			if v == ')' && last_brace != '(' {
				return false
			}
			if v == ']' && last_brace != '[' {
				return false
			}
			if v == '}' && last_brace != '{' {
				return false
			}
			stack = stack[:len(stack)-1]
		}
	}
	return len(stack) == 0
}
