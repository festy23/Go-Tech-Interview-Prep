import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import { fetchArticle } from './api/client'
import type { ArticleDTO } from '@quiz/shared'

interface ArticleProps {
  blockId: string
  onBack: () => void
  onStartQuiz?: (blockId: string) => void
}

interface TocItem {
  id: string
  text: string
  level: number
}

function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = []
  const regex = /^(#{2,3})\s+(.+)$/gm
  let match
  while ((match = regex.exec(markdown)) !== null) {
    const text = match[2]
    const id = text
      .toLowerCase()
      .replace(/[^\w\sа-яё-]/gi, '')
      .replace(/\s+/g, '-')
    items.push({ id, text, level: match[1].length })
  }
  return items
}

export function Article({ blockId, onBack, onStartQuiz }: ArticleProps) {
  const { t } = useTranslation()
  const [article, setArticle] = useState<ArticleDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetchArticle(blockId)
      .then(setArticle)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [blockId])

  const toc = useMemo(
    () => (article ? extractToc(article.content) : []),
    [article],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-carbon-400 text-lg font-sans">{t('article.notFound')}</p>
        <button
          onClick={onBack}
          className="mt-6 text-teal-400 font-sans cursor-pointer hover:text-teal-300 transition-colors"
        >
          {t('article.back')}
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-carbon-400 text-sm font-sans cursor-pointer hover:text-carbon-200 transition-colors mb-6"
      >
        {t('article.back')}
      </button>

      <div className="flex gap-10">
        {/* TOC sidebar — desktop only */}
        {toc.length > 0 && (
          <nav className="hidden min-[900px]:block w-48 shrink-0 sticky top-10 self-start max-h-[80vh] overflow-y-auto">
            <p className="text-carbon-400 text-xs font-semibold font-sans uppercase tracking-wider mb-3">
              {t('article.toc')}
            </p>
            <ul className="space-y-1.5">
              {toc.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className={`block text-sm font-sans text-carbon-400 hover:text-teal-400 transition-colors ${
                      item.level === 3 ? 'pl-3' : ''
                    }`}
                  >
                    {item.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Article content */}
        <article className="flex-1 min-w-0">
          {/* Title + reading time */}
          <h1 className="text-3xl font-bold font-sans text-carbon-100 mb-2">
            {article.title}
          </h1>
          <p className="text-carbon-400 text-sm font-sans mb-8">
            📖 {t('article.readingTime', { min: article.readingTimeMin })}
          </p>

          {/* Markdown body */}
          <div className="article-prose">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight, rehypeSlug]}
            >
              {article.content}
            </ReactMarkdown>
          </div>

          {/* CTA — start quiz */}
          {onStartQuiz && (
            <div className="mt-12 pt-8 border-t border-white/6">
              <button
                onClick={() => onStartQuiz(blockId)}
                className="px-6 py-3 bg-teal-400 text-carbon-950 font-semibold font-sans rounded-xl cursor-pointer hover:bg-teal-300 transition-colors"
              >
                {t('article.startQuiz')}
              </button>
            </div>
          )}
        </article>
      </div>
    </div>
  )
}
