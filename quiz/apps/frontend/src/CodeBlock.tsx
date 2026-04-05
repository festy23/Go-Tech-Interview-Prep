import { useState, useEffect, memo } from 'react'

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
}

export const CodeBlock = memo(function CodeBlock({ code, lang = 'go' }: CodeBlockProps) {
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

  if (!html) {
    return <pre className="bg-carbon-850 border border-white/5 rounded-[10px] p-[16px_18px] mb-[22px] font-mono text-[13px] leading-[1.65] text-carbon-100 overflow-x-auto whitespace-pre"><code>{code}</code></pre>
  }

  return (
    <div
      className="mb-[22px] rounded-[10px] overflow-hidden [&_pre]:m-0 [&_pre]:p-[16px_18px] [&_pre]:rounded-[10px] [&_pre]:border [&_pre]:border-white/5 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-[1.65] [&_pre]:overflow-x-auto [&_pre]:tab-[4] [&_code]:font-[inherit] [&_code]:bg-transparent"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
