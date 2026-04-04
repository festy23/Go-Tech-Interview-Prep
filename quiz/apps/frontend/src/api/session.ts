/**
 * Anonymous session management.
 * Generates a UUID stored in localStorage — ties progress to this device.
 */
const SESSION_KEY = 'quiz_session_id'

export function getSessionId(): string {
  const stored = localStorage.getItem(SESSION_KEY)
  if (stored) return stored

  const id = crypto.randomUUID()
  localStorage.setItem(SESSION_KEY, id)
  return id
}
