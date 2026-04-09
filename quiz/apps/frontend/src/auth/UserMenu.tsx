import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from './AuthContext'

export function UserMenu() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (!user) return null

  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 py-1.5 px-3 bg-white/5 border border-white/8 rounded-xl cursor-pointer transition-all duration-200 hover:bg-white/10 hover:border-white/15"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-teal-400/20 text-teal-400 flex items-center justify-center text-xs font-semibold font-mono">
            {initials}
          </div>
        )}
        <span className="text-carbon-200 text-sm font-sans hidden min-[480px]:inline">
          {user.name}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-carbon-900 border border-white/10 rounded-xl shadow-lg overflow-hidden z-50 animate-fade-slide-up">
          <div className="px-4 py-3 border-b border-white/6">
            <p className="text-carbon-100 text-sm font-semibold font-sans truncate">
              {user.name}
            </p>
            {user.email && (
              <p className="text-carbon-400 text-xs font-sans truncate mt-0.5">
                {user.email}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setOpen(false)
              logout()
            }}
            className="w-full text-left px-4 py-2.5 text-carbon-300 text-sm font-sans cursor-pointer transition-colors duration-150 hover:bg-white/5 hover:text-carbon-100"
          >
            {t('auth.logout')}
          </button>
        </div>
      )}
    </div>
  )
}
