/** Compact one-line preview of a tool input/output value, truncated. */
export const previewValue = (value: unknown, max = 140): string => {
  if (value === undefined) return ''
  let text: string
  if (typeof value === 'string') text = value
  else {
    try {
      text = JSON.stringify(value)
    } catch {
      text = String(value)
    }
  }
  text = text.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
