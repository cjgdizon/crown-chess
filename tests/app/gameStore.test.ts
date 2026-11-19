import { describe, expect, it } from 'vitest';
import { GameStore } from '../../src/app/gameStore';
import { PreferencesStore } from '../../src/app/preferencesStore';
import {
  formatClockMs,
  formatEvaluation,
  selectBoardViewModel,
  selectCanUndo,
  selectMoveRows,
  selectPlayerBars,
  selectSavedGameSummary,
} from '../../src/app/selectors';
import type { ChessEngine, SoundPlayer } from '../../src/domain/contracts';
import {
  DIFFICULTY_PRESET_BY_ID,
  TIME_CONTROLS,
  type EngineStatus,
  type Evaluation,
  type GameConfig,
  type SoundKind,
  type Square,
} from '../../src/domain/types';
import { LocalStorageRepo, type KeyValueStorage } from '../../src/infra/localStorageRepo';

class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

interface PendingAiCall {
  req: Parameters<ChessEngine['searchBestMove']>[0];
  resolve: (uci: string | null) => void;
}

interface PendingHintCall {
  fen: string;
  resolve: (hint: { from: Square; to: Square; uci: string } | null) => void;
}

class FakeChessEngine implements ChessEngine {
  readonly aiCalls: PendingAiCall[] = [];
  readonly hintCalls: PendingHintCall[] = [];
  readonly evalCalls: Array<{ fen: string; onUpdate: (ev: Evaluation) => void }> = [];
  cancelCount = 0;
  disposed = false;
  private readonly statusListeners = new Set<(status: EngineStatus) => void>();

  async init(): Promise<void> {}

  onStatusChange(cb: (status: EngineStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  emitStatus(status: EngineStatus): void {
    for (const cb of this.statusListeners) {
      cb(status);
    }
  }

  searchBestMove(
    req: Parameters<ChessEngine['searchBestMove']>[0]
  ): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.aiCalls.push({ req, resolve });
    });
  }

  searchHint(fen: string): Promise<{ from: Square; to: Square; uci: string } | null> {
    return new Promise((resolve) => {
      this.hintCalls.push({ fen, resolve });
    });
  }

  startEvaluation(fen: string, onUpdate: (ev: Evaluation) => void): void {
    this.evalCalls.push({ fen, onUpdate });
  }

  cancelAll(): void {
    this.cancelCount += 1;
  }

  dispose(): void {
    this.disposed = true;
  }
}

class FakeSoundPlayer implements SoundPlayer {
  readonly played: SoundKind[] = [];
  play(sound: SoundKind): void {
    this.played.push(sound);
  }
}

const RAPID_10_0 = TIME_CONTROLS.find((tc) => tc.id === '10+0')!;
const UNLIMITED = TIME_CONTROLS.find((tc) => tc.id === 'unlimited')!;

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createHarness() {
  const storage = new MemoryStorage();
  const repo = new LocalStorageRepo(storage);
  const prefsStore = new PreferencesStore(repo);
  const engine = new FakeChessEngine();
  const soundPlayer = new FakeSoundPlayer();
  let now = 1_000;
  let idCounter = 0;

  const store = new GameStore({
    engine,
    soundPlayer,
    storageRepo: repo,
    preferencesStore: prefsStore,
    now: () => now,
    createGameId: () => `game-${++idCounter}`,
  });

  return {
    storage,
    repo,
    prefsStore,
    engine,
    soundPlayer,
    store,
    advanceNow: (ms: number) => {
      now += ms;
    },
  };
}

describe('GameStore', () => {
  it('runs human move -> AI search -> AI reply -> eval & snapshot persistence', async () => {
    const { store, engine, soundPlayer, advanceNow } = createHarness();
    const config: GameConfig = {
      mode: { kind: 'ai', humanColor: 'w', difficulty: 'club' },
      timeControl: RAPID_10_0,
    };

    store.startGame(config);
    expect(store.getSnapshot()?.moves).toHaveLength(0);
    expect(soundPlayer.played).toEqual(['game-start']);
    expect(engine.evalCalls).toHaveLength(1);

    advanceNow(2_000);
    store.attemptMove('e2', 'e4');

    const afterHuman = store.getSnapshot()!;
    expect(afterHuman.moves).toHaveLength(1);
    expect(afterHuman.aiThinking).toBe(true);
    expect(soundPlayer.played).toEqual(['game-start', 'move']);

    expect(engine.aiCalls).toHaveLength(1);
    const aiCall = engine.aiCalls[0]!;
    const preset = DIFFICULTY_PRESET_BY_ID.club;
    expect(aiCall.req.skillLevel).toBe(preset.skillLevel);
    expect(aiCall.req.depthCap).toBe(preset.depthCap);
    expect(aiCall.req.moveTimeMs).toBe(preset.moveTimeMs);
    expect(aiCall.req.minDelayMs).toBe(preset.minDelayMs);

    advanceNow(1_500);
    aiCall.resolve('e7e5');
    await flushMicrotasks();

    const afterAi = store.getSnapshot()!;
    expect(afterAi.moves).toHaveLength(2);
    expect(afterAi.moves[1]?.san).toBe('e5');
    expect(afterAi.aiThinking).toBe(false);
    expect(afterAi.clock.bankMs.b).toBe(600_000 - 1_500);
    expect(engine.evalCalls).toHaveLength(2);

    // Streaming evaluation updates store state
    engine.evalCalls[1]!.onUpdate({ kind: 'cp', whiteCp: 32, depth: 12 });
    expect(store.getSnapshot()?.evaluation).toEqual({ kind: 'cp', whiteCp: 32, depth: 12 });

    // Snapshot is persisted with latest moves
    expect(store.getSavedGameSnapshot()?.moves).toHaveLength(2);
    store.dispose();
  });

  it('drops stale AI move after Undo while AI was thinking', async () => {
    const { store, engine } = createHarness();
    store.startGame({
      mode: { kind: 'ai', humanColor: 'w', difficulty: 'casual' },
      timeControl: UNLIMITED,
    });

    store.attemptMove('e2', 'e4');
    expect(store.getSnapshot()?.aiThinking).toBe(true);
    expect(engine.aiCalls).toHaveLength(1);
    const staleCall = engine.aiCalls[0]!;

    const cancelsBefore = engine.cancelCount;
    store.undoMove();
    expect(engine.cancelCount).toBeGreaterThan(cancelsBefore);
    expect(store.getSnapshot()?.moves).toHaveLength(0);
    expect(store.getSnapshot()?.aiThinking).toBe(false);

    // Late AI move resolves after undo -> must be dropped
    staleCall.resolve('e7e5');
    await flushMicrotasks();

    expect(store.getSnapshot()?.moves).toHaveLength(0);
    store.dispose();
  });

  it('computes hint and resumes evaluation when evalBarVisible is enabled', async () => {
    const { store, engine, prefsStore } = createHarness();
    store.startGame({
      mode: { kind: 'local' },
      timeControl: UNLIMITED,
    });

    const evalCountBefore = engine.evalCalls.length;
    store.requestHint();
    expect(engine.hintCalls).toHaveLength(1);

    engine.hintCalls[0]!.resolve({ from: 'e2', to: 'e4', uci: 'e2e4' });
    await flushMicrotasks();

    expect(store.getSnapshot()?.activeHint).toEqual({ from: 'e2', to: 'e4', uci: 'e2e4' });
    expect(engine.evalCalls).toHaveLength(evalCountBefore + 1);

    // Disable eval bar -> cancels engine and next hint does not restart eval
    const cancelsBefore = engine.cancelCount;
    prefsStore.toggleEvalBar();
    expect(engine.cancelCount).toBe(cancelsBefore + 1);

    store.requestHint();
    engine.hintCalls[1]!.resolve({ from: 'd2', to: 'd4', uci: 'd2d4' });
    await flushMicrotasks();

    expect(store.getSnapshot()?.activeHint).toEqual({ from: 'd2', to: 'd4', uci: 'd2d4' });
    expect(engine.evalCalls).toHaveLength(evalCountBefore + 1);

    // Re-enabling eval bar kicks off evaluation immediately
    prefsStore.toggleEvalBar();
    expect(engine.evalCalls).toHaveLength(evalCountBefore + 2);
    store.dispose();
  });

  it('persists flushed clock bank on pauseAndPersist and restores cleanly in a new store', () => {
    const { store, repo, prefsStore, engine, soundPlayer, advanceNow } = createHarness();
    store.startGame({
      mode: { kind: 'local' },
      timeControl: RAPID_10_0,
    });

    // Ply 1 starts the clock at now = 1_000
    store.attemptMove('e2', 'e4');
    // Black thinks for 4_500 ms, then returns to menu
    advanceNow(4_500);
    store.pauseAndPersist();

    expect(store.getSnapshot()?.clock.activeSinceMs).toBeNull();
    expect(store.getSnapshot()?.clock.bankMs.b).toBe(600_000 - 4_500);
    store.dispose();

    // Fresh store instance reloads persisted game
    const resumedStore = new GameStore({
      engine,
      soundPlayer,
      storageRepo: repo,
      preferencesStore: prefsStore,
      now: () => 50_000,
    });
    expect(resumedStore.resumeSavedGame()).toBe(true);
    const restored = resumedStore.getSnapshot()!;
    expect(restored.moves).toHaveLength(1);
    expect(restored.clock.bankMs).toEqual({ w: 600_000, b: 595_500 });
    expect(restored.clock.activeSinceMs).toBe(50_000);
    resumedStore.dispose();
  });

  it('respects muted sound preference', () => {
    const { store, prefsStore, soundPlayer } = createHarness();
    prefsStore.toggleSound();
    store.startGame({ mode: { kind: 'local' }, timeControl: UNLIMITED });
    store.attemptMove('e2', 'e4');
    expect(soundPlayer.played).toEqual([]);
    store.dispose();
  });
});

describe('selectors', () => {
  it('selects board view model and disables interaction/overlays when scrubbing history', () => {
    const { store } = createHarness();
    store.startGame({ mode: { kind: 'local' }, timeControl: UNLIMITED });
    store.attemptMove('e2', 'e4');
    store.attemptMove('e7', 'e5');

    const liveVm = selectBoardViewModel(store.getSnapshot()!);
    expect(liveVm.isViewingLive).toBe(true);
    expect(liveVm.canInteract).toBe(true);
    expect(liveVm.viewPly).toBe(2);
    expect(liveVm.totalPlies).toBe(2);
    expect(liveVm.lastMove?.san).toBe('e5');

    store.setViewPly(1);
    const histVm = selectBoardViewModel(store.getSnapshot()!);
    expect(histVm.isViewingLive).toBe(false);
    expect(histVm.canInteract).toBe(false);
    expect(histVm.activeHint).toBeNull();
    expect(histVm.pendingPromotion).toBeNull();
    expect(histVm.lastMove?.san).toBe('e4');
    store.dispose();
  });

  it('builds player bars respecting orientation, material diff, and low-time threshold', () => {
    const { store } = createHarness();
    store.startGame({
      mode: { kind: 'ai', humanColor: 'w', difficulty: 'expert' },
      timeControl: RAPID_10_0,
    });

    // Play a quick capture sequence via local game to test material diff directly
    store.startGame({
      mode: { kind: 'local' },
      timeControl: RAPID_10_0,
    });
    store.attemptMove('e2', 'e4');
    store.attemptMove('d7', 'd5');
    store.attemptMove('e4', 'd5');

    const state = store.getSnapshot()!;
    const bars = selectPlayerBars(state, { w: 590_000, b: 14_200 });
    expect(bars.bottom.color).toBe('w');
    expect(bars.bottom.capturedPieces).toEqual(['p']);
    expect(bars.bottom.materialAdvantage).toBe(1);
    expect(bars.bottom.isLowTime).toBe(false);
    expect(bars.bottom.isTurn).toBe(false);

    expect(bars.top.color).toBe('b');
    expect(bars.top.materialAdvantage).toBe(0);
    expect(bars.top.isLowTime).toBe(true);
    expect(bars.top.isTurn).toBe(true);

    // Flip orientation swaps top & bottom
    store.flipBoard();
    const flipped = selectPlayerBars(store.getSnapshot()!, { w: 590_000, b: 14_200 });
    expect(flipped.bottom.color).toBe('b');
    expect(flipped.top.color).toBe('w');
    store.dispose();
  });

  it('pairs move rows and computes selectCanUndo and selectSavedGameSummary', () => {
    const { store } = createHarness();
    store.startGame({
      mode: { kind: 'local' },
      timeControl: RAPID_10_0,
    });
    expect(selectCanUndo(store.getSnapshot()!)).toBe(false);

    store.attemptMove('e2', 'e4');
    store.attemptMove('e7', 'e5');
    store.attemptMove('g1', 'f3');

    const state = store.getSnapshot()!;
    expect(selectCanUndo(state)).toBe(true);

    const rows = selectMoveRows(state.moves);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.moveNumber).toBe(1);
    expect(rows[0]?.white.san).toBe('e4');
    expect(rows[0]?.black?.san).toBe('e5');
    expect(rows[1]?.moveNumber).toBe(2);
    expect(rows[1]?.white.san).toBe('Nf3');
    expect(rows[1]?.black).toBeUndefined();

    const summary = selectSavedGameSummary(store.getSavedGameSnapshot());
    expect(summary).not.toBeNull();
    expect(summary?.modeKind).toBe('local');
    expect(summary?.moveCount).toBe(2);
    expect(summary?.plyCount).toBe(3);
    expect(summary?.timeControlLabel).toBe('10 + 0');
    expect(summary?.isTimed).toBe(true);

    // Resigned game clears saved snapshot
    store.resign('w');
    expect(selectCanUndo(store.getSnapshot()!)).toBe(false);
    expect(selectSavedGameSummary(store.getSavedGameSnapshot())).toBeNull();
    store.dispose();
  });

  it('formats clock durations with tenths under 20s and clean minute display above', () => {
    expect(formatClockMs(600_000)).toBe('10:00');
    expect(formatClockMs(20_000)).toBe('0:20');
    expect(formatClockMs(14_300)).toBe('0:14.3');
    expect(formatClockMs(14_300, false)).toBe('0:15');
    expect(formatClockMs(0)).toBe('0:00.0');
    expect(formatClockMs(0, false)).toBe('0:00');
    expect(formatClockMs(3_661_000)).toBe('1:01:01');
  });

  it('formats centipawn and mate evaluations with smooth logistic clamping', () => {
    expect(formatEvaluation(null)).toEqual({ label: '0.0', whitePercent: 50 });
    expect(formatEvaluation({ kind: 'cp', whiteCp: 0, depth: 12 })).toEqual({
      label: '0.0',
      whitePercent: 50,
    });

    const plus = formatEvaluation({ kind: 'cp', whiteCp: 140, depth: 14 });
    expect(plus.label).toBe('+1.4');
    expect(plus.whitePercent).toBeGreaterThan(50);
    expect(plus.whitePercent).toBeLessThan(96);

    const minus = formatEvaluation({ kind: 'cp', whiteCp: -30, depth: 14 });
    expect(minus.label).toBe('-0.3');
    expect(minus.whitePercent).toBeLessThan(50);
    expect(minus.whitePercent).toBeGreaterThan(4);

    // Extreme cp clamps smoothly within [4, 96]
    expect(formatEvaluation({ kind: 'cp', whiteCp: 5000, depth: 14 }).whitePercent).toBe(96);
    expect(formatEvaluation({ kind: 'cp', whiteCp: -5000, depth: 14 }).whitePercent).toBe(4);

    expect(formatEvaluation({ kind: 'mate', whiteMateIn: 3, depth: 18 })).toEqual({
      label: 'M3',
      whitePercent: 100,
    });
    expect(formatEvaluation({ kind: 'mate', whiteMateIn: -2, depth: 18 })).toEqual({
      label: '-M2',
      whitePercent: 0,
    });
  });
});
