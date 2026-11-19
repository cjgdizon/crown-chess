import { describe, expect, it } from 'vitest';
import {
  INITIAL_FEN,
  applyMove,
  hasSufficientMatingMaterial,
  isPromotionMove,
  replayPosition,
} from '../../src/domain/chessRules';
import {
  isBoardPreset,
  isColor,
  isDifficultyId,
  isPromotionPiece,
  isSquare,
  isThemeMode,
  type MoveRecord,
  type PromotionPiece,
  type Square,
} from '../../src/domain/types';

function playSequence(
  moves: Array<{ from: Square; to: Square; promotion?: PromotionPiece }>
): { records: MoveRecord[]; lastGameOver: ReturnType<typeof applyMove> } {
  const records: MoveRecord[] = [];
  let fen = INITIAL_FEN;
  let lastResult: ReturnType<typeof applyMove> = null;

  for (const step of moves) {
    const res = applyMove(fen, step.from, step.to, step.promotion, records);
    expect(res, `Expected legal move ${step.from}->${step.to}`).not.toBeNull();
    if (!res) break;
    lastResult = res;
    records.push({
      ply: records.length + 1,
      uci: res.uci,
      san: res.san,
      from: res.from,
      to: res.to,
      color: res.color,
      fenAfter: res.fenAfter,
      ...(res.captured !== undefined ? { captured: res.captured } : {}),
      ...(res.promotion !== undefined ? { promotion: res.promotion } : {}),
      isCheck: res.isCheck,
      isCastle: res.isCastle,
      clockAfterMs: { w: 0, b: 0 },
    });
    fen = res.fenAfter;
  }

  return { records, lastGameOver: lastResult };
}

describe('domain type guards', () => {
  it('validates squares, colors, promotion pieces, difficulties, board presets, and themes', () => {
    expect(isSquare('a1')).toBe(true);
    expect(isSquare('h8')).toBe(true);
    expect(isSquare('i1')).toBe(false);
    expect(isSquare('a9')).toBe(false);
    expect(isSquare('e2e4')).toBe(false);
    expect(isSquare(42)).toBe(false);

    expect(isColor('w')).toBe(true);
    expect(isColor('b')).toBe(true);
    expect(isColor('white')).toBe(false);

    expect(isPromotionPiece('q')).toBe(true);
    expect(isPromotionPiece('n')).toBe(true);
    expect(isPromotionPiece('k')).toBe(false);
    expect(isPromotionPiece('p')).toBe(false);

    expect(isDifficultyId('beginner')).toBe(true);
    expect(isDifficultyId('master')).toBe(true);
    expect(isDifficultyId('grandmaster')).toBe(false);

    expect(isBoardPreset('walnut')).toBe(true);
    expect(isBoardPreset('sage')).toBe(true);
    expect(isBoardPreset('slate')).toBe(true);
    expect(isBoardPreset('marble')).toBe(false);

    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('system')).toBe(false);
  });
});

describe('chessRules', () => {
  it('replays the initial position with 20 legal moves, zero captures, and balanced material', () => {
    const pos = replayPosition([]);
    expect(pos.fen).toBe(INITIAL_FEN);
    expect(pos.turn).toBe('w');
    expect(pos.inCheck).toBe(false);
    expect(pos.kingInCheckSquare).toBeNull();
    expect(pos.capturedPieces).toEqual({ w: [], b: [] });
    expect(pos.materialDiff).toBe(0);
    expect(pos.status).toEqual({ kind: 'playing' });
    expect(pos.lastMove).toBeNull();

    const totalLegalMoves = Object.values(pos.legalMoves).reduce(
      (sum, targets) => sum + targets.length,
      0
    );
    expect(totalLegalMoves).toBe(20);
    expect(pos.legalMoves.e2).toEqual(['e3', 'e4']);
    expect(pos.legalMoves.e1).toEqual([]);
  });

  it('supports kingside castling and marks isCastle true', () => {
    const { records, lastGameOver } = playSequence([
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
      { from: 'g1', to: 'f3' },
      { from: 'b8', to: 'c6' },
      { from: 'f1', to: 'c4' },
      { from: 'g8', to: 'f6' },
      { from: 'e1', to: 'g1' },
    ]);

    expect(lastGameOver?.san).toBe('O-O');
    expect(lastGameOver?.uci).toBe('e1g1');
    expect(lastGameOver?.isCastle).toBe(true);

    const pos = replayPosition(records);
    expect(pos.board[7]?.[6]).toEqual({ square: 'g1', type: 'k', color: 'w' });
    expect(pos.board[7]?.[5]).toEqual({ square: 'f1', type: 'r', color: 'w' });
  });

  it('supports queenside castling and marks isCastle true', () => {
    const { lastGameOver } = playSequence([
      { from: 'd2', to: 'd4' },
      { from: 'd7', to: 'd5' },
      { from: 'c1', to: 'f4' },
      { from: 'c8', to: 'f5' },
      { from: 'b1', to: 'c3' },
      { from: 'b8', to: 'c6' },
      { from: 'd1', to: 'd2' },
      { from: 'd8', to: 'd7' },
      { from: 'e1', to: 'c1' },
    ]);

    expect(lastGameOver?.san).toBe('O-O-O');
    expect(lastGameOver?.isCastle).toBe(true);
  });

  it('supports en passant capture and updates captured pieces and material diff', () => {
    const { records, lastGameOver } = playSequence([
      { from: 'e2', to: 'e4' },
      { from: 'a7', to: 'a6' },
      { from: 'e4', to: 'e5' },
      { from: 'd7', to: 'd5' },
      { from: 'e5', to: 'd6' },
    ]);

    expect(lastGameOver?.captured).toBe('p');
    expect(lastGameOver?.san).toBe('exd6');

    const pos = replayPosition(records);
    expect(pos.capturedPieces).toEqual({ w: ['p'], b: [] });
    expect(pos.materialDiff).toBe(1);
    expect(pos.board[3]?.[3]).toBeNull(); // d5 pawn removed
    expect(pos.board[2]?.[3]).toEqual({ square: 'd6', type: 'p', color: 'w' });
  });

  it('detects promotion moves, rejects promotion without piece choice, and deduplicates legal target squares', () => {
    const promoFen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
    expect(isPromotionMove(promoFen, 'a7', 'a8')).toBe(true);
    expect(isPromotionMove(promoFen, 'e1', 'e2')).toBe(false);
    expect(isPromotionMove(INITIAL_FEN, 'e2', 'e4')).toBe(false);

    // Omitting promotion piece for a promotion move is rejected
    expect(applyMove(promoFen, 'a7', 'a8')).toBeNull();

    const promoted = applyMove(promoFen, 'a7', 'a8', 'q');
    expect(promoted).not.toBeNull();
    expect(promoted?.promotion).toBe('q');
    expect(promoted?.uci).toBe('a7a8q');
    expect(promoted?.isCheck).toBe(true);

    // Play a real game sequence reaching a promotion square to verify replay deduplication
    const { records } = playSequence([
      { from: 'a2', to: 'a4' },
      { from: 'b7', to: 'b5' },
      { from: 'a4', to: 'b5' },
      { from: 'a7', to: 'a6' },
      { from: 'b5', to: 'a6' },
      { from: 'b8', to: 'c6' },
      { from: 'a6', to: 'a7' },
      { from: 'c6', to: 'b8' },
    ]);
    const beforePromo = replayPosition(records);
    // a7 -> a8 is blocked by rook on a8; b8 knight can be captured with promotion!
    const a7Targets = beforePromo.legalMoves.a7;
    expect(a7Targets.filter((sq) => sq === 'b8')).toHaveLength(1);
  });

  it('tracks captured pieces sorted Q, R, B, N, P and replays intermediate plies accurately', () => {
    // Captures happen out of value order: W captures p, n, q; B captures p, b
    const { records } = playSequence([
      { from: 'e2', to: 'e4' },
      { from: 'd7', to: 'd5' },
      { from: 'e4', to: 'd5' }, // W captures p
      { from: 'd8', to: 'd5' }, // B captures p
      { from: 'b1', to: 'c3' },
      { from: 'd5', to: 'e6' },
      { from: 'f1', to: 'e2' },
      { from: 'b8', to: 'c6' },
      { from: 'g1', to: 'f3' },
      { from: 'c8', to: 'd7' },
      { from: 'e1', to: 'g1' },
      { from: 'e8', to: 'c8' },
      { from: 'f1', to: 'e1' },
      { from: 'c6', to: 'd4' },
      { from: 'f3', to: 'd4' }, // W captures n
      { from: 'e6', to: 'e2' }, // B captures b
      { from: 'e1', to: 'e2' }, // W captures q
    ]);

    const atEnd = replayPosition(records);
    expect(atEnd.capturedPieces.w).toEqual(['q', 'n', 'p']);
    expect(atEnd.capturedPieces.b).toEqual(['b', 'p']);
    // White lost B(3)+P(1)=4; Black lost Q(9)+N(3)+P(1)=13 => diff = +9
    expect(atEnd.materialDiff).toBe(9);

    // Replay back to ply 3 (after exd5): only 1 pawn captured by White
    const atPly3 = replayPosition(records, 3);
    expect(atPly3.capturedPieces).toEqual({ w: ['p'], b: [] });
    expect(atPly3.materialDiff).toBe(1);
    expect(atPly3.lastMove?.san).toBe('exd5');
  });

  it('detects checkmate and highlights king in check square', () => {
    // Fool's mate
    const { records, lastGameOver } = playSequence([
      { from: 'f2', to: 'f3' },
      { from: 'e7', to: 'e5' },
      { from: 'g2', to: 'g4' },
      { from: 'd8', to: 'h4' },
    ]);

    expect(lastGameOver?.isCheck).toBe(true);
    expect(lastGameOver?.gameOver).toEqual({
      kind: 'ended',
      winner: 'b',
      reason: 'checkmate',
    });

    const pos = replayPosition(records);
    expect(pos.inCheck).toBe(true);
    expect(pos.kingInCheckSquare).toBe('e1');
    expect(pos.status).toEqual({
      kind: 'ended',
      winner: 'b',
      reason: 'checkmate',
    });
  });

  it('detects stalemate', () => {
    const fen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
    const res = applyMove(fen, 'f7', 'g6'); // illegal (g6 occupied)
    expect(res).toBeNull();

    const stalemateFen = '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1';
    const move = applyMove(stalemateFen, 'g6', 'g7');
    expect(move).not.toBeNull();
    // Qg7 is checkmate! Let's use a real stalemate move: Qb6-c7 or Qf7-f6
    const fenBeforeStalemate = '7k/5Q2/5K2/8/8/8/8/8 w - - 0 1';
    const stale = applyMove(fenBeforeStalemate, 'f7', 'g6');
    expect(stale?.gameOver).toEqual({
      kind: 'ended',
      winner: 'draw',
      reason: 'stalemate',
    });
  });

  it('detects insufficient material draw', () => {
    const fen = '7k/8/8/8/8/8/6n1/6BK w - - 0 1';
    const res = applyMove(fen, 'h1', 'g2');
    expect(res?.gameOver).toEqual({
      kind: 'ended',
      winner: 'draw',
      reason: 'insufficient-material',
    });
  });

  it('detects threefold repetition across prior move history', () => {
    const { lastGameOver } = playSequence([
      { from: 'g1', to: 'f3' },
      { from: 'g8', to: 'f6' },
      { from: 'f3', to: 'g1' },
      { from: 'f6', to: 'g8' },
      { from: 'g1', to: 'f3' },
      { from: 'g8', to: 'f6' },
      { from: 'f3', to: 'g1' },
      { from: 'f6', to: 'g8' },
    ]);

    expect(lastGameOver?.gameOver).toEqual({
      kind: 'ended',
      winner: 'draw',
      reason: 'threefold-repetition',
    });
  });

  it('detects fifty-move draw', () => {
    const fenAt99HalfMoves = '8/8/8/8/8/1k6/8/1K1R4 w - - 99 60';
    const res = applyMove(fenAt99HalfMoves, 'd1', 'd2');
    expect(res?.gameOver).toEqual({
      kind: 'ended',
      winner: 'draw',
      reason: 'fifty-move',
    });
  });

  it('evaluates sufficient mating material for timeout adjudication', () => {
    // Bare king -> insufficient
    expect(hasSufficientMatingMaterial('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'w')).toBe(false);
    // K+N -> insufficient
    expect(hasSufficientMatingMaterial('4k3/8/8/8/8/8/8/4KN2 w - - 0 1', 'w')).toBe(false);
    // K+B -> insufficient
    expect(hasSufficientMatingMaterial('4k3/8/8/8/8/8/8/4KB2 w - - 0 1', 'w')).toBe(false);
    // K+P -> sufficient
    expect(hasSufficientMatingMaterial('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'w')).toBe(true);
    // K+R -> sufficient
    expect(hasSufficientMatingMaterial('4k3/8/8/8/8/8/8/4KR2 w - - 0 1', 'w')).toBe(true);
    // K+Q -> sufficient
    expect(hasSufficientMatingMaterial('4k3/8/8/8/8/8/8/4KQ2 w - - 0 1', 'w')).toBe(true);
    // K+B+N -> sufficient
    expect(hasSufficientMatingMaterial('4k3/8/8/8/8/8/8/3BKN2 w - - 0 1', 'w')).toBe(true);
    // Color-specific check: Black has bare king while White has a queen
    expect(hasSufficientMatingMaterial('4k3/8/8/8/8/8/8/4KQ2 w - - 0 1', 'b')).toBe(false);
  });
});
