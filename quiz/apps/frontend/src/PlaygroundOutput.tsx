import { useTranslation } from 'react-i18next'
import type { PlaygroundEvent } from './api/client'

interface PlaygroundOutputProps {
  events: PlaygroundEvent[]
  errors: string
  isRunning: boolean
}

export function PlaygroundOutput({ events, errors, isRunning }: PlaygroundOutputProps) {
  const { t } = useTranslation()

  const hasContent = errors || events.length > 0

  return (
    <div className="h-full min-h-[200px] bg-carbon-850 border border-white/5 rounded-[10px] p-[16px_18px] font-mono text-[13px] leading-[1.65] overflow-y-auto max-h-[500px] max-[768px]:max-h-[300px]">
      {isRunning && (
        <div className="text-carbon-400 animate-pulse">{t('playground.running')}</div>
      )}

      {!isRunning && errors && (
        <pre className="text-rose-400 whitespace-pre-wrap break-words">{errors}</pre>
      )}

      {!isRunning && !errors && events.length > 0 && (
        <pre className="whitespace-pre-wrap break-words">
          {events.map((ev, i) => (
            <span key={i} className={ev.Kind === 'stderr' ? 'text-rose-400' : 'text-carbon-100'}>
              {ev.Message}
            </span>
          ))}
        </pre>
      )}

      {!isRunning && !hasContent && (
        <div className="text-carbon-500 select-none">{t('playground.emptyOutput')}</div>
      )}
    </div>
  )
}
