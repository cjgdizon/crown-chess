import { Chess, DEFAULT_POSITION } from 'chess.js';
import {
  isPromotionPiece,
  oppositeColor,
  type Color,
  type GameStatus,
  type MoveRecord,
  type PieceType,
  type PromotionPiece,
  type Square,
} from './types';

export const INITIAL_FEN = DEFAULT_POSITION;

export const PIECE_VALUES: Readonly<Record<PieceType, number>> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const CAPTURE_SORT_ORDER: Readonly<Record<PieceType, number>> = {
  q: 0,
  r: 1,
  b: 2,
  n: 3,
  p: 4,
  k: 5,
};

export interface BoardPiece {
  square: Square;
  type: PieceType;
  color: Color;
}

/** Pieces captured by each side: `w` = captured by White, `b` = captured by Black. */
export interface CapturedPieces {
  w: PieceType[];
  b: PieceType[];
}

export interface ReplayedPosition {
  board: (BoardPiece | null)[][];
  turn: Color;
  fen: string;
  inCheck: boolean;
  kingInCheckSquare: Square | null;
  legalMoves: Record<Square, Square[]>;
  capturedPieces: CapturedPieces;
  materialDiff: number;
  status: GameStatus;
  lastMove: MoveRecord | null;
}

export interface AppliedMove {
  from: Square;
  to: Square;
  color: Color;
  san: string;
  uci: string;
  fenAfter: string;
  captured?: PieceType;
  promotion?: PromotionPiece;
  isCheck: boolean;
  isCastle: boolean;
  gameOver: GameStatus;
}

function createEmptyLegalMoves(): Record<Square, Square[]> {
  return {
    a8: [], b8: [], c8: [], d8: [], e8: [], f8: [], g8: [], h8: [],
    a7: [], b7: [], c7: [], d7: [], e7: [], f7: [], g7: [], h7: [],
    a6: [], b6: [], c6: [], d6: [], e6: [], f6: [], g6: [], h6: [],
    a5: [], b5: [], c5: [], d5: [], e5: [], f5: [], g5: [], h5: [],
    a4: [], b4: [], c4: [], d4: [], e4: [], f4: [], g4: [], h4: [],
    a3: [], b3: [], c3: [], d3: [], e3: [], f3: [], g3: [], h3: [],
    a2: [], b2: [], c2: [], d2: [], e2: [], f2: [], g2: [], h2: [],
    a1: [], b1: [], c1: [], d1: [], e1: [], f1: [], g1: [], h1: [],
  };
}

function replayOnChess(moves: readonly MoveRecord[], count: number): Chess {
  const chess = new Chess();
  for (let i = 0; i < count; i++) {
    const move = moves[i];
    if (!move) break;
    chess.move({
      from: move.from,
      to: move.to,
      ...(move.promotion !== undefined ? { promotion: move.promotion } : {}),
    });
  }
  return chess;
}

function deriveGameStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) {
    return {
      kind: 'ended',
      winner: oppositeColor(chess.turn()),
      reason: 'checkmate',
    };
  }
  if (chess.isStalemate()) {
    return { kind: 'ended', winner: 'draw', reason: 'stalemate' };
  }
  if (chess.isInsufficientMaterial()) {
    return { kind: 'ended', winner: 'draw', reason: 'insufficient-material' };
  }
  if (chess.isThreefoldRepetition()) {
    return { kind: 'ended', winner: 'draw', reason: 'threefold-repetition' };
  }
  if (chess.isDrawByFiftyMoves()) {
    return { kind: 'ended', winner: 'draw', reason: 'fifty-move' };
  }
  return { kind: 'playing' };
}

function sortCaptures(pieces: PieceType[]): PieceType[] {
  return pieces.sort((a, b) => CAPTURE_SORT_ORDER[a] - CAPTURE_SORT_ORDER[b]);
}

function computeMaterialDiff(board: (BoardPiece | null)[][]): number {
  let diff = 0;
  for (const rank of board) {
    for (const cell of rank) {
      if (!cell) continue;
      const value = PIECE_VALUES[cell.type];
      diff += cell.color === 'w' ? value : -value;
    }
  }
  return diff;
}

export function getLiveFen(moves: readonly MoveRecord[]): string {
  const last = moves.at(-1);
  return last ? last.fenAfter : INITIAL_FEN;
}

export function getTurnFromMoves(moves: readonly MoveRecord[]): Color {
  return moves.length % 2 === 0 ? 'w' : 'b';
}

export function replayPosition(moves: readonly MoveRecord[], ply?: number): ReplayedPosition {
  const targetPly =
    ply === undefined
      ? moves.length
      : Math.max(0, Math.min(moves.length, Math.trunc(ply)));

  const chess = replayOnChess(moves, targetPly);
  const turn: Color = chess.turn();
  const inCheck = chess.inCheck();
  const kingInCheckSquare: Square | null = inCheck
    ? (chess.findPiece({ type: 'k', color: turn })[0] ?? null)
    : null;

  const legalMoves = createEmptyLegalMoves();
  for (const move of chess.moves({ verbose: true })) {
    const destinations = legalMoves[move.from];
    if (!destinations.includes(move.to)) {
      destinations.push(move.to);
    }
  }

  const capturedW: PieceType[] = [];
  const capturedB: PieceType[] = [];
  for (let i = 0; i < targetPly; i++) {
    const move = moves[i];
    if (!move || !move.captured) continue;
    if (move.color === 'w') {
      capturedW.push(move.captured);
    } else {
      capturedB.push(move.captured);
    }
  }

  const board: (BoardPiece | null)[][] = chess.board().map((rank) =>
    rank.map((cell) =>
      cell
        ? {
            square: cell.square,
            type: cell.type,
            color: cell.color,
          }
        : null
    )
  );

  const lastMove = targetPly > 0 ? (moves[targetPly - 1] ?? null) : null;

  return {
    board,
    turn,
    fen: chess.fen(),
    inCheck,
    kingInCheckSquare,
    legalMoves,
    capturedPieces: {
      w: sortCaptures(capturedW),
      b: sortCaptures(capturedB),
    },
    materialDiff: computeMaterialDiff(board),
    status: deriveGameStatus(chess),
    lastMove,
  };
}

export function isPromotionMove(fen: string, from: Square, to: Square): boolean {
  const chess = new Chess(fen);
  const legal = chess.moves({ square: from, verbose: true });
  return legal.some((move) => move.to === to && move.isPromotion());
}

export function applyMove(
  fen: string,
  from: Square,
  to: Square,
  promotion?: PromotionPiece,
  priorMoves?: readonly MoveRecord[]
): AppliedMove | null {
  const chess =
    priorMoves && priorMoves.length > 0
      ? replayOnChess(priorMoves, priorMoves.length)
      : new Chess(fen);

  let executed;
  try {
    executed = chess.move({
      from,
      to,
      ...(promotion !== undefined ? { promotion } : {}),
    });
  } catch {
    return null;
  }

  const promo: PromotionPiece | undefined = isPromotionPiece(executed.promotion)
    ? executed.promotion
    : undefined;

  const uci = `${executed.from}${executed.to}${promo ?? ''}`;

  return {
    from: executed.from,
    to: executed.to,
    color: executed.color,
    san: executed.san,
    uci,
    fenAfter: executed.after,
    ...(executed.captured !== undefined ? { captured: executed.captured } : {}),
    ...(promo !== undefined ? { promotion: promo } : {}),
    isCheck: chess.inCheck(),
    isCastle: executed.isKingsideCastle() || executed.isQueensideCastle(),
    gameOver: deriveGameStatus(chess),
  };
}

/**
 * Checks whether `color` has sufficient mating material to win on timeout.
 * A side with at least one pawn, rook, or queen, or two or more minor pieces
 * can win on timeout; bare K, K+N, and K+B cannot.
 */
export function hasSufficientMatingMaterial(fen: string, color: Color): boolean {
  const chess = new Chess(fen);
  let minorCount = 0;

  for (const rank of chess.board()) {
    for (const cell of rank) {
      if (!cell || cell.color !== color) continue;
      if (cell.type === 'p' || cell.type === 'r' || cell.type === 'q') {
        return true;
      }
      if (cell.type === 'n' || cell.type === 'b') {
        minorCount += 1;
        if (minorCount >= 2) {
          return true;
        }
      }
    }
  }

  return false;
}
