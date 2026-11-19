import { useMemo, useSyncExternalStore } from 'react';
import { getLiveFen, getTurnFromMoves, isPromotionMove } from '../domain/chessRules';
import { computeLiveClockMs, pauseClock } from '../domain/clockLogic';
import type {
  ChessEngine,
  SavedGameSnapshot,
  SoundPlayer,
  StorageRepo,
} from '../domain/contracts';
import { reduceGame } from '../domain/gameReducer';
import {
  DIFFICULTY_PRESET_BY_ID,
  type ClockBank,
  type Color,
  type EngineStatus,
  type GameAction,
  type GameConfig,
  type GameEffect,
  type GameState,
  type PromotionPiece,
  type Square,
} from '../domain/types';
import { ClockTicker } from '../infra/clockTicker';
import { LocalStorageRepo } from '../infra/localStorageRepo';
import { StockfishEngine } from '../infra/stockfishEngine';
import { parseUciMoveParts } from '../infra/uciParser';
import { WebAudioSoundPlayer } from '../infra/webAudioPlayer';
import { PreferencesStore, preferencesStore } from './preferencesStore';
import { selectSavedGameSummary, type SavedGameSummary } from './selectors';

export interface GameStoreDeps {
  engine?: ChessEngine;
  soundPlayer?: SoundPlayer;
  storageRepo?: StorageRepo;
  preferencesStore?: PreferencesStore;
  now?: () => number;
  createGameId?: () => string;
  tickIntervalMs?: number;
}

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function defaultCreateGameId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `game-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class GameStore {
  private readonly engine: ChessEngine;
  private readonly soundPlayer: SoundPlayer;
  private readonly storageRepo: StorageRepo;
  private readonly prefsStore: PreferencesStore;
  private readonly now: () => number;
  private readonly createGameId: () => string;

  private state: GameState | null = null;
  private liveClockMs: ClockBank = { w: 0, b: 0 };
  private savedSnapshot: SavedGameSnapshot | null;
  private latestEngineStatus: EngineStatus = 'idle';
  private lastEvalBarVisible: boolean;
  private disposed = false;

  private readonly stateListeners = new Set<() => void>();
  private readonly clockListeners = new Set<() => void>();
  private readonly savedListeners = new Set<() => void>();

  private readonly unsubEngineStatus: () => void;
  private readonly unsubPrefs: () => void;
  private readonly clockTicker: ClockTicker;

  constructor(deps: GameStoreDeps = {}) {
    this.engine = deps.engine ?? new StockfishEngine();
    this.soundPlayer = deps.soundPlayer ?? new WebAudioSoundPlayer();
    this.storageRepo = deps.storageRepo ?? new LocalStorageRepo();
    this.prefsStore = deps.preferencesStore ?? preferencesStore;
    this.now = deps.now ?? defaultNow;
    this.createGameId = deps.createGameId ?? defaultCreateGameId;

    this.savedSnapshot = this.storageRepo.loadGameSnapshot();
    this.lastEvalBarVisible = this.prefsStore.getSnapshot().evalBarVisible;

    this.unsubEngineStatus = this.engine.onStatusChange((status) => {
      this.latestEngineStatus = status;
      if (this.state) {
        this.dispatch({ type: 'ENGINE_STATUS_CHANGED', status });
      }
    });

    this.unsubPrefs = this.prefsStore.subscribe(() => {
      this.handlePreferencesChanged();
    });

    this.clockTicker = new ClockTicker({
      getClockSource: () => {
        if (!this.state) {
          return null;
        }
        return {
          playing: this.state.status.kind === 'playing',
          timeControl: this.state.config.timeControl,
          clock: this.state.clock,
          turn: getTurnFromMoves(this.state.moves),
        };
      },
      onTick: (nowMs) => {
        this.refreshLiveClock(nowMs);
      },
      onTimeout: (loser) => {
        this.dispatch({ type: 'TIME_EXPIRED', loser });
      },
      onFlushSnapshot: () => {
        this.persistCurrentSnapshot();
      },
      now: this.now,
      ...(deps.tickIntervalMs !== undefined ? { intervalMs: deps.tickIntervalMs } : {}),
    });
  }

  readonly getSnapshot = (): GameState | null => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  };

  readonly getLiveClockSnapshot = (): ClockBank => this.liveClockMs;

  readonly subscribeLiveClock = (listener: () => void): (() => void) => {
    this.clockListeners.add(listener);
    return () => {
      this.clockListeners.delete(listener);
    };
  };

  readonly getSavedGameSnapshot = (): SavedGameSnapshot | null => this.savedSnapshot;

  readonly subscribeSavedSnapshot = (listener: () => void): (() => void) => {
    this.savedListeners.add(listener);
    return () => {
      this.savedListeners.delete(listener);
    };
  };

  startGame(config: GameConfig): void {
    this.dispatch({
      type: 'START_GAME',
      config,
      gameId: this.createGameId(),
    });
    if (this.state && this.state.engineStatus !== this.latestEngineStatus) {
      this.dispatch({ type: 'ENGINE_STATUS_CHANGED', status: this.latestEngineStatus });
    }
  }

  resumeSavedGame(): boolean {
    const snapshot = this.savedSnapshot ?? this.storageRepo.loadGameSnapshot();
    if (!snapshot || snapshot.status.kind !== 'playing') {
      return false;
    }
    this.dispatch({ type: 'RESTORE_GAME', snapshot });
    if (this.state && this.state.engineStatus !== this.latestEngineStatus) {
      this.dispatch({ type: 'ENGINE_STATUS_CHANGED', status: this.latestEngineStatus });
    }
    return true;
  }

  attemptMove(from: Square, to: Square): void {
    const current = this.state;
    if (
      !current ||
      current.status.kind !== 'playing' ||
      current.viewPly !== current.moves.length ||
      current.aiThinking
    ) {
      return;
    }

    const liveFen = getLiveFen(current.moves);
    if (isPromotionMove(liveFen, from, to)) {
      this.dispatch({ type: 'OPEN_PROMOTION', from, to });
      return;
    }

    this.dispatch({ type: 'COMMIT_MOVE', from, to, source: 'human' });
  }

  confirmPromotion(piece: PromotionPiece): void {
    const pending = this.state?.pendingPromotion;
    if (!pending) {
      return;
    }
    this.dispatch({
      type: 'COMMIT_MOVE',
      from: pending.from,
      to: pending.to,
      promotion: piece,
      source: 'human',
    });
  }

  cancelPromotion(): void {
    this.dispatch({ type: 'CANCEL_PROMOTION' });
  }

  undoMove(): void {
    this.dispatch({ type: 'UNDO_MOVE' });
  }

  setViewPly(ply: number): void {
    this.dispatch({ type: 'SET_VIEW_PLY', ply });
  }

  flipBoard(): void {
    this.dispatch({ type: 'FLIP_BOARD' });
  }

  resign(color: Color): void {
    this.dispatch({ type: 'RESIGN', color });
  }

  offerOrAcceptDraw(color: Color): void {
    this.dispatch({ type: 'OFFER_OR_ACCEPT_DRAW', color });
  }

  declineDraw(): void {
    this.dispatch({ type: 'DECLINE_DRAW' });
  }

  requestHint(): void {
    this.dispatch({ type: 'REQUEST_HINT' });
  }

  clearHint(): void {
    this.dispatch({ type: 'CLEAR_HINT' });
  }

  /** Pauses active clock and engine and persists exact remaining banks before leaving to Menu. */
  pauseAndPersist(): void {
    const current = this.state;
    this.engine.cancelAll();

    if (!current) {
      this.clockTicker.sync();
      return;
    }

    if (current.status.kind === 'playing') {
      const turn = getTurnFromMoves(current.moves);
      const nowMs = this.now();
      const pausedClock = pauseClock(current.clock, turn, nowMs, current.config.timeControl);

      this.state = {
        ...current,
        clock: pausedClock,
        aiThinking: false,
        pendingPromotion: null,
      };
      this.persistCurrentSnapshot();
      this.refreshLiveClock(nowMs);
      this.clockTicker.sync();
      this.notifyStateListeners();
    } else {
      this.clockTicker.sync();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unsubEngineStatus();
    this.unsubPrefs();
    this.clockTicker.dispose();
    this.engine.dispose();
    this.stateListeners.clear();
    this.clockListeners.clear();
    this.savedListeners.clear();
  }

  private dispatch(action: GameAction): void {
    if (this.disposed) {
      return;
    }

    const nowMs = this.now();
    const prefs = this.prefsStore.getSnapshot();
    const prevState = this.state;
    const { state: nextState, effects } = reduceGame(prevState, action, nowMs, {
      autoFlipLocal: prefs.autoFlipLocal,
      evalBarVisible: prefs.evalBarVisible,
    });

    this.state = nextState;
    this.refreshLiveClock(nowMs);
    this.clockTicker.sync();

    if (nextState !== prevState) {
      this.notifyStateListeners();
    }

    for (const effect of effects) {
      this.runEffect(effect);
    }
  }

  private runEffect(effect: GameEffect): void {
    switch (effect.type) {
      case 'ABORT_ENGINE': {
        this.engine.cancelAll();
        break;
      }
      case 'REQUEST_AI_MOVE': {
        const preset = DIFFICULTY_PRESET_BY_ID[effect.difficulty];
        void this.engine
          .searchBestMove({
            fen: effect.fen,
            skillLevel: preset.skillLevel,
            depthCap: preset.depthCap,
            moveTimeMs: preset.moveTimeMs,
            minDelayMs: preset.minDelayMs,
          })
          .then((uci) => {
            if (!uci || this.disposed) {
              return;
            }
            const current = this.state;
            if (
              !current ||
              current.gameId !== effect.gameId ||
              current.moves.length !== effect.expectedPly ||
              current.status.kind !== 'playing'
            ) {
              return;
            }
            const parts = parseUciMoveParts(uci);
            if (!parts) {
              return;
            }
            this.dispatch({
              type: 'COMMIT_MOVE',
              from: parts.from,
              to: parts.to,
              ...(parts.promotion !== undefined ? { promotion: parts.promotion } : {}),
              source: 'ai',
            });
          })
          .catch(() => {
            // Engine failures surface via onStatusChange('error').
          });
        break;
      }
      case 'REQUEST_EVAL': {
        this.startEvaluationForFen(effect.fen);
        break;
      }
      case 'REQUEST_HINT': {
        void this.engine
          .searchHint(effect.fen)
          .then((hint) => {
            if (this.disposed) {
              return;
            }
            const current = this.state;
            if (!current || current.status.kind !== 'playing' || current.aiThinking) {
              return;
            }
            if (getLiveFen(current.moves) !== effect.fen) {
              return;
            }

            if (hint) {
              this.dispatch({
                type: 'HINT_RECEIVED',
                fen: effect.fen,
                from: hint.from,
                to: hint.to,
                uci: hint.uci,
              });
            }

            const afterHint = this.state;
            if (
              afterHint &&
              afterHint.status.kind === 'playing' &&
              !afterHint.aiThinking &&
              getLiveFen(afterHint.moves) === effect.fen &&
              this.prefsStore.getSnapshot().evalBarVisible
            ) {
              this.startEvaluationForFen(effect.fen);
            }
          })
          .catch(() => {
            // Engine failures surface via onStatusChange('error').
          });
        break;
      }
      case 'PLAY_SOUND': {
        if (this.prefsStore.getSnapshot().soundEnabled) {
          this.soundPlayer.play(effect.sound);
        }
        break;
      }
      case 'PERSIST_SNAPSHOT': {
        this.persistCurrentSnapshot();
        break;
      }
      case 'CLEAR_SNAPSHOT': {
        this.clearSavedSnapshot();
        break;
      }
      default: {
        const _exhaustive: never = effect;
        return _exhaustive;
      }
    }
  }

  private startEvaluationForFen(fen: string): void {
    this.engine.startEvaluation(fen, (evaluation) => {
      if (this.disposed) {
        return;
      }
      this.dispatch({ type: 'ENGINE_EVAL_UPDATED', fen, evaluation });
    });
  }

  private handlePreferencesChanged(): void {
    const evalBarVisible = this.prefsStore.getSnapshot().evalBarVisible;
    if (evalBarVisible === this.lastEvalBarVisible) {
      return;
    }

    const wasVisible = this.lastEvalBarVisible;
    this.lastEvalBarVisible = evalBarVisible;

    const current = this.state;
    if (!wasVisible && evalBarVisible) {
      if (current && current.status.kind === 'playing' && !current.aiThinking) {
        this.startEvaluationForFen(getLiveFen(current.moves));
      }
    } else if (wasVisible && !evalBarVisible) {
      if (!current || !current.aiThinking) {
        this.engine.cancelAll();
      }
    }
  }

  private persistCurrentSnapshot(): void {
    const current = this.state;
    if (!current || current.status.kind !== 'playing') {
      return;
    }

    const turn = getTurnFromMoves(current.moves);
    const clockBankMs = computeLiveClockMs(
      current.clock,
      turn,
      this.now(),
      current.config.timeControl
    );

    const snapshot: SavedGameSnapshot = {
      version: 1,
      savedAtIso: new Date().toISOString(),
      gameId: current.gameId,
      config: current.config,
      moves: current.moves,
      orientation: current.orientation,
      status: current.status,
      clockBankMs,
    };

    this.storageRepo.saveGameSnapshot(snapshot);
    this.savedSnapshot = snapshot;
    this.notifySavedListeners();
  }

  private clearSavedSnapshot(): void {
    this.storageRepo.clearGameSnapshot();
    if (this.savedSnapshot !== null) {
      this.savedSnapshot = null;
      this.notifySavedListeners();
    }
  }

  private refreshLiveClock(nowMs: number): void {
    const current = this.state;
    const nextClock: ClockBank = current
      ? computeLiveClockMs(
          current.clock,
          getTurnFromMoves(current.moves),
          nowMs,
          current.config.timeControl
        )
      : { w: 0, b: 0 };

    if (nextClock.w !== this.liveClockMs.w || nextClock.b !== this.liveClockMs.b) {
      this.liveClockMs = nextClock;
      this.notifyClockListeners();
    }
  }

  private notifyStateListeners(): void {
    for (const listener of this.stateListeners) {
      listener();
    }
  }

  private notifyClockListeners(): void {
    for (const listener of this.clockListeners) {
      listener();
    }
  }

  private notifySavedListeners(): void {
    for (const listener of this.savedListeners) {
      listener();
    }
  }
}

export const gameStore = new GameStore({
  preferencesStore,
});

export function useGameState(): GameState | null {
  return useSyncExternalStore(
    gameStore.subscribe,
    gameStore.getSnapshot,
    gameStore.getSnapshot
  );
}

export function useLiveClockMs(): ClockBank {
  return useSyncExternalStore(
    gameStore.subscribeLiveClock,
    gameStore.getLiveClockSnapshot,
    gameStore.getLiveClockSnapshot
  );
}

export function useSavedGameSummary(): SavedGameSummary | null {
  const snapshot = useSyncExternalStore(
    gameStore.subscribeSavedSnapshot,
    gameStore.getSavedGameSnapshot,
    gameStore.getSavedGameSnapshot
  );
  return useMemo(() => selectSavedGameSummary(snapshot), [snapshot]);
}
