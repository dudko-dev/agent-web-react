import { Fragment, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { VirtualFileInfo, VirtualFileSystem } from '@dudko.dev/agent-web'
import { useVirtualFiles } from '../hooks/use-virtual-files.js'
import { useLabels, type AgentLabelsOverride } from '../labels.js'
import { DownloadIcon, FileIcon, PlusIcon, XIcon } from './icons.js'

export interface FilesPanelProps {
  /** The workspace (the core's `VirtualFileSystem`). */
  files: VirtualFileSystem
  /** Only list paths under this prefix (default '/'). */
  prefix?: string
  title?: ReactNode
  /** Upload button (default true). */
  allowUpload?: boolean
  /** Delete buttons (default true). */
  allowDelete?: boolean
  /** Directory uploads go to (default '/uploads'). */
  uploadDir?: string
  /** Called when a file row is clicked (in addition to the preview). */
  onOpen?: (file: VirtualFileInfo) => void
  /** Render a row yourself; `fallback` is the built-in `<li>` — return it, or your own `<li>`. */
  renderFile?: (file: VirtualFileInfo, fallback: ReactNode) => ReactNode
  labels?: AgentLabelsOverride
  className?: string
}

type Preview =
  { path: string; kind: 'image'; src: string } | { path: string; kind: 'text'; text: string }

const PREVIEW_CHARS = 20_000

/**
 * The agent's workspace — attachments the user dropped in, files the agent
 * wrote with its `fs_*` tools — live, with a preview (text / image),
 * download, delete and upload.
 */
export const FilesPanel = ({
  files: vfs,
  prefix = '/',
  title,
  allowUpload = true,
  allowDelete = true,
  uploadDir,
  onOpen,
  renderFile,
  labels,
  className,
}: FilesPanelProps) => {
  const L = useLabels(labels)
  const fs = useVirtualFiles(vfs, prefix)
  const [preview, setPreview] = useState<Preview | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)

  // Drop a preview whose file went away.
  useEffect(() => {
    if (preview && !fs.files.some((f) => f.path === preview.path)) setPreview(undefined)
  }, [fs.files, preview])

  const open = async (f: VirtualFileInfo) => {
    onOpen?.(f)
    if (preview?.path === f.path) return setPreview(undefined)
    if (f.mimeType.startsWith('image/')) {
      const src = await fs.dataUrl(f.path)
      if (src) setPreview({ path: f.path, kind: 'image', src })
      return
    }
    const text = await fs.text(f.path)
    if (text !== undefined) setPreview({ path: f.path, kind: 'text', text })
    else setPreview(undefined)
  }

  const download = async (f: VirtualFileInfo) => {
    const href = await fs.dataUrl(f.path)
    if (!href) return
    const a = document.createElement('a')
    a.href = href
    a.download = f.path.split('/').pop() || 'file'
    a.click()
  }

  return (
    <div className={['awr-filespanel', className].filter(Boolean).join(' ')}>
      <div className="awr-panel__head">
        <span className="awr-panel__title">{title ?? L.files}</span>
        {allowUpload && (
          <>
            <button
              type="button"
              className="awr-iconbtn"
              aria-label={L.upload}
              title={L.upload}
              onClick={() => inputRef.current?.click()}
            >
              <PlusIcon size={16} />
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={async (e) => {
                for (const f of Array.from(e.target.files ?? [])) await fs.upload(f, uploadDir)
                e.target.value = ''
              }}
            />
          </>
        )}
      </div>
      {fs.error && <div className="awr-notice awr-notice--warn">{fs.error}</div>}
      {!fs.loading && fs.files.length === 0 && (
        <div className="awr-panel__empty">{L.filesEmpty}</div>
      )}
      <ul className="awr-filelist">
        {fs.files.map((f) => {
          const row = (
            <li
              key={f.path}
              className={`awr-filelist__item${preview?.path === f.path ? ' is-active' : ''}`}
            >
              <button
                type="button"
                className="awr-filelist__open"
                onClick={() => void open(f)}
                title={`${L.preview}: ${f.path}`}
              >
                <FileIcon size={14} />
                <span className="awr-filelist__path">{f.path}</span>
                <span className="awr-filelist__size">{L.bytes(f.size)}</span>
              </button>
              <button
                type="button"
                className="awr-iconbtn"
                aria-label={`${L.download} ${f.path}`}
                title={L.download}
                onClick={() => void download(f)}
              >
                <DownloadIcon size={14} />
              </button>
              {allowDelete && (
                <button
                  type="button"
                  className="awr-iconbtn"
                  aria-label={`${L.delete} ${f.path}`}
                  title={L.delete}
                  onClick={() => void fs.remove(f.path)}
                >
                  <XIcon size={14} />
                </button>
              )}
            </li>
          )
          return renderFile ? <Fragment key={f.path}>{renderFile(f, row)}</Fragment> : row
        })}
      </ul>
      {preview && (
        <div className="awr-filepreview">
          {preview.kind === 'image' ? (
            <img src={preview.src} alt={preview.path} />
          ) : (
            <pre>
              {preview.text.length > PREVIEW_CHARS
                ? `${preview.text.slice(0, PREVIEW_CHARS)}\n…`
                : preview.text}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
