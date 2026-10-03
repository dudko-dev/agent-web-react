import { useCallback, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { markReadOnly, type AgentToolSet } from '@dudko.dev/agent-web'
import { tool } from 'ai'
import { z } from 'zod'
import { analyseMove, bestMove, materialWhite } from './engine'

export type GameStatus = 'playing' | 'checkmate' | 'stalemate' | 'draw'

/** How a finished game ended — decided by the rules (chess.js), never by the model. */
export interface GameOutcome {
  status: Exclude<GameStatus, 'playing'>
  winner?: 'w' | 'b'
  /** 'checkmate', 'stalemate', 'threefold repetition', 'insufficient material', '50-move rule'. */
  reason: string
  /** 1-0, 0-1 or ½-½. */
  score: string
}

export interface ChessGame {
  fen: string
  /** Side to move. */
  turn: 'w' | 'b'
  /** The colour the agent plays. */
  agentColor: 'b'
  history: string[]
  lastMove?: { from: Square; to: Square }
  inCheck: boolean
  status: GameStatus
  /** 'w' | 'b' when the game is over with a winner. */
  winner?: 'w' | 'b'
  /** Set once the game is over. */
  outcome?: GameOutcome
  /** The live position, for code that runs after an await (render state lags). */
  current: () => { turn: 'w' | 'b'; outcome?: GameOutcome }
  board: ReturnType<Chess['board']>
  /** Squares the piece on `from` can move to (for the user's highlights). */
  targets: (from: Square) => Square[]
  /** Play the user's move; returns its SAN, or undefined when illegal / not their turn. */
  userMove: (from: Square, to: Square) => string | undefined
  /** Let the built-in engine move for the agent (fallback button). */
  engineMove: () => string | undefined
  newGame: () => void
  /** Take back the last full move (agent's and user's). */
  undo: () => void
  /** The agent's tools: read the position, evaluate candidates, play a move. */
  tools: AgentToolSet
  describeState: () => string
}

export const outcomeOf = (c: Chess): GameOutcome | undefined => {
  if (c.isCheckmate()) {
    const winner = c.turn() === 'w' ? 'b' : 'w'
    return {
      status: 'checkmate',
      winner,
      reason: 'checkmate',
      score: winner === 'w' ? '1-0' : '0-1',
    }
  }
  const draw = (status: 'stalemate' | 'draw', reason: string): GameOutcome => ({
    status,
    reason,
    score: '½-½',
  })
  if (c.isStalemate()) return draw('stalemate', 'stalemate')
  if (c.isThreefoldRepetition()) return draw('draw', 'threefold repetition')
  if (c.isInsufficientMaterial()) return draw('draw', 'insufficient material')
  if (c.isDrawByFiftyMoves()) return draw('draw', '50-move rule')
  if (c.isDraw()) return draw('draw', 'draw')
  return undefined
}

const statusOf = (c: Chess): { status: GameStatus; winner?: 'w' | 'b' } => {
  const o = outcomeOf(c)
  return o ? { status: o.status, winner: o.winner } : { status: 'playing' }
}

/** The result in words, from the user's (White's) side. */
export const outcomeText = (o: GameOutcome): string =>
  o.status === 'checkmate'
    ? `Checkmate — ${o.winner === 'w' ? 'you win' : 'the agent wins'} (${o.score})`
    : `Draw by ${o.reason} (${o.score})`

const sideName = (c: 'w' | 'b') => (c === 'w' ? 'White' : 'Black')

/** The position as the agent reads it — everything needed to choose a move. */
export const positionReport = (c: Chess, agentColor: 'w' | 'b') => {
  const history = c.history()
  const { status, winner } = statusOf(c)
  const material = materialWhite(c) * (agentColor === 'w' ? 1 : -1)
  return {
    fen: c.fen(),
    yourColor: sideName(agentColor),
    sideToMove: sideName(c.turn()),
    yourTurn: c.turn() === agentColor && status === 'playing',
    moveNumber: Math.floor(history.length / 2) + 1,
    lastMove: history.at(-1) ?? null,
    recentMoves: history.slice(-10).join(' '),
    inCheck: c.inCheck(),
    status,
    winner: winner ? sideName(winner) : null,
    materialForYou: material,
    legalMoves: c.moves(),
    board: c.ascii(),
  }
}

/**
 * The chess game the agent plays: React state for the board UI, and tools
 * that read and change the SAME game. The tools read a ref, so they stay valid
 * without rebuilding the agent.
 */
export const useChessGame = (): ChessGame => {
  const chessRef = useRef(new Chess())
  const [version, setVersion] = useState(0)
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | undefined>()
  const agentColor = 'b' as const
  const bump = () => setVersion((v) => v + 1)

  const play = useCallback((move: string | { from: Square; to: Square; promotion?: string }) => {
    const c = chessRef.current
    const m = c.move(move)
    setLastMove({ from: m.from, to: m.to })
    bump()
    return m.san
  }, [])

  const userMove = useCallback(
    (from: Square, to: Square): string | undefined => {
      const c = chessRef.current
      if (c.turn() === agentColor || c.isGameOver()) return undefined
      const legal = c.moves({ verbose: true }).find((m) => m.from === from && m.to === to)
      if (!legal) return undefined
      // Always promote to a queen — a click-to-move board has no picker.
      return play({ from, to, promotion: legal.promotion ? 'q' : undefined })
    },
    [play],
  )

  const engineMove = useCallback((): string | undefined => {
    const c = chessRef.current
    if (c.turn() !== agentColor || c.isGameOver()) return undefined
    const best = bestMove(c.fen(), 2)
    return best ? play(best.move) : undefined
  }, [play])

  const newGame = useCallback(() => {
    chessRef.current = new Chess()
    setLastMove(undefined)
    bump()
  }, [])

  const undo = useCallback(() => {
    const c = chessRef.current
    c.undo()
    if (c.turn() === agentColor) c.undo()
    setLastMove(undefined)
    bump()
  }, [])

  const targets = useCallback(
    (from: Square): Square[] =>
      chessRef.current.moves({ square: from, verbose: true }).map((m) => m.to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )

  const current = useCallback(
    () => ({ turn: chessRef.current.turn(), outcome: outcomeOf(chessRef.current) }),
    [],
  )

  const describeState = useCallback(() => {
    const r = positionReport(chessRef.current, agentColor)
    return `Chess game — you play ${r.yourColor}. ${r.sideToMove} to move${r.inCheck ? ' (in check)' : ''}. Status: ${r.status}. Last move: ${r.lastMove ?? 'none'}. FEN: ${r.fen}`
  }, [])

  const tools = useMemo<AgentToolSet>(
    () => ({
      get_position: markReadOnly(
        tool({
          description:
            'Read the current chess position: FEN, whose turn it is, your colour, the last move, every legal move (SAN) and an ASCII board.',
          inputSchema: z.object({}),
          execute: async () => positionReport(chessRef.current, agentColor),
        }),
      ),
      evaluate_moves: markReadOnly(
        tool({
          description:
            'Quick engine check (2 ply) of up to 6 candidate moves in the current position. Returns a score for you (centipawns, + is good), the expected reply and a verdict. Use it to avoid blunders.',
          inputSchema: z.object({
            moves: z.array(z.string()).describe('Candidate moves in SAN, e.g. ["e5", "Nf6"]'),
          }),
          execute: async ({ moves }) => {
            const fen = chessRef.current.fen()
            return moves.slice(0, 6).map((move) => {
              try {
                return analyseMove(fen, move, 2)
              } catch {
                return { move, error: 'illegal move in this position' }
              }
            })
          },
        }),
      ),
      make_move: tool({
        description:
          'Play YOUR move on the board (SAN like "e5", "Nf6", "O-O", "exd5", "e8=Q"). Only when it is your turn; exactly one move per turn.',
        inputSchema: z.object({ move: z.string().describe('The move in SAN') }),
        execute: async ({ move }) => {
          const c = chessRef.current
          if (c.isGameOver()) throw new Error('The game is over — no more moves.')
          if (c.turn() !== agentColor) {
            throw new Error(
              `It is not your turn: ${sideName(c.turn())} to move. Wait for the user.`,
            )
          }
          let san: string
          try {
            san = play(move)
          } catch {
            throw new Error(`"${move}" is not legal here. Legal moves: ${c.moves().join(', ')}`)
          }
          const after = positionReport(chessRef.current, agentColor)
          const outcome = outcomeOf(chessRef.current)
          if (outcome) {
            // The rules ended the game; the app shows the result on its own.
            return {
              played: san,
              gameOver: true,
              result: `${outcome.reason}${outcome.winner ? ` — ${sideName(outcome.winner)} wins` : ''} (${outcome.score})`,
              note: 'The game is over. Call no more tools; answer in one short sentence.',
            }
          }
          return { played: san, status: after.status, inCheck: after.inCheck, fen: after.fen }
        },
      }),
    }),
    [play],
  )

  const c = chessRef.current
  const outcome = outcomeOf(c)
  const { status, winner } = statusOf(c)
  return {
    fen: c.fen(),
    turn: c.turn(),
    agentColor,
    history: c.history(),
    lastMove,
    inCheck: c.inCheck(),
    status,
    winner,
    outcome,
    current,
    board: c.board(),
    targets,
    userMove,
    engineMove,
    newGame,
    undo,
    tools,
    describeState,
  }
}
