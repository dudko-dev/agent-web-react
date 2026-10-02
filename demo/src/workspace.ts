import { VirtualFileSystem } from '@dudko.dev/agent-web-react'

/**
 * The demo's workspace: one IndexedDB-backed virtual file system shared by
 * the chat panels (attachments land in /attachments) and by the agents'
 * fs_* tools (they read what you dropped in and write reports next to it).
 */
export const workspace = new VirtualFileSystem({ namespace: 'agent-web-demo' })

/**
 * PDF → Markdown in the browser (Rust/WASM, nothing is uploaded) — the
 * composer calls this for PDFs the model can't read, so even a local model
 * can answer from a PDF. The ~5 MB module loads on the first PDF only.
 */
export const pdfToMarkdown = async (
  file: File,
): Promise<{ text: string; name: string } | undefined> => {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return undefined
  const { convert } = await import('@dudko.dev/pdf-to-md-core')
  // 'compact' spends fewer tokens than the default 'fidelity'.
  const result = await convert(new Uint8Array(await file.arrayBuffer()), { profile: 'compact' })
  // A scanned PDF has no text layer (no OCR here): let the composer refuse it.
  if (!result.markdown?.trim()) return undefined
  return { text: result.markdown, name: file.name.replace(/\.pdf$/i, '.md') }
}
