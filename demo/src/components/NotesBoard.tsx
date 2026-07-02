import type { Note } from '../notes'

export interface NotesBoardProps {
  notes: Note[]
  onClear: () => void
}

/** The right-hand board the agent edits through tools. */
export const NotesBoard = ({ notes, onClear }: NotesBoardProps) => (
  <div className="board">
    <div className="board__head">
      <h2 className="board__title">Board</h2>
      <span className="board__count">{notes.length} note(s)</span>
      <button className="board__clear" onClick={onClear} disabled={notes.length === 0}>
        Clear
      </button>
    </div>
    {notes.length === 0 ? (
      <div className="board__empty">
        No notes yet. Ask the agent on the left to add some — try
        <br />
        <em>“Add a 3-item launch checklist and make the urgent one red.”</em>
      </div>
    ) : (
      <div className="board__grid">
        {notes.map((n) => (
          <div key={n.id} className={`note note--${n.color}`}>
            <span className="note__id">#{n.id}</span>
            <p className="note__text">{n.text}</p>
          </div>
        ))}
      </div>
    )}
  </div>
)
