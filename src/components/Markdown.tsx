import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Markdown renderer styled for the dark editorial theme. */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="md-root">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-2 mt-4 text-base font-extrabold tracking-tight text-white first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-4 text-[15px] font-bold tracking-tight text-white first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 mt-3.5 text-sm font-bold text-zinc-100 first:mt-0">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold text-zinc-200 first:mt-0">{children}</h4>,
          p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
          em: ({ children }) => <em className="text-zinc-300">{children}</em>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-zinc-600">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-zinc-600">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className ?? '')
            if (isBlock) return <code className="font-mono text-xs text-zinc-200">{children}</code>
            return (
              <code className="rounded-sm border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-[#5c93ff]">
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="scroll-thin my-2.5 overflow-x-auto rounded-md border border-white/[0.08] bg-black/60 p-3">{children}</pre>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-[#5c93ff] underline decoration-[#3d7fff]/40 underline-offset-2 hover:decoration-[#3d7fff]">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-[#3d7fff]/50 pl-3 text-zinc-400">{children}</blockquote>
          ),
          hr: () => <hr className="my-3 border-white/[0.08]" />,
          table: ({ children }) => (
            <div className="scroll-thin my-2.5 overflow-x-auto rounded-md border border-white/[0.08]">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-white/10 bg-white/[0.03] px-3 py-1.5 text-left font-semibold text-zinc-300">{children}</th>,
          td: ({ children }) => <td className="border-b border-white/[0.05] px-3 py-1.5 text-zinc-400">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}