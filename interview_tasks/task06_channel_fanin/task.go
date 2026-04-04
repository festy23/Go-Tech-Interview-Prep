package task06_channel_fanin

// FanIn merges values from two input channels into one output channel.
// Close output only after both inputs are closed.
func FanIn(a, b <-chan int) <-chan int {
	out := make(chan int)

	close(out)
	return out
}
