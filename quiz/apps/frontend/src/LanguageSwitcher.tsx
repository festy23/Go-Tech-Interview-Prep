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
      className="lang-switcher"
      onClick={toggle}
      aria-label="Switch language"
    >
      {t('lang.switch')}
    </button>
  )
}
