import { useCallback, useMemo, useRef, useState } from 'react'
import type { AgentToolSet } from '@dudko.dev/agent-web'
import { tool } from 'ai'
import { z } from 'zod'

export const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'red', 'purple'] as const
export type NoteColor = (typeof NOTE_COLORS)[number]

export interface Note {
  id: number
  text: string
  color: NoteColor
}

export interface NotesBoard {
  notes: Note[]
  /** The AI SDK tools the agent uses to edit the board. Referentially stable. */
  tools: AgentToolSet
  /** Serializes the board for the agent's `describeState` grounding. Stable. */
  describeState: () => string
  /** Clear the board (UI button). */
  clear: () => void
}

const colorSchema = z.enum(NOTE_COLORS)
const colorHint = `"${NOTE_COLORS.join('" | "')}"`

/**
 * A tiny in-memory sticky-notes board plus the tools that let the agent edit
 * it. The tools mutate a ref (so they stay valid without rebuilding the agent)
 * and bump React state to re-render. `promptHint` is attached so weak local
 * (WebLLM) models get a readable parameter hint in the prompted tool catalogue.
 */
export const useNotesBoard = (): NotesBoard => {
  const [notes, setNotes] = useState<Note[]>([])
  const notesRef = useRef<Note[]>(notes)
  const idRef = useRef(1)

  // Keep the ref in sync so tool closures always read the latest board.
  notesRef.current = notes

  const clear = useCallback(() => setNotes([]), [])

  const describeState = useCallback(() => {
    const list = notesRef.current
    if (list.length === 0) return 'The board is empty.'
    return `The board has ${list.length} note(s):\n${JSON.stringify(list)}`
  }, [])

  const tools = useMemo<AgentToolSet>(
    () => ({
      add_note: {
        ...tool({
          description: 'Add a sticky note to the board. Returns the new note id.',
          inputSchema: z.object({
            text: z.string().describe('The note text.'),
            color: colorSchema.optional().describe('One of the allowed colors.'),
          }),
          execute: async ({ text, color }) => {
            const note: Note = { id: idRef.current++, text, color: color ?? 'yellow' }
            setNotes((prev) => [...prev, note])
            return { id: note.id }
          },
        }),
        promptHint: `{ text: string, color?: ${colorHint} }`,
      },
      update_note: {
        ...tool({
          description: 'Update the text and/or color of an existing note by id.',
          inputSchema: z.object({
            id: z.number(),
            text: z.string().optional(),
            color: colorSchema.optional(),
          }),
          execute: async ({ id, text, color }) => {
            let found = false
            setNotes((prev) =>
              prev.map((n) => {
                if (n.id !== id) return n
                found = true
                return { ...n, text: text ?? n.text, color: color ?? n.color }
              }),
            )
            return { ok: found }
          },
        }),
        promptHint: `{ id: number, text?: string, color?: ${colorHint} }`,
      },
      remove_note: {
        ...tool({
          description: 'Remove a note from the board by id.',
          inputSchema: z.object({ id: z.number() }),
          execute: async ({ id }) => {
            setNotes((prev) => prev.filter((n) => n.id !== id))
            return { ok: true }
          },
        }),
        promptHint: '{ id: number }',
      },
      list_notes: tool({
        description: 'List all notes currently on the board.',
        inputSchema: z.object({}),
        execute: async () => ({ notes: notesRef.current }),
      }),
      clear_board: tool({
        description: 'Remove every note from the board.',
        inputSchema: z.object({}),
        execute: async () => {
          setNotes([])
          return { ok: true }
        },
      }),
    }),
    [],
  )

  return { notes, tools, describeState, clear }
}
