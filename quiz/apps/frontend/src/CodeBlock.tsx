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
    return <pre className="question-code"><code>{code}</code></pre>
  }

  return (
    <div
      className="question-code-highlighted"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
