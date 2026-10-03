import { useState } from 'react'
import type { Square } from 'chess.js'
import type { ChessGame } from './game'

const GLYPH: Record<string, string> = {
  wk: '♔',
  wq: '♕',
  wr: '♖',
  wb: '♗',
  wn: '♘',
  wp: '♙',
  bk: '♚',
  bq: '♛',
  br: '♜',
  bb: '♝',
  bn: '♞',
  bp: '♟',
}

const FILES = 'abcdefgh'

export interface ChessBoardProps {
  game: ChessGame
  /** The user can move (their turn, agent idle). */
  interactive: boolean
  onMove: (from: Square, to: Square) => void
}

/** A click-to-move board, White at the bottom. Click a piece, then a highlighted square. */
export const ChessBoard = ({ game, interactive, onMove }: ChessBoardProps) => {
  const [selected, setSelected] = useState<Square | undefined>()
  const targets = selected ? new Set(game.targets(selected)) : new Set<Square>()

  const click = (sq: Square, own: boolean) => {
    if (!interactive) return
    if (selected && targets.has(sq)) {
      onMove(selected, sq)
      setSelected(undefined)
      return
    }
    setSelected(own ? sq : undefined)
  }

  return (
    <div className="cboard" role="grid" aria-label="Chess board">
      {game.board.map((row, r) =>
        row.map((piece, f) => {
          const sq = `${FILES[f]}${8 - r}` as Square
          const dark = (r + f) % 2 === 1
          const own = piece?.color === 'w'
          const isLast = game.lastMove && (game.lastMove.from === sq || game.lastMove.to === sq)
          const inCheck = game.inCheck && piece?.type === 'k' && piece.color === game.turn
          const cls = [
            'cboard__sq',
            dark ? 'cboard__sq--dark' : 'cboard__sq--light',
            selected === sq ? 'is-selected' : '',
            targets.has(sq) ? (piece ? 'is-capture' : 'is-target') : '',
            isLast ? 'is-last' : '',
            inCheck ? 'is-check' : '',
            interactive && own ? 'is-movable' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={sq}
              type="button"
              className={cls}
              data-square={sq}
              aria-label={`${sq}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
              onClick={() => click(sq, own)}
            >
              {piece && (
                <span className={`cboard__piece cboard__piece--${piece.color}`}>
                  {GLYPH[`${piece.color}${piece.type}`]}
                </span>
              )}
              {f === 0 && <span className="cboard__rank">{8 - r}</span>}
              {r === 7 && <span className="cboard__file">{FILES[f]}</span>}
            </button>
          )
        }),
      )}
    </div>
  )
}
