import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { PlaygroundEditor } from './PlaygroundEditor'
import { PlaygroundOutput } from './PlaygroundOutput'
import { runPlayground, type PlaygroundEvent } from './api/client'

const GO_VERSIONS = ['go1.26', 'go1.25', 'go1.24', 'go1.23', 'go1.22']

const DEFAULT_CODE = `package main

import "fmt"

func main() {
\tfmt.Println("Hello, Go!")
}`

interface PlaygroundProps {
  code?: string
  onHome: () => void
}

export function Playground({ code: initialCode, onHome }: PlaygroundProps) {
  const { t } = useTranslation()
  const [code, setCode] = useState(initialCode || DEFAULT_CODE)
  const [goVersion, setGoVersion] = useState(GO_VERSIONS[0])
  const [events, setEvents] = useState<PlaygroundEvent[]>([])
  const [errors, setErrors] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const handleRun = useCallback(async () => {
    setIsRunning(true)
    setEvents([])
    setErrors('')
    try {
      const result = await runPlayground({ body: code, goVersion })
      if (result.Errors) setErrors(result.Errors)
      if (result.Events) setEvents(result.Events)
    } catch (err) {
      setErrors(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsRunning(false)
    }
  }, [code, goVersion])

  const handleClear = useCallback(() => {
    setEvents([])
    setErrors('')
  }, [])

  return (
    <div className="max-w-[1100px] mx-auto px-6 pb-15 pt-10 min-h-screen flex flex-col animate-fade-slide-up">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button
          onClick={onHome}
          className="text-carbon-400 hover:text-carbon-100 transition-colors text-sm font-mono [@media(pointer:coarse)]:min-h-12"
        >
          {t('playground.back')}
        </button>

        <h1 className="text-lg font-bold text-carbon-100 flex-1 max-[480px]:flex-none max-[480px]:w-full max-[480px]:order-first max-[480px]:mb-2">
          {t('playground.title')}
        </h1>

        <select
          value={goVersion}
          onChange={(e) => setGoVersion(e.target.value)}
          className="bg-carbon-750 text-carbon-100 border border-white/6 rounded-lg px-3 py-2 text-sm font-mono outline-none hover:border-white/12 transition-colors [@media(pointer:coarse)]:min-h-12"
        >
          {GO_VERSIONS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <button
          onClick={handleRun}
          disabled={isRunning}
          className="bg-teal-400 text-carbon-950 font-bold text-sm px-5 py-2 rounded-xl transition-all hover:-translate-y-0.5 hover:bg-teal-500 hover:shadow-[0_4px_16px_rgba(45,212,191,0.2)] disabled:opacity-50 disabled:hover:translate-y-0 [@media(pointer:coarse)]:min-h-12"
        >
          {isRunning ? t('playground.running') : t('playground.run')}
        </button>

        {(events.length > 0 || errors) && (
          <button
            onClick={handleClear}
            className="bg-white/4 text-carbon-300 border border-white/6 text-sm px-4 py-2 rounded-xl hover:bg-white/7 hover:border-white/12 transition-colors [@media(pointer:coarse)]:min-h-12"
          >
            {t('playground.clear')}
          </button>
        )}
      </div>

      {/* Editor + Output */}
      <div className="flex-1 grid grid-cols-[3fr_2fr] gap-4 min-h-0 max-[768px]:grid-cols-1 max-[768px]:grid-rows-[1fr_auto]">
        <PlaygroundEditor code={code} onChange={setCode} onRun={handleRun} />
        <PlaygroundOutput events={events} errors={errors} isRunning={isRunning} />
      </div>

      <p className="text-center text-carbon-500 text-xs mt-4 font-mono">
        Ctrl+Enter / Cmd+Enter
      </p>
    </div>
  )
}
