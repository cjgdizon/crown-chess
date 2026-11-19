import { useState } from 'react';
import {
  Clock,
  Cpu,
  Play,
  RefreshCw,
  Shuffle,
  Users,
} from 'lucide-react';
import { preferencesStore } from '../../app/preferencesStore';
import { formatClockMs, type SavedGameSummary } from '../../app/selectors';
import {
  DIFFICULTY_PRESETS,
  TIME_CONTROLS,
  type BoardPreset,
  type Color,
  type DifficultyId,
  type GameConfig,
  type Preferences,
  type TimeCategory,
  type TimeControl,
} from '../../domain/types';
import { PieceSvg } from '../board/PieceSvg';
import { ChessLogo } from '../components/ChessLogo';
import { ThemeToggle } from '../components/ThemeToggle';

interface MenuScreenProps {
  savedSummary: SavedGameSummary | null;
  prefs: Preferences;
  onStartGame: (config: GameConfig) => void;
  onResumeGame: () => void;
}

type SideChoice = 'w' | 'b' | 'random';

interface BoardSwatchOption {
  id: BoardPreset;
  label: string;
  light: string;
  dark: string;
}

const BOARD_SWATCHES: readonly BoardSwatchOption[] = [
  { id: 'walnut', label: 'Walnut', light: '#edd6b0', dark: '#b88762' },
  { id: 'sage', label: 'Sage', light: '#ebecd0', dark: '#739552' },
  { id: 'slate', label: 'Slate', light: '#dee3e6', dark: '#788a9e' },
];

const TIME_GROUPS: readonly { category: TimeCategory; label: string }[] = [
  { category: 'unlimited', label: 'Casual' },
  { category: 'bullet', label: 'Bullet' },
  { category: 'blitz', label: 'Blitz' },
  { category: 'rapid', label: 'Rapid' },
  { category: 'classical', label: 'Classical' },
];

function resolveTimeControl(id: string): TimeControl {
  const matched = TIME_CONTROLS.find((tc) => tc.id === id);
  if (matched) {
    return matched;
  }
  const fallback = TIME_CONTROLS[0];
  if (fallback) {
    return fallback;
  }
  return {
    id: 'unlimited',
    category: 'unlimited',
    label: 'Unlimited',
    initialMs: 0,
    incrementMs: 0,
  };
}

function resolveHumanColor(sideChoice: SideChoice): Color {
  if (sideChoice === 'w' || sideChoice === 'b') {
    return sideChoice;
  }
  return Math.random() < 0.5 ? 'w' : 'b';
}

export function MenuScreen({
  savedSummary,
  prefs,
  onStartGame,
  onResumeGame,
}: MenuScreenProps) {
  const [modeKind, setModeKind] = useState<'ai' | 'local'>(prefs.lastSetup.modeKind);
  const [sideChoice, setSideChoice] = useState<SideChoice>(prefs.lastSetup.sideChoice);
  const [difficulty, setDifficulty] = useState<DifficultyId>(prefs.lastSetup.difficulty);
  const [timeControlId, setTimeControlId] = useState<string>(prefs.lastSetup.timeControlId);

  const handleStartGame = () => {
    const timeControl = resolveTimeControl(timeControlId);
    preferencesStore.updateLastSetup({
      modeKind,
      sideChoice,
      difficulty,
      timeControlId: timeControl.id,
    });

    const config: GameConfig =
      modeKind === 'ai'
        ? {
            mode: {
              kind: 'ai',
              humanColor: resolveHumanColor(sideChoice),
              difficulty,
            },
            timeControl,
          }
        : {
            mode: { kind: 'local' },
            timeControl,
          };

    onStartGame(config);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-x-hidden bg-[var(--bg-canvas)] px-4 py-6 sm:px-6 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 0%, var(--accent-primary-soft) 0%, transparent 100%)',
        }}
      />

      <div className="relative z-10 flex w-full max-w-[680px] flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <ChessLogo size="lg" showSubtitle />
          <ThemeToggle
            theme={prefs.theme}
            onToggle={() => preferencesStore.toggleTheme()}
          />
        </header>

        {savedSummary && (
          <section
            aria-label="Resume saved game"
            className="theme-transition flex flex-col justify-between gap-3 rounded-2xl border border-[var(--accent-primary)]/40 bg-[var(--bg-card)] p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center"
          >
            <div className="min-w-0 space-y-1">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[var(--accent-primary)] uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />
                Game in progress
              </div>
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {savedSummary.modeLabel}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                <span className="tabular-nums">
                  {savedSummary.plyCount === 0
                    ? 'Starting position'
                    : `Move ${savedSummary.moveCount}`}
                </span>
                <span>·</span>
                <span>{savedSummary.timeControlLabel}</span>
                {savedSummary.isTimed && (
                  <>
                    <span>·</span>
                    <span className="tabular-nums inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                      <Clock className="h-3 w-3 text-[var(--text-muted)]" aria-hidden="true" />
                      <span>W {formatClockMs(savedSummary.clockBankMs.w, false)}</span>
                      <span className="text-[var(--text-muted)]">/</span>
                      <span>B {formatClockMs(savedSummary.clockBankMs.b, false)}</span>
                    </span>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onResumeGame}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              Resume Game
            </button>
          </section>
        )}

        <section
          aria-label="New game setup"
          className="theme-transition flex flex-col gap-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)] sm:p-6"
        >
          <div className="space-y-2">
            <span className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
              Game Mode
            </span>
            <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Game category">
              <button
                type="button"
                role="radio"
                aria-checked={modeKind === 'ai'}
                onClick={() => setModeKind('ai')}
                className={`theme-transition flex items-center gap-3 rounded-xl border p-3 text-left ${
                  modeKind === 'ai'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    modeKind === 'ai'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'bg-[var(--bg-card)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Cpu className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    Play vs AI
                  </div>
                  <div className="truncate text-xs text-[var(--text-secondary)]">
                    Stockfish 17.1
                  </div>
                </div>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={modeKind === 'local'}
                onClick={() => setModeKind('local')}
                className={`theme-transition flex items-center gap-3 rounded-xl border p-3 text-left ${
                  modeKind === 'local'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    modeKind === 'local'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'bg-[var(--bg-card)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    Local 2-Player
                  </div>
                  <div className="truncate text-xs text-[var(--text-secondary)]">
                    Pass &amp; Play
                  </div>
                </div>
              </button>
            </div>
          </div>

          {modeKind === 'ai' ? (
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <span className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                  Play As
                </span>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Side choice">
                  {(
                    [
                      { id: 'w', label: 'White' },
                      { id: 'random', label: 'Random' },
                      { id: 'b', label: 'Black' },
                    ] as const
                  ).map((option) => {
                    const active = sideChoice === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setSideChoice(option.id)}
                        className={`theme-transition inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold ${
                          active
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)] text-[var(--text-primary)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {option.id === 'random' ? (
                          <Shuffle className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <PieceSvg
                            type="k"
                            color={option.id}
                            className="h-5 w-5 shrink-0"
                          />
                        )}
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                  Difficulty
                </span>
                <div
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                  role="radiogroup"
                  aria-label="Difficulty"
                >
                  {DIFFICULTY_PRESETS.map((preset) => {
                    const active = difficulty === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setDifficulty(preset.id)}
                        className={`theme-transition flex items-center justify-between rounded-xl border px-3 py-2 text-left ${
                          active
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]'
                        }`}
                      >
                        <span className="text-xs font-semibold text-[var(--text-primary)]">
                          {preset.label}
                        </span>
                        <span className="tabular-nums text-[11px] font-medium text-[var(--text-secondary)]">
                          {preset.approxElo}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-3">
              <div className="flex items-start gap-2.5">
                <RefreshCw
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    Auto-Flip Board
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Automatically rotate the board to the active player after each move.
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.autoFlipLocal}
                aria-label="Auto-Flip Board"
                onClick={() => preferencesStore.toggleAutoFlipLocal()}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                  prefs.autoFlipLocal
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]'
                    : 'border-[var(--border-strong)] bg-[var(--bg-card)]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    prefs.autoFlipLocal ? 'translate-x-5.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          )}

          <div className="space-y-2.5">
            <span className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
              Time Control
            </span>
            <div className="flex flex-col gap-2">
              {TIME_GROUPS.map((group) => {
                const items = TIME_CONTROLS.filter((tc) => tc.category === group.category);
                if (items.length === 0) {
                  return null;
                }
                return (
                  <div
                    key={group.category}
                    className="grid grid-cols-[4.5rem_1fr] items-center gap-2"
                  >
                    <span className="text-[11px] font-medium text-[var(--text-muted)]">
                      {group.label}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((tc) => {
                        const active = timeControlId === tc.id;
                        return (
                          <button
                            key={tc.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setTimeControlId(tc.id)}
                            className={`tabular-nums theme-transition rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                              active
                                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]'
                            }`}
                          >
                            {tc.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 border-t border-[var(--border-subtle)] pt-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">Board</span>
              <div className="flex items-center gap-1.5" role="group" aria-label="Board style">
                {BOARD_SWATCHES.map((swatch) => {
                  const active = prefs.boardPreset === swatch.id;
                  return (
                    <button
                      key={swatch.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => preferencesStore.setBoardPreset(swatch.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)] text-[var(--text-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="grid h-3.5 w-3.5 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-[3px] border border-black/15"
                      >
                        <span style={{ backgroundColor: swatch.light }} />
                        <span style={{ backgroundColor: swatch.dark }} />
                        <span style={{ backgroundColor: swatch.dark }} />
                        <span style={{ backgroundColor: swatch.light }} />
                      </span>
                      {swatch.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartGame}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] px-6 text-sm font-semibold text-white shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--accent-primary-hover)]"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              Start Game
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
