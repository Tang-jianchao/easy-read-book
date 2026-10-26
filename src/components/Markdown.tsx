import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { normalizeHeading, SECTION_LABELS } from '../lib/markdown'

export function Markdown({ source, reader = false }: { source: string; reader?: boolean }) {
  return (
    <div className={reader ? 'md md--reader' : 'md'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => {
            const text = String(children)
            const label = SECTION_LABELS[normalizeHeading(text)]
            if (!label) return <h2>{children}</h2>
            return (
              <h2 className="md-section">
                <span className="md-section__zh">{label}</span>
                <span className="md-section__en">{text}</span>
              </h2>
            )
          },
          table: ({ children }) => (
            <div className="md-table">
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
