import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { UserDTO } from '@quiz/shared'
import { fetchMe, refreshAuth, logoutAuth } from '../api/client'
import { getSessionId } from '../api/session'

interface AuthState {
  user: UserDTO | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (provider: 'google' | 'yandex' | 'github') => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Hydrate user on mount + handle ?auth=success callback
  useEffect(() => {
    let cancelled = false

    // Strip auth params from URL if present
    const params = new URLSearchParams(window.location.search)
    if (params.has('auth')) {
      params.delete('auth')
      params.delete('migrateSession')
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }

    async function hydrate() {
      let u = await fetchMe()
      if (!u) u = await refreshAuth()
      if (cancelled) return

      setUser(u)
      setIsLoading(false)
    }
    hydrate()
    return () => { cancelled = true }
  }, [])

  const login = useCallback((provider: 'google' | 'yandex' | 'github') => {
    const sessionId = getSessionId()
    window.location.href = `/api/auth/${provider}/login?sessionId=${sessionId}`
  }, [])

  const logout = useCallback(async () => {
    await logoutAuth()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
