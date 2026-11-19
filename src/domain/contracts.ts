import type {
  ClockBank,
  Color,
  EngineStatus,
  Evaluation,
  GameConfig,
  GameStatus,
  MoveRecord,
  Preferences,
  SoundKind,
  Square,
} from './types';

export interface ChessEngine {
  init(): Promise<void>;
  onStatusChange(cb: (status: EngineStatus) => void): () => void;
  /** Cancels any lower-priority job and resolves with the chosen UCI move, or null if aborted. */
  searchBestMove(req: {
    fen: string;
    skillLevel: number;
    depthCap: number;
    moveTimeMs: number;
    minDelayMs: number;
  }): Promise<string | null>;
  /** Cancels any active eval and computes a strong hint move for the current position. */
  searchHint(fen: string): Promise<{ from: Square; to: Square; uci: string } | null>;
  /** Streams White-normalized evaluation updates for the given FEN until cancelled or depth reached. */
  startEvaluation(fen: string, onUpdate: (ev: Evaluation) => void): void;
  cancelAll(): void;
  dispose(): void;
}

export interface SoundPlayer {
  play(sound: SoundKind): void;
}

export interface SavedGameSnapshot {
  version: 1;
  savedAtIso: string;
  gameId: string;
  config: GameConfig;
  moves: MoveRecord[];
  orientation: Color;
  status: GameStatus;
  clockBankMs: ClockBank;
}

export interface StorageRepo {
  loadPreferences(): Preferences;
  savePreferences(prefs: Preferences): void;
  loadGameSnapshot(): SavedGameSnapshot | null;
  saveGameSnapshot(snapshot: SavedGameSnapshot): void;
  clearGameSnapshot(): void;
}
