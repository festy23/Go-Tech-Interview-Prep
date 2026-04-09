import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from './AuthContext'

interface LoginModalProps {
  open: boolean
  onClose: () => void
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function YandexIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#FC3F1D"/>
      <path d="M13.5 7.08h-.92c-1.68 0-2.56.9-2.56 2.22 0 1.5.6 2.2 1.86 3.06l1.04.7L11.8 17H9.65l1.76-3.46c-1.56-1.1-2.44-2.2-2.44-3.84 0-2.24 1.54-3.62 4.12-3.62h2.4V17h-1.98V7.08z" fill="white"/>
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  )
}

const providers = [
  { id: 'google' as const, Icon: GoogleIcon },
  { id: 'yandex' as const, Icon: YandexIcon },
  { id: 'github' as const, Icon: GitHubIcon },
]

export function LoginModal({ open, onClose }: LoginModalProps) {
  const { t } = useTranslation()
  const { login } = useAuth()

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-carbon-900 border border-white/8 rounded-2xl p-8 w-full max-w-sm mx-4 shadow-[0_24px_48px_rgba(0,0,0,0.5)] animate-fade-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-carbon-400 hover:text-carbon-100 transition-colors text-xl leading-none cursor-pointer"
          aria-label="Close"
        >
          &times;
        </button>

        <h2 className="text-xl font-bold text-carbon-100 font-sans mb-2">
          {t('auth.loginTitle', 'Вход')}
        </h2>
        <p className="text-sm text-carbon-400 font-sans mb-6">
          {t('auth.loginSubtitle', 'Войдите, чтобы сохранить прогресс')}
        </p>

        <div className="flex flex-col gap-3">
          {providers.map(({ id, Icon }) => (
            <button
              key={id}
              onClick={() => login(id)}
              className="flex items-center gap-3 w-full py-3.5 px-5 bg-white/5 border border-white/8 rounded-xl text-carbon-100 text-sm font-semibold font-sans cursor-pointer transition-all duration-200 hover:bg-white/10 hover:border-white/15 hover:-translate-y-px"
            >
              <Icon />
              <span>{t('auth.continueWith', 'Продолжить через')} {t(`auth.${id}`)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
