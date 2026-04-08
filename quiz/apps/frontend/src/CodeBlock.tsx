import { useState, useEffect, memo } from 'react'
import { useTranslation } from 'react-i18next'

let highlighterPromise: Promise<any> | null = null

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighterCore, createOnigurumaEngine } = await import('shiki')
      const hl = await createHighlighterCore({
        themes: [import('shiki/themes/one-dark-pro.mjs')],
        langs: [import('shiki/langs/go.mjs')],
        engine: createOnigurumaEngine(import('shiki/wasm')),
      })
      return hl
    })()
  }
  return highlighterPromise
}

interface CodeBlockProps {
  code: string
  lang?: string
  onOpenInPlayground?: (code: string) => void
}

export const CodeBlock = memo(function CodeBlock({ code, lang = 'go', onOpenInPlayground }: CodeBlockProps) {
  const { t } = useTranslation()
  const [html, setHtml] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    getHighlighter().then((hl) => {
      if (cancelled) return
      const result = hl.codeToHtml(code, { lang, theme: 'one-dark-pro' })
      setHtml(result)
    })
    return () => { cancelled = true }
  }, [code, lang])

  const playgroundButton = onOpenInPlayground && (
    <button
      onClick={() => onOpenInPlayground(code)}
      className="absolute top-2 right-2 bg-teal-400/10 text-teal-400 hover:bg-teal-400/20 text-xs font-mono px-2.5 py-1 rounded-lg transition-colors [@media(pointer:coarse)]:min-h-8 [@media(pointer:coarse)]:min-w-8"
    >
      {t('playground.openInPlayground')}
    </button>
  )

  if (!html) {
    return (
      <div className="relative mb-[22px]">
        {playgroundButton}
        <pre className="bg-carbon-850 border border-white/5 rounded-[10px] p-[16px_18px] font-mono text-[13px] leading-[1.65] text-carbon-100 overflow-x-auto whitespace-pre"><code>{code}</code></pre>
      </div>
    )
  }

  return (
    <div className="relative mb-[22px]">
      {playgroundButton}
      <div
        className="rounded-[10px] overflow-hidden [&_pre]:m-0 [&_pre]:p-[16px_18px] [&_pre]:rounded-[10px] [&_pre]:border [&_pre]:border-white/5 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-[1.65] [&_pre]:overflow-x-auto [&_pre]:tab-[4] [&_code]:font-[inherit] [&_code]:bg-transparent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
})
