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

/** 1234 → "1.2k", 12345 → "12k". */
export const formatTokens = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n)

/** 340 → "340 ms", 4200 → "4.2 s", 125_000 → "2m 5s". */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

const isDataImage = (v: unknown): v is string =>
  typeof v === 'string' && /^data:image\/[\w.+-]+;base64,/.test(v)

/**
 * Images inside a tool result, as data URLs: MCP image parts
 * (`{ type: 'image', data, mimeType }`), data-URL strings, and objects that
 * carry one (`{ dataUrl }` / `{ url: 'data:…' }`). Looks two levels deep.
 */
export const imagesInOutput = (output: unknown, depth = 0): string[] => {
  if (depth > 2 || output == null) return []
  if (isDataImage(output)) return [output]
  if (Array.isArray(output)) return output.flatMap((v) => imagesInOutput(v, depth + 1))
  if (typeof output === 'object') {
    const o = output as Record<string, unknown>
    if (o.type === 'image' && typeof o.data === 'string') {
      const mime = typeof o.mimeType === 'string' ? o.mimeType : 'image/png'
      return [o.data.startsWith('data:') ? o.data : `data:${mime};base64,${o.data}`]
    }
    for (const key of ['dataUrl', 'url', 'image'])
      if (isDataImage(o[key])) return [o[key] as string]
    if (depth < 2) return Object.values(o).flatMap((v) => imagesInOutput(v, depth + 1))
  }
  return []
}
