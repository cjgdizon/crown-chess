import type { SavedGameSnapshot } from './contracts';

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';
export type Square = `${'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'}${'1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'}`;

export type DifficultyId = 'beginner' | 'casual' | 'club' | 'advanced' | 'expert' | 'master';

export interface DifficultyPreset {
  id: DifficultyId;
  label: string;
  approxElo: string;
  skillLevel: number;
  depthCap: number;
  moveTimeMs: number;
  minDelayMs: number;
}

export const DIFFICULTY_PRESET_BY_ID: Readonly<Record<DifficultyId, DifficultyPreset>> = {
  beginner: {
    id: 'beginner',
    label: 'Beginner',
    approxElo: '~600',
    skillLevel: 0,
    depthCap: 2,
    moveTimeMs: 150,
    minDelayMs: 350,
  },
  casual: {
    id: 'casual',
    label: 'Casual',
    approxElo: '~1000',
    skillLevel: 4,
    depthCap: 4,
    moveTimeMs: 250,
    minDelayMs: 350,
  },
  club: {
    id: 'club',
    label: 'Club',
    approxElo: '~1400',
    skillLevel: 8,
    depthCap: 6,
    moveTimeMs: 350,
    minDelayMs: 300,
  },
  advanced: {
    id: 'advanced',
    label: 'Advanced',
    approxElo: '~1800',
    skillLevel: 12,
    depthCap: 10,
    moveTimeMs: 500,
    minDelayMs: 250,
  },
  expert: {
    id: 'expert',
    label: 'Expert',
    approxElo: '~2200',
    skillLevel: 16,
    depthCap: 14,
    moveTimeMs: 750,
    minDelayMs: 200,
  },
  master: {
    id: 'master',
    label: 'Master',
    approxElo: '~2600+',
    skillLevel: 20,
    depthCap: 18,
    moveTimeMs: 1100,
    minDelayMs: 150,
  },
};

export const DIFFICULTY_PRESETS: readonly DifficultyPreset[] = [
  DIFFICULTY_PRESET_BY_ID.beginner,
  DIFFICULTY_PRESET_BY_ID.casual,
  DIFFICULTY_PRESET_BY_ID.club,
  DIFFICULTY_PRESET_BY_ID.advanced,
  DIFFICULTY_PRESET_BY_ID.expert,
  DIFFICULTY_PRESET_BY_ID.master,
];

export type TimeCategory = 'unlimited' | 'bullet' | 'blitz' | 'rapid' | 'classical';

export interface TimeControl {
  id: string;
  category: TimeCategory;
  label: string;
  initialMs: number;
  incrementMs: number;
}

export const TIME_CONTROLS: readonly TimeControl[] = [
  { id: 'unlimited', category: 'unlimited', label: 'Unlimited', initialMs: 0, incrementMs: 0 },
  { id: '1+0', category: 'bullet', label: '1 + 0', initialMs: 60_000, incrementMs: 0 },
  { id: '2+1', category: 'bullet', label: '2 + 1', initialMs: 120_000, incrementMs: 1_000 },
  { id: '3+0', category: 'blitz', label: '3 + 0', initialMs: 180_000, incrementMs: 0 },
  { id: '3+2', category: 'blitz', label: '3 + 2', initialMs: 180_000, incrementMs: 2_000 },
  { id: '5+0', category: 'blitz', label: '5 + 0', initialMs: 300_000, incrementMs: 0 },
  { id: '10+0', category: 'rapid', label: '10 + 0', initialMs: 600_000, incrementMs: 0 },
  { id: '15+10', category: 'rapid', label: '15 + 10', initialMs: 900_000, incrementMs: 10_000 },
  { id: '30+0', category: 'classical', label: '30 + 0', initialMs: 1_800_000, incrementMs: 0 },
] as const;

export type GameModeConfig =
  | { kind: 'ai'; humanColor: Color; difficulty: DifficultyId }
  | { kind: 'local' };

export interface GameConfig {
  mode: GameModeConfig;
  timeControl: TimeControl;
}

export interface ClockBank {
  w: number;
  b: number;
}

export interface MoveRecord {
  ply: number;
  uci: string;
  san: string;
  from: Square;
  to: Square;
  color: Color;
  fenAfter: string;
  captured?: PieceType;
  promotion?: PromotionPiece;
  isCheck: boolean;
  isCastle: boolean;
  clockAfterMs: ClockBank;
}

/** Always normalized to White's perspective (+ favors White, - favors Black). */
export type Evaluation =
  | { kind: 'cp'; whiteCp: number; depth: number }
  | { kind: 'mate'; whiteMateIn: number; depth: number };

export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'threefold-repetition'
  | 'fifty-move'
  | 'timeout'
  | 'timeout-insufficient-material'
  | 'resignation'
  | 'mutual-draw';

export type GameStatus =
  | { kind: 'playing' }
  | { kind: 'ended'; winner: Color | 'draw'; reason: EndReason };

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PendingPromotion {
  from: Square;
  to: Square;
  color: Color;
}

export interface ActiveHint {
  from: Square;
  to: Square;
  uci: string;
}

export interface GameState {
  gameId: string;
  config: GameConfig;
  moves: MoveRecord[];
  viewPly: number;
  orientation: Color;
  status: GameStatus;
  clock: {
    bankMs: ClockBank;
    activeSinceMs: number | null;
  };
  aiThinking: boolean;
  engineStatus: EngineStatus;
  evaluation: Evaluation | null;
  activeHint: ActiveHint | null;
  pendingPromotion: PendingPromotion | null;
  drawOfferedBy: Color | null;
}

export type ThemeMode = 'dark' | 'light';
export type BoardPreset = 'walnut' | 'sage' | 'slate';

export interface Preferences {
  theme: ThemeMode;
  boardPreset: BoardPreset;
  soundEnabled: boolean;
  evalBarVisible: boolean;
  autoFlipLocal: boolean;
  lastSetup: {
    modeKind: 'ai' | 'local';
    sideChoice: 'w' | 'b' | 'random';
    difficulty: DifficultyId;
    timeControlId: string;
  };
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  boardPreset: 'walnut',
  soundEnabled: true,
  evalBarVisible: true,
  autoFlipLocal: false,
  lastSetup: {
    modeKind: 'ai',
    sideChoice: 'w',
    difficulty: 'club',
    timeControlId: '10+0',
  },
};

export type SoundKind =
  | 'move'
  | 'capture'
  | 'check'
  | 'castle'
  | 'promote'
  | 'game-start'
  | 'game-end';

export type GameAction =
  | { type: 'START_GAME'; config: GameConfig; gameId: string }
  | { type: 'RESTORE_GAME'; snapshot: SavedGameSnapshot }
  | { type: 'COMMIT_MOVE'; from: Square; to: Square; promotion?: PromotionPiece; source: 'human' | 'ai' }
  | { type: 'OPEN_PROMOTION'; from: Square; to: Square }
  | { type: 'CANCEL_PROMOTION' }
  | { type: 'UNDO_MOVE' }
  | { type: 'SET_VIEW_PLY'; ply: number }
  | { type: 'FLIP_BOARD' }
  | { type: 'RESIGN'; color: Color }
  | { type: 'OFFER_OR_ACCEPT_DRAW'; color: Color }
  | { type: 'DECLINE_DRAW' }
  | { type: 'TIME_EXPIRED'; loser: Color }
  | { type: 'ENGINE_STATUS_CHANGED'; status: EngineStatus }
  | { type: 'ENGINE_EVAL_UPDATED'; fen: string; evaluation: Evaluation }
  | { type: 'REQUEST_HINT' }
  | { type: 'HINT_RECEIVED'; fen: string; from: Square; to: Square; uci: string }
  | { type: 'CLEAR_HINT' };

export type GameEffect =
  | { type: 'ABORT_ENGINE' }
  | { type: 'REQUEST_AI_MOVE'; fen: string; difficulty: DifficultyId; gameId: string; expectedPly: number }
  | { type: 'REQUEST_EVAL'; fen: string }
  | { type: 'REQUEST_HINT'; fen: string }
  | { type: 'PLAY_SOUND'; sound: SoundKind }
  | { type: 'PERSIST_SNAPSHOT' }
  | { type: 'CLEAR_SNAPSHOT' };

const SQUARE_RE = /^[a-h][1-8]$/;

const PROMOTION_PIECES: ReadonlySet<string> = new Set<PromotionPiece>(['q', 'r', 'b', 'n']);
const PIECE_TYPES: ReadonlySet<string> = new Set<PieceType>(['p', 'n', 'b', 'r', 'q', 'k']);
const DIFFICULTY_IDS: ReadonlySet<string> = new Set<DifficultyId>([
  'beginner',
  'casual',
  'club',
  'advanced',
  'expert',
  'master',
]);
const BOARD_PRESETS: ReadonlySet<string> = new Set<BoardPreset>(['walnut', 'sage', 'slate']);
const THEME_MODES: ReadonlySet<string> = new Set<ThemeMode>(['dark', 'light']);

export function isColor(value: unknown): value is Color {
  return value === 'w' || value === 'b';
}

export function isSquare(value: unknown): value is Square {
  return typeof value === 'string' && SQUARE_RE.test(value);
}

export function isPieceType(value: unknown): value is PieceType {
  return typeof value === 'string' && PIECE_TYPES.has(value);
}

export function isPromotionPiece(value: unknown): value is PromotionPiece {
  return typeof value === 'string' && PROMOTION_PIECES.has(value);
}

export function isDifficultyId(value: unknown): value is DifficultyId {
  return typeof value === 'string' && DIFFICULTY_IDS.has(value);
}

export function isBoardPreset(value: unknown): value is BoardPreset {
  return typeof value === 'string' && BOARD_PRESETS.has(value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && THEME_MODES.has(value);
}

export function oppositeColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}
