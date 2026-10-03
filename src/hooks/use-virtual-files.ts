import { useCallback, useEffect, useState } from 'react'
import type { VirtualFileInfo, VirtualFileSystem } from '@dudko.dev/agent-web'

export interface UseVirtualFilesReturn {
  files: VirtualFileInfo[]
  loading: boolean
  error?: string
  refresh: () => Promise<void>
  /** Save a browser File (text as text, anything else as base64). */
  upload: (file: File, dir?: string) => Promise<void>
  remove: (path: string) => Promise<void>
  /** A data URL of a file (for previews and downloads). */
  dataUrl: (path: string) => Promise<string | undefined>
  /** A text file's content. */
  text: (path: string) => Promise<string | undefined>
}

const readDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('could not read the file'))
    r.readAsDataURL(file)
  })

/**
 * A live listing of a {@link VirtualFileSystem} (the core's browser
 * workspace): re-reads on every write / delete — by the user or by the agent's
 * `fs_*` tools — and offers upload / remove / read helpers. Headless: render
 * it with `<FilesPanel>` or your own UI.
 */
export const useVirtualFiles = (
  vfs: VirtualFileSystem | undefined,
  prefix = '/',
): UseVirtualFilesReturn => {
  const [files, setFiles] = useState<VirtualFileInfo[]>([])
  const [loading, setLoading] = useState(Boolean(vfs))
  const [error, setError] = useState<string | undefined>()

  const refresh = useCallback(async () => {
    if (!vfs) return
    try {
      setFiles(await vfs.list(prefix))
      setError(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [vfs, prefix])

  useEffect(() => {
    if (!vfs) return
    void refresh()
    return vfs.onChange(() => void refresh())
  }, [vfs, refresh])

  const upload = useCallback(
    async (file: File, dir = '/uploads') => {
      if (!vfs) return
      const path = `${dir.replace(/\/$/, '')}/${file.name.replace(/[^\w.-]+/g, '_') || 'file'}`
      const type = file.type || 'application/octet-stream'
      if (type.startsWith('text/') || /json|xml|yaml|markdown|csv/.test(type)) {
        await vfs.write(path, await file.text(), { mimeType: type })
      } else {
        await vfs.writeDataUrl(path, await readDataUrl(file))
      }
    },
    [vfs],
  )

  const remove = useCallback(
    async (path: string) => {
      await vfs?.delete(path)
    },
    [vfs],
  )

  const dataUrl = useCallback(async (path: string) => vfs?.readDataUrl(path), [vfs])
  const text = useCallback(
    async (path: string) => {
      const f = await vfs?.read(path)
      return f && f.encoding === 'utf8' ? f.content : undefined
    },
    [vfs],
  )

  return { files, loading, error, refresh, upload, remove, dataUrl, text }
}
