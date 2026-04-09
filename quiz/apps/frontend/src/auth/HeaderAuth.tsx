import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from './AuthContext'
import { UserMenu } from './UserMenu'
import { LoginModal } from './LoginModal'

export function HeaderAuth() {
  const { t } = useTranslation()
  const { isAuthenticated, isLoading } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)

  if (isLoading) return null

  if (isAuthenticated) {
    return (
      <div className="fixed top-4 right-20 z-[1000] max-[480px]:top-2.5 max-[480px]:right-16">
        <UserMenu />
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="fixed top-4 right-20 z-[1000] bg-carbon-750 text-carbon-100 border border-white/6 rounded-full px-[18px] py-2 text-[13px] font-semibold font-sans cursor-pointer tracking-[0.3px] transition-all duration-200 min-h-11 inline-flex items-center justify-center hover:bg-teal-400 hover:border-teal-400 hover:text-carbon-950 hover:shadow-[0_2px_12px_rgba(45,212,191,0.2)] max-[480px]:top-2.5 max-[480px]:right-16 max-[480px]:px-3.5 max-[480px]:py-1.5 max-[480px]:text-xs max-[480px]:min-h-10"
      >
        {t('auth.login', 'Войти')}
      </button>
      <LoginModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
