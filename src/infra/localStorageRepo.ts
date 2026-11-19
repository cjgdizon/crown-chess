import type { SavedGameSnapshot, StorageRepo } from '../domain/contracts';
import {
  DEFAULT_PREFERENCES,
  TIME_CONTROLS,
  isBoardPreset,
  isColor,
  isDifficultyId,
  isPieceType,
  isPromotionPiece,
  isSquare,
  isThemeMode,
  type ClockBank,
  type EndReason,
  type GameConfig,
  type GameModeConfig,
  type GameStatus,
  type MoveRecord,
  type Preferences,
  type TimeCategory,
  type TimeControl,
} from '../domain/types';

export const PREFS_STORAGE_KEY = 'chess.prefs.v1';
export const ACTIVE_GAME_STORAGE_KEY = 'chess.activeGame.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const TIME_CATEGORIES: ReadonlySet<string> = new Set<TimeCategory>([
  'unlimited',
  'bullet',
  'blitz',
  'rapid',
  'classical',
]);

const END_REASONS: ReadonlySet<string> = new Set<EndReason>([
  'checkmate',
  'stalemate',
  'insufficient-material',
  'threefold-repetition',
  'fifty-move',
  'timeout',
  'timeout-insufficient-material',
  'resignation',
  'mutual-draw',
]);

const KNOWN_TIME_CONTROL_IDS: ReadonlySet<string> = new Set(TIME_CONTROLS.map((tc) => tc.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isTimeCategory(value: unknown): value is TimeCategory {
  return typeof value === 'string' && TIME_CATEGORIES.has(value);
}

function isEndReason(value: unknown): value is EndReason {
  return typeof value === 'string' && END_REASONS.has(value);
}

function isModeKind(value: unknown): value is 'ai' | 'local' {
  return value === 'ai' || value === 'local';
}

function isSideChoice(value: unknown): value is 'w' | 'b' | 'random' {
  return value === 'w' || value === 'b' || value === 'random';
}

function cloneDefaultPreferences(): Preferences {
  return {
    ...DEFAULT_PREFERENCES,
    lastSetup: { ...DEFAULT_PREFERENCES.lastSetup },
  };
}

function parseClockBank(value: unknown): ClockBank | null {
  if (!isRecord(value)) {
    return null;
  }
  const { w, b } = value;
  if (!isFiniteNonNegativeNumber(w) || !isFiniteNonNegativeNumber(b)) {
    return null;
  }
  return { w, b };
}

function parseTimeControl(value: unknown): TimeControl | null {
  if (!isRecord(value)) {
    return null;
  }
  const { id, category, label, initialMs, incrementMs } = value;
  if (
    !isNonEmptyString(id) ||
    !isTimeCategory(category) ||
    !isNonEmptyString(label) ||
    !isFiniteNonNegativeNumber(initialMs) ||
    !isFiniteNonNegativeNumber(incrementMs)
  ) {
    return null;
  }
  return { id, category, label, initialMs, incrementMs };
}

function parseGameModeConfig(value: unknown): GameModeConfig | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.kind === 'local') {
    return { kind: 'local' };
  }
  if (value.kind === 'ai') {
    if (!isColor(value.humanColor) || !isDifficultyId(value.difficulty)) {
      return null;
    }
    return {
      kind: 'ai',
      humanColor: value.humanColor,
      difficulty: value.difficulty,
    };
  }
  return null;
}

function parseGameConfig(value: unknown): GameConfig | null {
  if (!isRecord(value)) {
    return null;
  }
  const mode = parseGameModeConfig(value.mode);
  const timeControl = parseTimeControl(value.timeControl);
  if (!mode || !timeControl) {
    return null;
  }
  return { mode, timeControl };
}

function parseGameStatus(value: unknown): GameStatus | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.kind === 'playing') {
    return { kind: 'playing' };
  }
  if (value.kind === 'ended') {
    const winner = value.winner;
    const validWinner = winner === 'draw' || isColor(winner);
    if (!validWinner || !isEndReason(value.reason)) {
      return null;
    }
    return {
      kind: 'ended',
      winner,
      reason: value.reason,
    };
  }
  return null;
}

function parseMoveRecord(value: unknown): MoveRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const {
    ply,
    uci,
    san,
    from,
    to,
    color,
    fenAfter,
    captured,
    promotion,
    isCheck,
    isCastle,
    clockAfterMs,
  } = value;

  if (
    !isPositiveInteger(ply) ||
    !isNonEmptyString(uci) ||
    !isNonEmptyString(san) ||
    !isSquare(from) ||
    !isSquare(to) ||
    !isColor(color) ||
    !isNonEmptyString(fenAfter) ||
    typeof isCheck !== 'boolean' ||
    typeof isCastle !== 'boolean'
  ) {
    return null;
  }

  if (captured !== undefined && !isPieceType(captured)) {
    return null;
  }
  if (promotion !== undefined && !isPromotionPiece(promotion)) {
    return null;
  }

  const parsedClock = parseClockBank(clockAfterMs);
  if (!parsedClock) {
    return null;
  }

  return {
    ply,
    uci,
    san,
    from,
    to,
    color,
    fenAfter,
    ...(captured !== undefined ? { captured } : {}),
    ...(promotion !== undefined ? { promotion } : {}),
    isCheck,
    isCastle,
    clockAfterMs: parsedClock,
  };
}

function parsePreferences(raw: unknown): Preferences {
  const defaults = cloneDefaultPreferences();
  if (!isRecord(raw)) {
    return defaults;
  }

  const rawLastSetup = isRecord(raw.lastSetup) ? raw.lastSetup : null;
  const timeControlId =
    rawLastSetup &&
    typeof rawLastSetup.timeControlId === 'string' &&
    KNOWN_TIME_CONTROL_IDS.has(rawLastSetup.timeControlId)
      ? rawLastSetup.timeControlId
      : defaults.lastSetup.timeControlId;

  return {
    theme: isThemeMode(raw.theme) ? raw.theme : defaults.theme,
    boardPreset: isBoardPreset(raw.boardPreset) ? raw.boardPreset : defaults.boardPreset,
    soundEnabled:
      typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : defaults.soundEnabled,
    evalBarVisible:
      typeof raw.evalBarVisible === 'boolean' ? raw.evalBarVisible : defaults.evalBarVisible,
    autoFlipLocal:
      typeof raw.autoFlipLocal === 'boolean' ? raw.autoFlipLocal : defaults.autoFlipLocal,
    lastSetup: {
      modeKind:
        rawLastSetup && isModeKind(rawLastSetup.modeKind)
          ? rawLastSetup.modeKind
          : defaults.lastSetup.modeKind,
      sideChoice:
        rawLastSetup && isSideChoice(rawLastSetup.sideChoice)
          ? rawLastSetup.sideChoice
          : defaults.lastSetup.sideChoice,
      difficulty:
        rawLastSetup && isDifficultyId(rawLastSetup.difficulty)
          ? rawLastSetup.difficulty
          : defaults.lastSetup.difficulty,
      timeControlId,
    },
  };
}

function parseSavedGameSnapshot(raw: unknown): SavedGameSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (raw.version !== 1) {
    return null;
  }
  if (!isNonEmptyString(raw.savedAtIso) || !isNonEmptyString(raw.gameId)) {
    return null;
  }
  if (!isColor(raw.orientation)) {
    return null;
  }

  const config = parseGameConfig(raw.config);
  const status = parseGameStatus(raw.status);
  const clockBankMs = parseClockBank(raw.clockBankMs);
  if (!config || !status || !clockBankMs || !Array.isArray(raw.moves)) {
    return null;
  }

  const moves: MoveRecord[] = [];
  for (const item of raw.moves) {
    const parsedMove = parseMoveRecord(item);
    if (!parsedMove) {
      return null;
    }
    moves.push(parsedMove);
  }

  return {
    version: 1,
    savedAtIso: raw.savedAtIso,
    gameId: raw.gameId,
    config,
    moves,
    orientation: raw.orientation,
    status,
    clockBankMs,
  };
}

function resolveDefaultStorage(): KeyValueStorage | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Accessing localStorage can throw in restricted browser environments.
  }
  return null;
}

export class LocalStorageRepo implements StorageRepo {
  private readonly storage: KeyValueStorage | null;

  constructor(storage?: KeyValueStorage | null) {
    this.storage = storage === undefined ? resolveDefaultStorage() : storage;
  }

  loadPreferences(): Preferences {
    const raw = this.readJson(PREFS_STORAGE_KEY);
    if (raw === null) {
      return cloneDefaultPreferences();
    }
    return parsePreferences(raw);
  }

  savePreferences(prefs: Preferences): void {
    this.writeJson(PREFS_STORAGE_KEY, prefs);
  }

  loadGameSnapshot(): SavedGameSnapshot | null {
    const raw = this.readJson(ACTIVE_GAME_STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    return parseSavedGameSnapshot(raw);
  }

  saveGameSnapshot(snapshot: SavedGameSnapshot): void {
    this.writeJson(ACTIVE_GAME_STORAGE_KEY, snapshot);
  }

  clearGameSnapshot(): void {
    if (!this.storage) {
      return;
    }
    try {
      this.storage.removeItem(ACTIVE_GAME_STORAGE_KEY);
    } catch {
      // Best-effort persistence cleanup.
    }
  }

  private readJson(key: string): unknown {
    if (!this.storage) {
      return null;
    }
    try {
      const text = this.storage.getItem(key);
      if (text === null) {
        return null;
      }
      const parsed: unknown = JSON.parse(text);
      return parsed;
    } catch {
      return null;
    }
  }

  private writeJson(key: string, value: unknown): void {
    if (!this.storage) {
      return;
    }
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota or storage-disabled errors.
    }
  }
}
