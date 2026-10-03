import type { ReactNode } from 'react'

/**
 * A small, safe Markdown renderer for the chat — what `renderContent` on
 * <AgentChat> is for. It builds React elements (never HTML strings), so model
 * output can't inject markup. Covers what answers use: paragraphs, headings,
 * lists, code blocks, **bold**, *italic*, `code` and http(s) links. Bring a full
 * renderer (react-markdown, …) in a real app.
 */
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g

const inline = (text: string, key: string): ReactNode[] =>
  text.split(INLINE).map((part, i) => {
    const k = `${key}-${i}`
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={k}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return <code key={k}>{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <em key={k}>{part.slice(1, -1)}</em>
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part)
    if (link)
      return (
        <a key={k} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      )
    return part
  })

export const Markdown = ({ text }: { text: string }) => {
  const out: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const key = `b${i}`
    if (/^```/.test(line)) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++])
      i += 1
      out.push(<pre key={key}>{body.join('\n')}</pre>)
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      out.push(
        <strong key={key} className="md-h">
          {inline(heading[2], key)}
        </strong>,
      )
      i += 1
      continue
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: ReactNode[] = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(
          <li key={i}>{inline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''), `${key}-${i}`)}</li>,
        )
        i += 1
      }
      out.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>)
      continue
    }
    if (!line.trim()) {
      i += 1
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(```|#{1,4}\s|\s*([-*]|\d+\.)\s+)/.test(lines[i])
    ) {
      para.push(lines[i++])
    }
    out.push(<p key={key}>{inline(para.join('\n'), key)}</p>)
  }
  return <div className="md">{out}</div>
}
