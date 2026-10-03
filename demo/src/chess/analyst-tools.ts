import { markReadOnly, type AgentToolSet } from '@dudko.dev/agent-web'
import { tool } from 'ai'
import { z } from 'zod'
import { analyseMove, bestMove } from './engine'

/**
 * The analyst's own tools — a real search, not a model guess. In a Web Worker
 * they run off the main thread; the in-process analyst (local models) runs the
 * same tools at a lower depth so the page stays responsive.
 */
export const engineTools = (maxDepth: number): AgentToolSet => ({
  engine_analyse: markReadOnly(
    tool({
      description: `Search one candidate move with the engine (up to ${maxDepth} ply). Returns the score for the side that plays it (centipawns, + is good), the expected continuation, the node count and a verdict.`,
      inputSchema: z.object({
        fen: z.string().describe('The position, as FEN'),
        move: z.string().describe('The candidate move in SAN'),
        depth: z.number().optional().describe(`Search depth in plies (1-${maxDepth})`),
      }),
      execute: async ({ fen, move, depth }) =>
        analyseMove(fen, move, Math.min(Math.max(1, depth ?? maxDepth), maxDepth)),
    }),
  ),
  engine_best: markReadOnly(
    tool({
      description: "The engine's own best move in a position, with its score and line.",
      inputSchema: z.object({ fen: z.string().describe('The position, as FEN') }),
      execute: async ({ fen }) =>
        bestMove(fen, Math.min(2, maxDepth)) ?? { error: 'no legal moves' },
    }),
  ),
})

export const ANALYST_PROMPT = `You are a chess analyst. You receive ONE task: assess a candidate move (or find the best move) in a given position.
Get the position (get_position) unless the task contains a FEN, run engine_analyse on the candidate (and engine_best for comparison), and answer in two sentences: the verdict with the score, and the main line or risk. Do not ask questions.`
