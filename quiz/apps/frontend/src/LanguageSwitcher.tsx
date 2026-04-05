import { useTranslation } from 'react-i18next'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()

  const toggle = () => {
    const next = i18n.language === 'ru' ? 'en' : 'ru'
    i18n.changeLanguage(next)
    localStorage.setItem('lang', next)
  }

  return (
    <button
      className="fixed top-4 right-4 z-[1000] bg-carbon-750 text-carbon-100 border border-white/6 rounded-full px-[18px] py-2 text-[13px] font-semibold font-mono cursor-pointer tracking-[0.5px] transition-all duration-200 min-h-11 min-w-11 inline-flex items-center justify-center hover:bg-teal-400 hover:border-teal-400 hover:text-carbon-950 hover:shadow-[0_2px_12px_rgba(45,212,191,0.2)] max-[480px]:top-2.5 max-[480px]:right-2.5 max-[480px]:px-3.5 max-[480px]:py-1.5 max-[480px]:text-xs max-[480px]:min-h-10 max-[480px]:min-w-10"
      onClick={toggle}
      aria-label="Switch language"
    >
      {t('lang.switch')}
    </button>
  )
}
