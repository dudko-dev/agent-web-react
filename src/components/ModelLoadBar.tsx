import type { ModelLoadState } from '../types.js'

export interface ModelLoadBarProps {
  load: ModelLoadState
  className?: string
}

/** A progress bar for WebLLM weight download / engine init (0..1). */
export const ModelLoadBar = ({ load, className }: ModelLoadBarProps) => {
  const pct = Math.round(Math.max(0, Math.min(1, load.progress)) * 100)
  return (
    <div className={['awr-modelload', className].filter(Boolean).join(' ')}>
      <div className="awr-modelload__head">
        <span className="awr-modelload__text">{load.text || 'Loading model…'}</span>
        <span className="awr-modelload__pct">{pct}%</span>
      </div>
      <div className="awr-modelload__track" role="progressbar" aria-valuenow={pct}>
        <div className="awr-modelload__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
