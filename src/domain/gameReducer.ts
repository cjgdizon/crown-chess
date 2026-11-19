import {
  INITIAL_FEN,
  applyMove,
  getLiveFen,
  getTurnFromMoves,
  hasSufficientMatingMaterial,
  isPromotionMove,
  type AppliedMove,
} from './chessRules';
import { commitClockOnMove, createInitialClock, isTimed, pauseClock } from './clockLogic';
import {
  oppositeColor,
  type ClockBank,
  type Color,
  type GameAction,
  type GameConfig,
  type GameEffect,
  type GameState,
  type GameStatus,
  type MoveRecord,
  type Preferences,
  type SoundKind,
} from './types';

export type { GameAction, GameEffect, SoundKind };

function isAiTurn(config: GameConfig, turn: Color): boolean {
  return config.mode.kind === 'ai' && config.mode.humanColor !== turn;
}

function selectMoveSound(applied: AppliedMove): SoundKind {
  if (applied.isCheck) return 'check';
  if (applied.promotion !== undefined) return 'promote';
  if (applied.isCastle) return 'castle';
  if (applied.captured !== undefined) return 'capture';
  return 'move';
}

function createTimeoutStatus(fen: string, loser: Color): GameStatus {
  const opponent = oppositeColor(loser);
  if (hasSufficientMatingMaterial(fen, opponent)) {
    return { kind: 'ended', winner: opponent, reason: 'timeout' };
  }
  return { kind: 'ended', winner: 'draw', reason: 'timeout-insufficient-material' };
}

export function reduceGame(
  state: GameState | null,
  action: GameAction,
  nowMs: number,
  prefs: Pick<Preferences, 'autoFlipLocal' | 'evalBarVisible'>
): { state: GameState | null; effects: GameEffect[] } {
  switch (action.type) {
    case 'START_GAME': {
      const { config, gameId } = action;
      const orientation: Color = config.mode.kind === 'ai' ? config.mode.humanColor : 'w';
      const aiPlaysFirst = config.mode.kind === 'ai' && config.mode.humanColor === 'b';

      const nextState: GameState = {
        gameId,
        config,
        moves: [],
        viewPly: 0,
        orientation,
        status: { kind: 'playing' },
        clock: createInitialClock(config.timeControl),
        aiThinking: aiPlaysFirst,
        engineStatus: state?.engineStatus ?? 'idle',
        evaluation: null,
        activeHint: null,
        pendingPromotion: null,
        drawOfferedBy: null,
      };

      const effects: GameEffect[] = [
        { type: 'ABORT_ENGINE' },
        { type: 'PLAY_SOUND', sound: 'game-start' },
        { type: 'PERSIST_SNAPSHOT' },
      ];

      if (aiPlaysFirst && config.mode.kind === 'ai') {
        effects.push({
          type: 'REQUEST_AI_MOVE',
          fen: INITIAL_FEN,
          difficulty: config.mode.difficulty,
          gameId,
          expectedPly: 0,
        });
      } else if (prefs.evalBarVisible) {
        effects.push({ type: 'REQUEST_EVAL', fen: INITIAL_FEN });
      }

      return { state: nextState, effects };
    }

    case 'RESTORE_GAME': {
      const { snapshot } = action;
      const moves = [...snapshot.moves];
      const liveFen = getLiveFen(moves);
      const turn = getTurnFromMoves(moves);
      const playing = snapshot.status.kind === 'playing';
      const timed = isTimed(snapshot.config.timeControl);
      const aiToMove = playing && isAiTurn(snapshot.config, turn);

      const nextState: GameState = {
        gameId: snapshot.gameId,
        config: snapshot.config,
        moves,
        viewPly: moves.length,
        orientation: snapshot.orientation,
        status: snapshot.status,
        clock: {
          bankMs: { ...snapshot.clockBankMs },
          activeSinceMs: playing && timed && moves.length >= 1 ? nowMs : null,
        },
        aiThinking: aiToMove,
        engineStatus: state?.engineStatus ?? 'idle',
        evaluation: null,
        activeHint: null,
        pendingPromotion: null,
        drawOfferedBy: null,
      };

      const effects: GameEffect[] = [{ type: 'ABORT_ENGINE' }];

      if (aiToMove && snapshot.config.mode.kind === 'ai') {
        effects.push({
          type: 'REQUEST_AI_MOVE',
          fen: liveFen,
          difficulty: snapshot.config.mode.difficulty,
          gameId: snapshot.gameId,
          expectedPly: moves.length,
        });
      } else if (prefs.evalBarVisible) {
        effects.push({ type: 'REQUEST_EVAL', fen: liveFen });
      }

      return { state: nextState, effects };
    }

    case 'COMMIT_MOVE': {
      if (!state || state.status.kind !== 'playing') {
        return { state, effects: [] };
      }
      if (action.source === 'human' && state.viewPly !== state.moves.length) {
        return { state, effects: [] };
      }

      const turn = getTurnFromMoves(state.moves);
      const aiTurn = isAiTurn(state.config, turn);
      if (action.source === 'human' && aiTurn) {
        return { state, effects: [] };
      }
      if (action.source === 'ai' && !aiTurn) {
        return { state, effects: [] };
      }

      const liveFen = getLiveFen(state.moves);
      const applied = applyMove(liveFen, action.from, action.to, action.promotion, state.moves);
      if (!applied) {
        return { state, effects: [] };
      }

      const plyAfterMove = state.moves.length + 1;
      const clockResult = commitClockOnMove(
        state.clock,
        turn,
        nowMs,
        state.config.timeControl,
        plyAfterMove
      );

      if (clockResult.expired) {
        const timeoutStatus = createTimeoutStatus(liveFen, turn);
        return {
          state: {
            ...state,
            status: timeoutStatus,
            clock: clockResult.clock,
            aiThinking: false,
            activeHint: null,
            pendingPromotion: null,
            drawOfferedBy: null,
          },
          effects: [
            { type: 'ABORT_ENGINE' },
            { type: 'PLAY_SOUND', sound: 'game-end' },
            { type: 'CLEAR_SNAPSHOT' },
          ],
        };
      }

      const record: MoveRecord = {
        ply: plyAfterMove,
        uci: applied.uci,
        san: applied.san,
        from: applied.from,
        to: applied.to,
        color: applied.color,
        fenAfter: applied.fenAfter,
        ...(applied.captured !== undefined ? { captured: applied.captured } : {}),
        ...(applied.promotion !== undefined ? { promotion: applied.promotion } : {}),
        isCheck: applied.isCheck,
        isCastle: applied.isCastle,
        clockAfterMs: { ...clockResult.clock.bankMs },
      };

      const nextMoves = [...state.moves, record];
      const nextStatus = applied.gameOver;
      const ended = nextStatus.kind === 'ended';
      const nextTurn = oppositeColor(turn);
      const nextAiTurn = !ended && isAiTurn(state.config, nextTurn);

      const nextClock: GameState['clock'] = ended
        ? { bankMs: { ...clockResult.clock.bankMs }, activeSinceMs: null }
        : clockResult.clock;

      const nextOrientation: Color =
        !ended && state.config.mode.kind === 'local' && prefs.autoFlipLocal
          ? nextTurn
          : state.orientation;

      const wasViewingLive = state.viewPly === state.moves.length;
      const nextState: GameState = {
        ...state,
        moves: nextMoves,
        viewPly: wasViewingLive ? nextMoves.length : state.viewPly,
        orientation: nextOrientation,
        status: nextStatus,
        clock: nextClock,
        aiThinking: nextAiTurn,
        activeHint: null,
        pendingPromotion: null,
        drawOfferedBy: null,
      };

      const effects: GameEffect[] = [];

      if (ended) {
        effects.push({ type: 'ABORT_ENGINE' });
        effects.push({ type: 'PLAY_SOUND', sound: 'game-end' });
        effects.push({ type: 'CLEAR_SNAPSHOT' });
      } else {
        effects.push({ type: 'PLAY_SOUND', sound: selectMoveSound(applied) });
        effects.push({ type: 'PERSIST_SNAPSHOT' });
        if (nextAiTurn && state.config.mode.kind === 'ai') {
          effects.push({
            type: 'REQUEST_AI_MOVE',
            fen: applied.fenAfter,
            difficulty: state.config.mode.difficulty,
            gameId: state.gameId,
            expectedPly: nextMoves.length,
          });
        } else if (prefs.evalBarVisible) {
          effects.push({ type: 'REQUEST_EVAL', fen: applied.fenAfter });
        }
      }

      return { state: nextState, effects };
    }

    case 'OPEN_PROMOTION': {
      if (!state || state.status.kind !== 'playing') {
        return { state, effects: [] };
      }
      if (state.viewPly !== state.moves.length) {
        return { state, effects: [] };
      }
      const turn = getTurnFromMoves(state.moves);
      if (isAiTurn(state.config, turn)) {
        return { state, effects: [] };
      }
      const liveFen = getLiveFen(state.moves);
      if (!isPromotionMove(liveFen, action.from, action.to)) {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          pendingPromotion: { from: action.from, to: action.to, color: turn },
        },
        effects: [],
      };
    }

    case 'CANCEL_PROMOTION': {
      if (!state || state.pendingPromotion === null) {
        return { state, effects: [] };
      }
      return {
        state: { ...state, pendingPromotion: null },
        effects: [],
      };
    }

    case 'UNDO_MOVE': {
      if (!state || state.status.kind !== 'playing') {
        return { state, effects: [] };
      }

      let popCount = 0;
      if (state.config.mode.kind === 'local') {
        if (state.moves.length === 0) {
          return { state, effects: [] };
        }
        popCount = 1;
      } else if (state.aiThinking) {
        if (state.moves.length === 0) {
          return { state, effects: [] };
        }
        popCount = 1;
      } else {
        if (state.moves.length < 2) {
          return { state, effects: [] };
        }
        popCount = 2;
      }

      const nextMoves = state.moves.slice(0, state.moves.length - popCount);
      const lastRemaining = nextMoves.at(-1);
      const restoredBankMs: ClockBank = lastRemaining
        ? { ...lastRemaining.clockAfterMs }
        : createInitialClock(state.config.timeControl).bankMs;

      const timed = isTimed(state.config.timeControl);
      const nextTurn = getTurnFromMoves(nextMoves);
      const nextOrientation: Color =
        state.config.mode.kind === 'local' && prefs.autoFlipLocal ? nextTurn : state.orientation;
      const nextFen = getLiveFen(nextMoves);

      const wasViewingLive = state.viewPly === state.moves.length;
      const nextState: GameState = {
        ...state,
        moves: nextMoves,
        viewPly: wasViewingLive ? nextMoves.length : state.viewPly,
        orientation: nextOrientation,
        clock: {
          bankMs: restoredBankMs,
          activeSinceMs: timed && nextMoves.length >= 1 ? nowMs : null,
        },
        aiThinking: false,
        activeHint: null,
        pendingPromotion: null,
        drawOfferedBy: null,
      };

      const effects: GameEffect[] = [{ type: 'ABORT_ENGINE' }, { type: 'PERSIST_SNAPSHOT' }];
      if (prefs.evalBarVisible) {
        effects.push({ type: 'REQUEST_EVAL', fen: nextFen });
      }

      return { state: nextState, effects };
    }

    case 'SET_VIEW_PLY': {
      if (!state) {
        return { state, effects: [] };
      }
      const clamped = Math.max(0, Math.min(state.moves.length, Math.trunc(action.ply)));
      if (clamped === state.viewPly && state.pendingPromotion === null) {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          viewPly: clamped,
          pendingPromotion: null,
        },
        effects: [],
      };
    }

    case 'FLIP_BOARD': {
      if (!state) {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          orientation: oppositeColor(state.orientation),
        },
        effects: [],
      };
    }

    case 'RESIGN': {
      if (!state || state.status.kind !== 'playing') {
        return { state, effects: [] };
      }
      const turn = getTurnFromMoves(state.moves);
      const pausedClock = pauseClock(state.clock, turn, nowMs, state.config.timeControl);
      return {
        state: {
          ...state,
          status: {
            kind: 'ended',
            winner: oppositeColor(action.color),
            reason: 'resignation',
          },
          clock: pausedClock,
          aiThinking: false,
          activeHint: null,
          pendingPromotion: null,
          drawOfferedBy: null,
        },
        effects: [
          { type: 'ABORT_ENGINE' },
          { type: 'PLAY_SOUND', sound: 'game-end' },
          { type: 'CLEAR_SNAPSHOT' },
        ],
      };
    }

    case 'OFFER_OR_ACCEPT_DRAW': {
      if (!state || state.status.kind !== 'playing' || state.config.mode.kind !== 'local') {
        return { state, effects: [] };
      }
      if (state.drawOfferedBy === null) {
        return {
          state: { ...state, drawOfferedBy: action.color },
          effects: [],
        };
      }
      if (state.drawOfferedBy === action.color) {
        return { state, effects: [] };
      }

      const turn = getTurnFromMoves(state.moves);
      const pausedClock = pauseClock(state.clock, turn, nowMs, state.config.timeControl);
      return {
        state: {
          ...state,
          status: { kind: 'ended', winner: 'draw', reason: 'mutual-draw' },
          clock: pausedClock,
          aiThinking: false,
          activeHint: null,
          pendingPromotion: null,
          drawOfferedBy: null,
        },
        effects: [
          { type: 'ABORT_ENGINE' },
          { type: 'PLAY_SOUND', sound: 'game-end' },
          { type: 'CLEAR_SNAPSHOT' },
        ],
      };
    }

    case 'DECLINE_DRAW': {
      if (!state || state.drawOfferedBy === null) {
        return { state, effects: [] };
      }
      return {
        state: { ...state, drawOfferedBy: null },
        effects: [],
      };
    }

    case 'TIME_EXPIRED': {
      if (!state || state.status.kind !== 'playing' || !isTimed(state.config.timeControl)) {
        return { state, effects: [] };
      }
      const turn = getTurnFromMoves(state.moves);
      const paused = pauseClock(state.clock, turn, nowMs, state.config.timeControl);
      const bankMs: ClockBank =
        action.loser === 'w'
          ? { w: 0, b: paused.bankMs.b }
          : { w: paused.bankMs.w, b: 0 };

      const liveFen = getLiveFen(state.moves);
      const timeoutStatus = createTimeoutStatus(liveFen, action.loser);

      return {
        state: {
          ...state,
          status: timeoutStatus,
          clock: { bankMs, activeSinceMs: null },
          aiThinking: false,
          activeHint: null,
          pendingPromotion: null,
          drawOfferedBy: null,
        },
        effects: [
          { type: 'ABORT_ENGINE' },
          { type: 'PLAY_SOUND', sound: 'game-end' },
          { type: 'CLEAR_SNAPSHOT' },
        ],
      };
    }

    case 'ENGINE_STATUS_CHANGED': {
      if (!state) {
        return { state, effects: [] };
      }
      if (state.engineStatus === action.status && !(action.status === 'error' && state.aiThinking)) {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          engineStatus: action.status,
          aiThinking: action.status === 'error' ? false : state.aiThinking,
        },
        effects: [],
      };
    }

    case 'ENGINE_EVAL_UPDATED': {
      if (!state) {
        return { state, effects: [] };
      }
      if (getLiveFen(state.moves) !== action.fen) {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          evaluation: action.evaluation,
        },
        effects: [],
      };
    }

    case 'REQUEST_HINT': {
      if (
        !state ||
        state.status.kind !== 'playing' ||
        state.viewPly !== state.moves.length ||
        state.aiThinking
      ) {
        return { state, effects: [] };
      }
      return {
        state,
        effects: [{ type: 'REQUEST_HINT', fen: getLiveFen(state.moves) }],
      };
    }

    case 'HINT_RECEIVED': {
      if (!state || state.status.kind !== 'playing' || state.aiThinking) {
        return { state, effects: [] };
      }
      if (getLiveFen(state.moves) !== action.fen) {
        return { state, effects: [] };
      }
      return {
        state: {
          ...state,
          activeHint: { from: action.from, to: action.to, uci: action.uci },
        },
        effects: [],
      };
    }

    case 'CLEAR_HINT': {
      if (!state || state.activeHint === null) {
        return { state, effects: [] };
      }
      return {
        state: { ...state, activeHint: null },
        effects: [],
      };
    }

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
