import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { saveProgress, fetchMyProgress, migrateProgressToUser } from '../api/client'
import { getSessionId } from '../api/session'
import {
  loadProgress,
  saveBlockProgress,
  clearProgress,
  sessionProgressToMap,
  type ProgressMap,
  type BlockProgress,
} from './progress'

interface ProgressState {
  progress: ProgressMap
  isLoading: boolean
  recordProgress: (blockId: string, score: number, total: number, quizId: number | null) => void
}

const ProgressContext = createContext<ProgressState>({
  progress: {},
  isLoading: true,
  recordProgress: () => {},
})

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const [progress, setProgress] = useState<ProgressMap>({})
  const [isLoading, setIsLoading] = useState(true)
  const prevUserRef = useRef<string | null>(null)

  // Load progress when auth state resolves
  useEffect(() => {
    if (authLoading) return

    const currentUserId = user?.id ?? null
    const prevUserId = prevUserRef.current

    // Skip if user hasn't changed
    if (currentUserId === prevUserId && !isLoading) return
    prevUserRef.current = currentUserId

    let cancelled = false

    async function load() {
      if (currentUserId) {
        // Logged in → check if we need to migrate anonymous progress first
        if (prevUserId === null && prevUserId !== currentUserId) {
          // Transition: anonymous → authenticated (login just happened)
          const sessionId = getSessionId()
          await migrateProgressToUser(sessionId).catch(() => {})
          clearProgress()
        }
        // Fetch user progress from server
        try {
          const dto = await fetchMyProgress()
          if (!cancelled) setProgress(sessionProgressToMap(dto.byBlock))
        } catch {
          if (!cancelled) setProgress({})
        }
      } else {
        // Not logged in
        if (prevUserId !== null) {
          // Transition: authenticated → anonymous (logout just happened)
          clearProgress()
          if (!cancelled) setProgress({})
        } else {
          // Initial load as anonymous
          if (!cancelled) setProgress(loadProgress())
        }
      }
      if (!cancelled) setIsLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [user, authLoading])

  const recordProgress = useCallback(
    (blockId: string, score: number, total: number, quizId: number | null) => {
      const completedAt = new Date().toISOString()
      const entry: BlockProgress = { blockId, score, total, completedAt }

      // Optimistic update: only keep best score
      setProgress((prev) => {
        const existing = prev[blockId]
        if (existing && existing.score >= score) return prev
        return { ...prev, [blockId]: entry }
      })

      // Persist locally for anonymous users
      if (!isAuthenticated) {
        saveBlockProgress(entry)
      }

      // Sync to server (backend attaches userId via optionalAuth cookie)
      saveProgress({
        sessionId: getSessionId(),
        blockId,
        quizId,
        score,
        total,
      }).catch((err) => console.warn('[progress] Failed to sync:', err))
    },
    [isAuthenticated],
  )

  return (
    <ProgressContext.Provider value={{ progress, isLoading, recordProgress }}>
      {children}
    </ProgressContext.Provider>
  )
}

export function useProgress(): ProgressState {
  return useContext(ProgressContext)
}
