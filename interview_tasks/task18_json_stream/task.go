package task18_json_stream

import "io"

// User represents a user record.
type User struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Active bool   `json:"active"`
}

// DecodeUsers reads a JSON array of User objects from r using streaming decoder.
// Must use json.Decoder (not json.Unmarshal) to handle large inputs efficiently.
// Returns only active users (Active == true).
func DecodeUsers(r io.Reader) ([]User, error) {
	// TODO: implement using json.NewDecoder + Token-based streaming
	return nil, nil
}
