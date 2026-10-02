import { Chess, type Move, type PieceSymbol } from 'chess.js'

/**
 * A small, honest chess engine: material + piece-square tables, alpha-beta
 * negamax with capture-first move ordering. Not strong — strong enough that
 * the agent can't blunder a queen when it bothers to ask, and slow enough at
 * depth 3 that running it in a Web Worker visibly keeps the page responsive.
 */

const VALUE: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }

// Piece-square tables from White's point of view, rank 8 first (index 0 = a8).
const PST: Record<PieceSymbol, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5,
    10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20,
    -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10,
    0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10,
    5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0,
    -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10,
    -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
    0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0,
    5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0,
    0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40,
    -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30,
    -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0,
    10, 30, 20,
  ],
}

const MATE = 100_000

/** Static evaluation in centipawns from White's point of view. */
export const evaluateWhite = (chess: Chess): number => {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -MATE : MATE
  if (chess.isDraw()) return 0
  let score = 0
  const board = chess.board()
  for (let r = 0; r < 8; r += 1) {
    for (let f = 0; f < 8; f += 1) {
      const sq = board[r][f]
      if (!sq) continue
      // Tables are written for White (rank 8 first); mirror ranks for Black.
      const idx = sq.color === 'w' ? r * 8 + f : (7 - r) * 8 + f
      const v = VALUE[sq.type] + PST[sq.type][idx]
      score += sq.color === 'w' ? v : -v
    }
  }
  return score
}

const order = (moves: Move[]): Move[] =>
  moves.sort((a, b) => {
    const va = a.captured ? VALUE[a.captured] * 10 - VALUE[a.piece] : a.promotion ? 800 : 0
    const vb = b.captured ? VALUE[b.captured] * 10 - VALUE[b.piece] : b.promotion ? 800 : 0
    return vb - va
  })

interface SearchStats {
  nodes: number
}

/** Negamax with alpha-beta; returns the score for the side to move. */
const negamax = (
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  stats: SearchStats,
): { score: number; pv: string[] } => {
  stats.nodes += 1
  if (depth === 0 || chess.isGameOver()) {
    const white = evaluateWhite(chess)
    return { score: chess.turn() === 'w' ? white : -white, pv: [] }
  }
  let best = { score: -Infinity, pv: [] as string[] }
  for (const m of order(chess.moves({ verbose: true }))) {
    chess.move({ from: m.from, to: m.to, promotion: m.promotion })
    const child = negamax(chess, depth - 1, -beta, -alpha, stats)
    chess.undo()
    const score = -child.score
    if (score > best.score) best = { score, pv: [m.san, ...child.pv] }
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }
  return best
}

export interface MoveAnalysis {
  move: string
  /** Centipawns for the side that plays `move` (positive = good for it). */
  score: number
  /** Expected continuation after the move. */
  line: string[]
  nodes: number
  /** A plain-words read of the score. */
  verdict: string
}

const verdictOf = (score: number): string => {
  if (score >= MATE / 2) return 'forced mate for you'
  if (score <= -MATE / 2) return 'gets you mated'
  if (score >= 300) return 'winning'
  if (score >= 80) return 'clearly better'
  if (score > -80) return 'roughly equal'
  if (score > -300) return 'clearly worse'
  return 'losing material'
}

/** Analyse one candidate move in a position (throws on an illegal move). */
export const analyseMove = (fen: string, move: string, depth = 2): MoveAnalysis => {
  const chess = new Chess(fen)
  const played = chess.move(move)
  const stats = { nodes: 0 }
  const reply = negamax(chess, Math.max(0, depth - 1), -Infinity, Infinity, stats)
  const score = -reply.score
  return { move: played.san, score, line: reply.pv, nodes: stats.nodes, verdict: verdictOf(score) }
}

/** The engine's own best move (for the "engine move" fallback). */
export const bestMove = (fen: string, depth = 2): MoveAnalysis | undefined => {
  const chess = new Chess(fen)
  const stats = { nodes: 0 }
  const best = negamax(chess, depth, -Infinity, Infinity, stats)
  const [move, ...line] = best.pv
  return move
    ? { move, score: best.score, line, nodes: stats.nodes, verdict: verdictOf(best.score) }
    : undefined
}

/** Material balance in pawns, from White's point of view. */
export const materialWhite = (chess: Chess): number => {
  let sum = 0
  for (const row of chess.board()) {
    for (const sq of row) if (sq) sum += (sq.color === 'w' ? 1 : -1) * VALUE[sq.type]
  }
  return sum / 100
}
