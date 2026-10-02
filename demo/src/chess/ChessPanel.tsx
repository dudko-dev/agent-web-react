import type { Square } from 'chess.js'
import type { AnalystMode } from '../settings'
import { ChessBoard } from './ChessBoard'
import type { ChessGame } from './game'

export interface ChessPanelProps {
  game: ChessGame
  /** The agent is thinking about / playing its move. */
  agentBusy: boolean
  agentReady: boolean
  analysts: AnalystMode
  /** Why worker analysts are unavailable (e.g. a local model), if they are. */
  analystsNote?: string
  onAnalysts: (mode: AnalystMode) => void
  onUserMove: (from: Square, to: Square) => void
  /** Ask the agent to move (when it is its turn but it is idle). */
  onAskAgent: () => void
  /** Let the built-in engine play the agent's move (no model needed). */
  onEngineMove: () => void
  onNewGame: () => void
}

const RESULT: Record<string, string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  draw: 'Draw',
}

/**
 * The board, the move list and the controls. Every user move TRIGGERS the
 * agent: the app calls `agent.run("White played …")`, and the agent answers by
 * calling `make_move` — no chat message needed.
 */
export const ChessPanel = ({
  game,
  agentBusy,
  agentReady,
  analysts,
  analystsNote,
  onAnalysts,
  onUserMove,
  onAskAgent,
  onEngineMove,
  onNewGame,
}: ChessPanelProps) => {
  const over = game.status !== 'playing'
  const agentTurn = game.turn === game.agentColor && !over
  const pairs: string[] = []
  for (let i = 0; i < game.history.length; i += 2) {
    pairs.push(
      `${i / 2 + 1}. ${game.history[i]}${game.history[i + 1] ? ` ${game.history[i + 1]}` : ''}`,
    )
  }

  return (
    <div className="chess">
      <div className="chess__status">
        {over ? (
          <strong>
            {RESULT[game.status]}
            {game.winner ? ` — ${game.winner === 'w' ? 'you win' : 'the agent wins'}` : ''}
          </strong>
        ) : agentTurn ? (
          agentBusy ? (
            <span className="chess__thinking">The agent is choosing its move…</span>
          ) : (
            <span className="chess__agent-turn">
              Agent to move.
              <button
                type="button"
                className="mcp__btn-ghost"
                onClick={onAskAgent}
                disabled={!agentReady}
              >
                Ask it to move
              </button>
              <button type="button" className="mcp__btn-ghost" onClick={onEngineMove}>
                Engine move
              </button>
            </span>
          )
        ) : (
          <span>Your move (White){game.inCheck ? ' — you are in check' : ''}.</span>
        )}
      </div>

      <ChessBoard game={game} interactive={!agentTurn && !over && !agentBusy} onMove={onUserMove} />

      <div className="chess__controls">
        <button type="button" className="settings__btn" onClick={onNewGame} disabled={agentBusy}>
          New game
        </button>
        <label className="chess__analysts">
          <span>Analysts</span>
          <select
            className="settings__select"
            value={analysts}
            onChange={(e) => onAnalysts(e.target.value as AnalystMode)}
            disabled={agentBusy}
          >
            <option value="off">off — the agent decides alone</option>
            <option value="worker">sub-agents in Web Workers</option>
            <option value="in-process">sub-agents in-process</option>
          </select>
        </label>
      </div>
      {!agentReady && !over && (
        <p className="settings__note">
          Add an API key (or load a local model) on the left so the agent can play — until then,
          “Engine move” answers for it.
        </p>
      )}
      {analystsNote && <p className="settings__warn">{analystsNote}</p>}
      <p className="settings__note">
        {analysts === 'off'
          ? 'The agent reads the board, checks candidates with a 2-ply engine and plays.'
          : analysts === 'worker'
            ? 'Before moving, the agent sends its candidates to analyst sub-agents that run in parallel Web Workers with a 3-ply search — the page never freezes.'
            : 'Analyst sub-agents run in this thread with the same model (local models cannot be shared with workers).'}
      </p>

      <ol className="chess__moves">
        {pairs.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
    </div>
  )
}
