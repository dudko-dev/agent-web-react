import { useCallback, useEffect, useRef, useState } from 'react'

/** The slice of the Web Speech API recognizer this hook drives. */
export interface SpeechRecognizerLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort?(): void
  onresult: ((ev: SpeechResultEventLike) => void) | null
  onerror: ((ev: { error?: string }) => void) | null
  onend: (() => void) | null
}

interface SpeechResultEventLike {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

export interface UseSpeechToTextOptions {
  /** BCP-47 language (default: the page's `navigator.language`). */
  lang?: string
  /** Keep listening across pauses until stopped (default true). */
  continuous?: boolean
  /**
   * Build your own recognizer (e.g. a fully local Whisper/WebGPU one) instead
   * of the browser's `SpeechRecognition`.
   */
  createRecognizer?: () => SpeechRecognizerLike
  /** Final text chunks, as they are recognized. */
  onFinal?: (text: string) => void
}

export interface UseSpeechToTextReturn {
  /** The browser (or your `createRecognizer`) can do speech-to-text. */
  supported: boolean
  listening: boolean
  /** Words heard but not final yet (for a live preview). */
  interim: string
  error?: string
  start: () => void
  stop: () => void
  toggle: () => void
}

const browserRecognizer = (): (() => SpeechRecognizerLike) | undefined => {
  const g = globalThis as unknown as {
    SpeechRecognition?: new () => SpeechRecognizerLike
    webkitSpeechRecognition?: new () => SpeechRecognizerLike
  }
  const Ctor = g.SpeechRecognition ?? g.webkitSpeechRecognition
  return Ctor ? () => new Ctor() : undefined
}

/**
 * Speech-to-text in the browser via the Web Speech API (`SpeechRecognition`,
 * prefixed in Chrome/Safari). Note that Chrome sends the audio to its own
 * recognition service; pass `createRecognizer` for an on-device engine.
 */
export const useSpeechToText = (options: UseSpeechToTextOptions = {}): UseSpeechToTextReturn => {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const factory = options.createRecognizer ?? browserRecognizer()
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | undefined>()
  const recRef = useRef<SpeechRecognizerLike | undefined>(undefined)

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (!factory || recRef.current) return
    const rec = factory()
    rec.lang =
      optionsRef.current.lang ??
      (typeof navigator !== 'undefined' ? navigator.language : undefined) ??
      'en-US'
    rec.continuous = optionsRef.current.continuous !== false
    rec.interimResults = true
    rec.onresult = (ev) => {
      let pending = ''
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const r = ev.results[i]
        if (r.isFinal) optionsRef.current.onFinal?.(r[0].transcript.trim())
        else pending += r[0].transcript
      }
      setInterim(pending)
    }
    rec.onerror = (ev) => {
      // "no-speech" / "aborted" are routine; anything else is worth showing.
      if (ev.error && ev.error !== 'no-speech' && ev.error !== 'aborted') setError(ev.error)
    }
    rec.onend = () => {
      recRef.current = undefined
      setListening(false)
      setInterim('')
    }
    recRef.current = rec
    setError(undefined)
    try {
      rec.start()
      setListening(true)
    } catch (err) {
      recRef.current = undefined
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [factory])

  useEffect(() => () => recRef.current?.abort?.(), [])

  return {
    supported: Boolean(factory),
    listening,
    interim,
    error,
    start,
    stop,
    toggle: () => (recRef.current ? stop() : start()),
  }
}
