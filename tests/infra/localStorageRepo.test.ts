import { describe, expect, it } from 'vitest';
import type { SavedGameSnapshot } from '../../src/domain/contracts';
import { DEFAULT_PREFERENCES, type Preferences } from '../../src/domain/types';
import {
  ACTIVE_GAME_STORAGE_KEY,
  LocalStorageRepo,
  PREFS_STORAGE_KEY,
  type KeyValueStorage,
} from '../../src/infra/localStorageRepo';

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

function createValidSnapshot(): SavedGameSnapshot {
  return {
    version: 1,
    savedAtIso: '2026-11-19T12:00:00.000Z',
    gameId: 'game-123',
    config: {
      mode: { kind: 'ai', humanColor: 'w', difficulty: 'club' },
      timeControl: {
        id: '10+0',
        category: 'rapid',
        label: '10 + 0',
        initialMs: 600_000,
        incrementMs: 0,
      },
    },
    moves: [
      {
        ply: 1,
        uci: 'e2e4',
        san: 'e4',
        from: 'e2',
        to: 'e4',
        color: 'w',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        isCheck: false,
        isCastle: false,
        clockAfterMs: { w: 600_000, b: 600_000 },
      },
      {
        ply: 2,
        uci: 'd7d5',
        san: 'd5',
        from: 'd7',
        to: 'd5',
        color: 'b',
        fenAfter: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        isCheck: false,
        isCastle: false,
        clockAfterMs: { w: 600_000, b: 598_500 },
      },
      {
        ply: 3,
        uci: 'e4d5',
        san: 'exd5',
        from: 'e4',
        to: 'd5',
        color: 'w',
        fenAfter: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
        captured: 'p',
        isCheck: false,
        isCastle: false,
        clockAfterMs: { w: 597_000, b: 598_500 },
      },
    ],
    orientation: 'w',
    status: { kind: 'playing' },
    clockBankMs: { w: 597_000, b: 598_500 },
  };
}

describe('LocalStorageRepo', () => {
  it('round-trips preferences cleanly', () => {
    const storage = new MemoryStorage();
    const repo = new LocalStorageRepo(storage);

    const custom: Preferences = {
      theme: 'light',
      boardPreset: 'sage',
      soundEnabled: false,
      evalBarVisible: false,
      autoFlipLocal: true,
      lastSetup: {
        modeKind: 'local',
        sideChoice: 'random',
        difficulty: 'expert',
        timeControlId: '3+2',
      },
    };

    repo.savePreferences(custom);
    expect(repo.loadPreferences()).toEqual(custom);
  });

  it('returns DEFAULT_PREFERENCES on missing or corrupt JSON and sanitizes invalid fields', () => {
    const storage = new MemoryStorage();
    const repo = new LocalStorageRepo(storage);

    expect(repo.loadPreferences()).toEqual(DEFAULT_PREFERENCES);

    storage.setItem(PREFS_STORAGE_KEY, '{not-valid-json');
    expect(repo.loadPreferences()).toEqual(DEFAULT_PREFERENCES);

    storage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({
        theme: 'neon',
        boardPreset: 'marble',
        soundEnabled: false,
        evalBarVisible: 'yes',
        autoFlipLocal: true,
        lastSetup: {
          modeKind: 'online',
          sideChoice: 'b',
          difficulty: 'super-gm',
          timeControlId: '99+99',
        },
      })
    );

    expect(repo.loadPreferences()).toEqual({
      theme: DEFAULT_PREFERENCES.theme,
      boardPreset: DEFAULT_PREFERENCES.boardPreset,
      soundEnabled: false,
      evalBarVisible: DEFAULT_PREFERENCES.evalBarVisible,
      autoFlipLocal: true,
      lastSetup: {
        modeKind: DEFAULT_PREFERENCES.lastSetup.modeKind,
        sideChoice: 'b',
        difficulty: DEFAULT_PREFERENCES.lastSetup.difficulty,
        timeControlId: DEFAULT_PREFERENCES.lastSetup.timeControlId,
      },
    });
  });

  it('round-trips and clears valid game snapshots', () => {
    const storage = new MemoryStorage();
    const repo = new LocalStorageRepo(storage);
    const snapshot = createValidSnapshot();

    repo.saveGameSnapshot(snapshot);
    expect(repo.loadGameSnapshot()).toEqual(snapshot);

    repo.clearGameSnapshot();
    expect(repo.loadGameSnapshot()).toBeNull();
  });

  it('rejects snapshots with version mismatch or corrupt JSON', () => {
    const storage = new MemoryStorage();
    const repo = new LocalStorageRepo(storage);

    storage.setItem(ACTIVE_GAME_STORAGE_KEY, 'corrupt{{{');
    expect(repo.loadGameSnapshot()).toBeNull();

    const wrongVersion = { ...createValidSnapshot(), version: 2 };
    storage.setItem(ACTIVE_GAME_STORAGE_KEY, JSON.stringify(wrongVersion));
    expect(repo.loadGameSnapshot()).toBeNull();
  });

  it('rejects snapshots with invalid squares, promotion pieces, or difficulty ids', () => {
    const storage = new MemoryStorage();
    const repo = new LocalStorageRepo(storage);

    const badDifficulty = createValidSnapshot();
    storage.setItem(
      ACTIVE_GAME_STORAGE_KEY,
      JSON.stringify({
        ...badDifficulty,
        config: {
          ...badDifficulty.config,
          mode: { kind: 'ai', humanColor: 'w', difficulty: 'godmode' },
        },
      })
    );
    expect(repo.loadGameSnapshot()).toBeNull();

    const badSquare = createValidSnapshot();
    storage.setItem(
      ACTIVE_GAME_STORAGE_KEY,
      JSON.stringify({
        ...badSquare,
        moves: [
          {
            ...badSquare.moves[0],
            from: 'z9',
          },
        ],
      })
    );
    expect(repo.loadGameSnapshot()).toBeNull();

    const badPromotion = createValidSnapshot();
    storage.setItem(
      ACTIVE_GAME_STORAGE_KEY,
      JSON.stringify({
        ...badPromotion,
        moves: [
          {
            ...badPromotion.moves[0],
            promotion: 'k',
          },
        ],
      })
    );
    expect(repo.loadGameSnapshot()).toBeNull();

    const negativeClock = createValidSnapshot();
    storage.setItem(
      ACTIVE_GAME_STORAGE_KEY,
      JSON.stringify({
        ...negativeClock,
        clockBankMs: { w: -10, b: 600_000 },
      })
    );
    expect(repo.loadGameSnapshot()).toBeNull();
  });
});
