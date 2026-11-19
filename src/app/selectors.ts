import {
  getTurnFromMoves,
  replayPosition,
  type BoardPiece,
} from '../domain/chessRules';
import { isTimed } from '../domain/clockLogic';
import type { SavedGameSnapshot } from '../domain/contracts';
import {
  DIFFICULTY_PRESET_BY_ID,
  oppositeColor,
  type ActiveHint,
  type ClockBank,
  type Color,
  type Evaluation,
  type GameState,
  type MoveRecord,
  type PendingPromotion,
  type PieceType,
  type Square,
} from '../domain/types';

export const LOW_TIME_THRESHOLD_MS = 20_000;

export interface BoardViewModel {
  board: (BoardPiece | null)[][];
  turn: Color;
  orientation: Color;
  isViewingLive: boolean;
  canInteract: boolean;
  legalMoves: Record<Square, Square[]>;
  lastMove: MoveRecord | null;
  kingInCheckSquare: Square | null;
  activeHint: ActiveHint | null;
  pendingPromotion: PendingPromotion | null;
  viewPly: number;
  totalPlies: number;
}

export interface PlayerBarVM {
  color: Color;
  label: string;
  subtitle: string;
  isTurn: boolean;
  isThinking: boolean;
  clockMs: number;
  isLowTime: boolean;
  isTimed: boolean;
  capturedPieces: PieceType[];
  materialAdvantage: number;
}

export interface MoveRow {
  moveNumber: number;
  white: MoveRecord;
  black?: MoveRecord;
}

export interface SavedGameSummary {
  gameId: string;
  modeKind: 'ai' | 'local';
  modeLabel: string;
  difficultyLabel: string | null;
  humanColor: Color | null;
  moveCount: number;
  plyCount: number;
  timeControlLabel: string;
  isTimed: boolean;
  clockBankMs: ClockBank;
  savedAtIso: string;
}

export interface FormattedEvaluation {
  label: string;
  whitePercent: number;
}

export function selectBoardViewModel(state: GameState): BoardViewModel {
  const replayed = replayPosition(state.moves, state.viewPly);
  const isViewingLive = state.viewPly === state.moves.length;
  const canInteract = state.status.kind === 'playing' && isViewingLive && !state.aiThinking;

  return {
    board: replayed.board,
    turn: replayed.turn,
    orientation: state.orientation,
    isViewingLive,
    canInteract,
    legalMoves: replayed.legalMoves,
    lastMove: replayed.lastMove,
    kingInCheckSquare: replayed.kingInCheckSquare,
    activeHint: isViewingLive ? state.activeHint : null,
    pendingPromotion: isViewingLive ? state.pendingPromotion : null,
    viewPly: state.viewPly,
    totalPlies: state.moves.length,
  };
}

export function selectPlayerBars(
  state: GameState,
  liveClockMs: ClockBank
): { top: PlayerBarVM; bottom: PlayerBarVM } {
  const replayed = replayPosition(state.moves, state.viewPly);
  const liveTurn = getTurnFromMoves(state.moves);
  const timed = isTimed(state.config.timeControl);
  const playing = state.status.kind === 'playing';

  const buildBar = (color: Color): PlayerBarVM => {
    const mode = state.config.mode;
    let label: string;
    let subtitle: string;
    let isAiSide = false;

    if (mode.kind === 'ai') {
      if (mode.humanColor === color) {
        label = 'You';
        subtitle = color === 'w' ? 'White' : 'Black';
      } else {
        const preset = DIFFICULTY_PRESET_BY_ID[mode.difficulty];
        label = 'Stockfish';
        subtitle = `${preset.label} (${preset.approxElo})`;
        isAiSide = true;
      }
    } else {
      label = color === 'w' ? 'White' : 'Black';
      subtitle = 'Local Player';
    }

    const clockMs = Math.max(0, liveClockMs[color]);
    const materialAdvantage =
      color === 'w'
        ? Math.max(0, replayed.materialDiff)
        : Math.max(0, -replayed.materialDiff);

    return {
      color,
      label,
      subtitle,
      isTurn: playing && liveTurn === color,
      isThinking: playing && state.aiThinking && isAiSide,
      clockMs,
      isLowTime: timed && clockMs < LOW_TIME_THRESHOLD_MS,
      isTimed: timed,
      capturedPieces: replayed.capturedPieces[color],
      materialAdvantage,
    };
  };

  const bottomColor = state.orientation;
  const topColor = oppositeColor(bottomColor);

  return {
    top: buildBar(topColor),
    bottom: buildBar(bottomColor),
  };
}

export function selectMoveRows(moves: readonly MoveRecord[]): MoveRow[] {
  const rows: MoveRow[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const white = moves[i];
    if (!white) {
      break;
    }
    const black = moves[i + 1];
    rows.push({
      moveNumber: Math.floor(i / 2) + 1,
      white,
      ...(black !== undefined ? { black } : {}),
    });
  }
  return rows;
}

export function selectCanUndo(state: GameState): boolean {
  if (state.status.kind !== 'playing') {
    return false;
  }
  if (state.config.mode.kind === 'local') {
    return state.moves.length >= 1;
  }
  if (state.aiThinking) {
    return state.moves.length >= 1;
  }
  return state.moves.length >= 2;
}

export function selectSavedGameSummary(snapshot: SavedGameSnapshot | null): SavedGameSummary | null {
  if (!snapshot || snapshot.status.kind !== 'playing') {
    return null;
  }

  const mode = snapshot.config.mode;
  let modeLabel: string;
  let difficultyLabel: string | null;
  let humanColor: Color | null;

  if (mode.kind === 'ai') {
    const preset = DIFFICULTY_PRESET_BY_ID[mode.difficulty];
    difficultyLabel = `${preset.label} (${preset.approxElo})`;
    modeLabel = `vs Stockfish · ${difficultyLabel}`;
    humanColor = mode.humanColor;
  } else {
    difficultyLabel = null;
    modeLabel = 'Local 2-Player';
    humanColor = null;
  }

  return {
    gameId: snapshot.gameId,
    modeKind: mode.kind,
    modeLabel,
    difficultyLabel,
    humanColor,
    moveCount: Math.ceil(snapshot.moves.length / 2),
    plyCount: snapshot.moves.length,
    timeControlLabel: snapshot.config.timeControl.label,
    isTimed: isTimed(snapshot.config.timeControl),
    clockBankMs: { ...snapshot.clockBankMs },
    savedAtIso: snapshot.savedAtIso,
  };
}

export function formatClockMs(ms: number, showTenthsWhenLow = true): string {
  const clamped = Math.max(0, ms);

  if (showTenthsWhenLow && clamped < LOW_TIME_THRESHOLD_MS) {
    const totalTenths = Math.floor(clamped / 100);
    const totalSeconds = Math.floor(totalTenths / 10);
    const tenths = totalTenths % 10;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
  }

  const totalSeconds = Math.ceil(clamped / 1000);
  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatEvaluation(ev: Evaluation | null): FormattedEvaluation {
  if (ev === null) {
    return { label: '0.0', whitePercent: 50 };
  }

  if (ev.kind === 'mate') {
    if (ev.whiteMateIn === 0) {
      return { label: 'M0', whitePercent: 50 };
    }
    if (ev.whiteMateIn > 0) {
      return { label: `M${ev.whiteMateIn}`, whitePercent: 100 };
    }
    return { label: `-M${Math.abs(ev.whiteMateIn)}`, whitePercent: 0 };
  }

  // Lichess-style logistic curve clamped to [4, 96] so non-mate positions stay distinguishable from mate.
  const winChance = 2 / (1 + Math.exp(-0.00368208 * ev.whiteCp)) - 1;
  const whitePercent = Math.max(4, Math.min(96, Math.round((50 + 50 * winChance) * 10) / 10));

  const roundedPawns = Math.round((ev.whiteCp / 100) * 10) / 10;
  let label: string;
  if (roundedPawns === 0) {
    label = '0.0';
  } else if (roundedPawns > 0) {
    label = `+${roundedPawns.toFixed(1)}`;
  } else {
    label = roundedPawns.toFixed(1);
  }

  return { label, whitePercent };
}
