import { Children, createContext, isValidElement, useContext, type ReactNode } from 'react'
import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import 'streamdown/styles.css'
import { useAppStore } from '../store'
import { parseTimestamp, TIMESTAMP_RE } from '../lib/timestamps'

/**
 * Markdown renderer for AI streaming output.
 * - streamdown repairs unterminated markdown while tokens are still streaming
 * - @streamdown/code adds Shiki syntax highlighting + copy button on code blocks
 * - timestamps in prose ("24.8s", "1:05", "1m30s", "25 秒") become buttons that
 *   jump the preview player, so every claim in an answer is one click from its
 *   evidence
 *
 * This module is lazy-loaded: streamdown + shiki + the unified pipeline are
 * ~400KB that the first paint doesn't need.
 */

const SeekContext = createContext<{ seek: (t: number) => void; max: number } | null>(null)

function linkify(node: ReactNode, ctx: { seek: (t: number) => void; max: number } | null): ReactNode {
  if (!ctx) return node
  if (typeof node === 'string') {
    const parts: ReactNode[] = []
    let last = 0
    for (const m of node.matchAll(TIMESTAMP_RE)) {
      const sec = parseTimestamp(m[0])
      if (sec === null || sec > ctx.max + 1) continue
      const at = m.index ?? 0
      if (at > last) parts.push(node.slice(last, at))
      parts.push(
        <button key={at} type="button" className="ts-link" onClick={() => ctx.seek(sec)}>
          {m[0]}
        </button>,
      )
      last = at + m[0].length
    }
    if (parts.length === 0) return node
    if (last < node.length) parts.push(node.slice(last))
    return parts
  }
  if (Array.isArray(node)) return Children.map(node, (c) => (isValidElement(c) ? c : linkify(c, ctx)))
  return node
}

function useLinkify(children: ReactNode): ReactNode {
  return linkify(children, useContext(SeekContext))
}

type P = { children?: ReactNode }

const P_ = ({ children }: P) => <p className="my-2.5 leading-[1.75] first:mt-0 last:mb-0">{useLinkify(children)}</p>
const Li = ({ children }: P) => <li className="leading-[1.7]">{useLinkify(children)}</li>
const Strong = ({ children }: P) => <strong className="font-semibold text-fg">{useLinkify(children)}</strong>
const Em = ({ children }: P) => <em className="text-fg-2">{useLinkify(children)}</em>
const Td = ({ children }: P) => (
  <td className="px-4 py-2 text-sm" data-streamdown="table-cell">
    {useLinkify(children)}
  </td>
)

const components = {
  h1: ({ children }: P) => <h1 className="mb-2 mt-5 text-lg font-bold tracking-tight text-fg first:mt-0">{children}</h1>,
  h2: ({ children }: P) => <h2 className="mb-2 mt-5 text-base font-bold tracking-tight text-fg first:mt-0">{children}</h2>,
  h3: ({ children }: P) => <h3 className="mb-1.5 mt-4 text-[15px] font-semibold text-fg first:mt-0">{children}</h3>,
  h4: ({ children }: P) => <h4 className="mb-1.5 mt-3 text-sm font-semibold text-fg first:mt-0">{children}</h4>,
  p: P_,
  strong: Strong,
  em: Em,
  li: Li,
  td: Td,
  ul: ({ children }: P) => <ul className="my-2.5 list-disc space-y-1 pl-5 marker:text-fg-4">{children}</ul>,
  ol: ({ children }: P) => <ol className="my-2.5 list-decimal space-y-1 pl-5 marker:text-fg-4">{children}</ol>,
  a: ({ children, href }: P & { href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent-text underline decoration-accent-line underline-offset-2 hover:decoration-accent"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }: P) => <blockquote className="my-2.5 border-l-2 border-accent-line pl-3 text-fg-2">{children}</blockquote>,
  hr: () => <hr className="my-4 border-line" />,
  inlineCode: ({ children }: P) => (
    <code className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-accent-text">{children}</code>
  ),
}

export default function Markdown({ content, streaming }: { content: string; streaming?: boolean }) {
  const hasPlayer = useAppStore((s) => s.session !== null)
  const max = useAppStore((s) => s.videoInfo?.durationSec ?? 0)
  const seekTo = useAppStore((s) => s.seekTo)
  return (
    <SeekContext.Provider value={hasPlayer && max > 0 ? { seek: seekTo, max } : null}>
      <div className="md-root text-[14px] text-fg-2">
        <Streamdown
          plugins={{ code }}
          shikiTheme={['github-light', 'github-dark']}
          isAnimating={streaming === true}
          caret="block"
          codeBlockMaxHeight={360}
          // the chat already scrolls; a nested table scroller hides the header row
          tableMaxHeight={0}
          components={components}
        >
          {content}
        </Streamdown>
      </div>
    </SeekContext.Provider>
  )
}
