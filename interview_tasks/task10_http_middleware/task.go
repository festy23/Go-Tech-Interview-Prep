package task10_http_middleware

import "net/http"

// AuthMiddleware checks X-API-Key header equals expectedKey.
// If key is invalid, return 401 and do not call next.
func AuthMiddleware(expectedKey string, next http.Handler) http.Handler {
	// TODO: implement middleware
	return next
}
