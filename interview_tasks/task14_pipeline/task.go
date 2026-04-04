package task14_pipeline

// Pipeline applies a chain of transform functions to each value from the input channel.
// Each stage reads from its input channel, applies the transform, and sends the result downstream.
// Returns the final output channel. The output channel must close when input is exhausted.
//
// Example: Pipeline(in, double, addOne) means each value goes through double, then addOne.
func Pipeline(in <-chan int, stages ...func(int) int) <-chan int {
	// TODO: implement channel pipeline
	out := make(chan int)
	close(out)
	return out
}
