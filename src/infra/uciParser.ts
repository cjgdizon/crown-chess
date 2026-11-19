import {
  isPromotionPiece,
  isSquare,
  type Color,
  type Evaluation,
  type PromotionPiece,
  type Square,
} from '../domain/types';

export interface ParsedUciMove {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}

const DEPTH_RE = /\bdepth\s+(\d+)\b/;
const SCORE_RE = /\bscore\s+(cp|mate)\s+(-?\d+)\b/;
const BOUND_RE = /\b(?:lowerbound|upperbound)\b/;
const BESTMOVE_RE = /^bestmove\s+(\S+)/;

/** Extracts the active side-to-move from a FEN string; defaults to 'w' if malformed. */
export function getFenActiveColor(fen: string): Color {
  const fields = fen.trim().split(/\s+/);
  return fields[1] === 'b' ? 'b' : 'w';
}

/**
 * Parses a UCI `info` line containing `score cp` or `score mate` and normalizes the score
 * to White's perspective (+ favors White, - favors Black).
 * Ignores `lowerbound` / `upperbound` aspiration-window lines and `info string` diagnostics.
 */
export function parseUciInfoScore(line: string, activeColor: Color): Evaluation | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('info ') || trimmed.startsWith('info string ')) {
    return null;
  }

  // Strip principal variation tail so move text cannot interfere with keyword matching.
  const pvIndex = trimmed.indexOf(' pv ');
  const header = pvIndex >= 0 ? trimmed.slice(0, pvIndex) : trimmed;

  if (BOUND_RE.test(header)) {
    return null;
  }

  const scoreMatch = SCORE_RE.exec(header);
  if (!scoreMatch) {
    return null;
  }

  const scoreKind = scoreMatch[1];
  const rawScoreText = scoreMatch[2];
  if (!scoreKind || !rawScoreText) {
    return null;
  }

  const rawScore = Number.parseInt(rawScoreText, 10);
  if (!Number.isFinite(rawScore)) {
    return null;
  }

  const depthMatch = DEPTH_RE.exec(header);
  const depthText = depthMatch?.[1];
  const depth = depthText !== undefined ? Number.parseInt(depthText, 10) : 0;
  if (!Number.isFinite(depth)) {
    return null;
  }

  const sign = activeColor === 'b' ? -1 : 1;
  const normalized = rawScore === 0 ? 0 : rawScore * sign;

  if (scoreKind === 'cp') {
    return { kind: 'cp', whiteCp: normalized, depth };
  }

  if (scoreKind === 'mate') {
    return { kind: 'mate', whiteMateIn: normalized, depth };
  }

  return null;
}

/** Parses a 4- or 5-character UCI move string into validated domain squares and promotion piece. */
export function parseUciMoveParts(uci: string): ParsedUciMove | null {
  const trimmed = uci.trim();
  if (trimmed.length !== 4 && trimmed.length !== 5) {
    return null;
  }

  const from = trimmed.slice(0, 2);
  const to = trimmed.slice(2, 4);
  if (!isSquare(from) || !isSquare(to)) {
    return null;
  }

  if (trimmed.length === 5) {
    const promo = trimmed.slice(4, 5);
    if (!isPromotionPiece(promo)) {
      return null;
    }
    return { from, to, promotion: promo };
  }

  return { from, to };
}

/** Parses a UCI `bestmove <move>` line; returns null for `bestmove (none)` or invalid moves. */
export function parseUciBestMove(line: string): string | null {
  const trimmed = line.trim();
  const match = BESTMOVE_RE.exec(trimmed);
  const token = match?.[1];
  if (!token || token === '(none)' || token === '0000') {
    return null;
  }

  return parseUciMoveParts(token) !== null ? token : null;
}
