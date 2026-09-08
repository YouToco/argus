import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import 'streamdown/styles.css'

/**
 * Markdown renderer for AI streaming output, styled for the dark editorial theme.
 * - streamdown repairs unterminated markdown while tokens are still streaming
 * - @streamdown/code adds Shiki syntax highlighting + copy button on code blocks
 * - tables keep streamdown's default wrapper (scrollable + copy/download controls)
 *
 * Typographic elements are overridden below to preserve the editorial look;
 * code blocks and tables intentionally use streamdown's defaults (they consume
 * the shadcn tokens defined in index.css).
 */
const components = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-2 mt-4 text-base font-extrabold tracking-tight text-white first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2 mt-4 text-[15px] font-bold tracking-tight text-white first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1.5 mt-3.5 text-sm font-bold text-zinc-100 first:mt-0">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mb-1.5 mt-3 text-sm font-semibold text-zinc-200 first:mt-0">{children}</h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold text-white">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => <em className="text-zinc-300">{children}</em>,
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 marker:text-zinc-600">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-zinc-600">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[#5c93ff] underline decoration-[#3d7fff]/40 underline-offset-2 hover:decoration-[#3d7fff]"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-2 border-l-2 border-[#3d7fff]/50 pl-3 text-zinc-400">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-white/[0.08]" />,
  inlineCode: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded-sm border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-[#5c93ff]">
      {children}
    </code>
  ),
}

export function Markdown({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className="md-root text-sm">
      <Streamdown
        plugins={{ code }}
        shikiTheme={['github-dark', 'github-dark']}
        isAnimating={streaming === true}
        caret="block"
        codeBlockMaxHeight={360}
        tableMaxHeight={280}
        components={components}
      >
        {content}
      </Streamdown>
    </div>
  )
}