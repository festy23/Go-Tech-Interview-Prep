import { useRef, useEffect } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { go } from '@codemirror/lang-go'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language'
import { closeBrackets } from '@codemirror/autocomplete'
import { highlightSelectionMatches } from '@codemirror/search'

interface PlaygroundEditorProps {
  code: string
  onChange: (code: string) => void
  onRun: () => void
}

export function PlaygroundEditor({ code, onChange, onRun }: PlaygroundEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onRunRef = useRef(onRun)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onRunRef.current = onRun })
  useEffect(() => { onChangeRef.current = onChange })

  useEffect(() => {
    if (!containerRef.current) return

    const runKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        run: () => { onRunRef.current(); return true },
      },
    ])

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
    })

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightSpecialChars(),
        bracketMatching(),
        closeBrackets(),
        foldGutter(),
        indentOnInput(),
        highlightSelectionMatches(),
        keymap.of([...defaultKeymap, indentWithTab]),
        runKeymap,
        go(),
        oneDark,
        updateListener,
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { fontFamily: '"JetBrains Mono", monospace', lineHeight: '1.65' },
          '.cm-content': { padding: '16px 0' },
          '.cm-gutters': { border: 'none' },
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => { view.destroy(); viewRef.current = null }
  }, []) // mount-only: callbacks accessed via refs

  // Sync external code changes (e.g., opening from quiz)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== code) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: code },
      })
    }
  }, [code])

  return (
    <div
      ref={containerRef}
      className="h-full min-h-[300px] bg-carbon-850 border border-white/5 rounded-[10px] overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor]:outline-none"
    />
  )
}
