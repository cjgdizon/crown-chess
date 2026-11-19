import { useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  History,
  Loader2,
  Scale,
} from 'lucide-react';
import { gameStore, useGameState, useLiveClockMs } from '../../app/gameStore';
import { preferencesStore, usePreferences } from '../../app/preferencesStore';
import {
  selectBoardViewModel,
  selectCanUndo,
  selectMoveRows,
  selectPlayerBars,
} from '../../app/selectors';
import { DIFFICULTY_PRESET_BY_ID, oppositeColor, type Color } from '../../domain/types';
import { ChessBoard } from '../board/ChessBoard';
import { ChessLogo } from '../components/ChessLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { EvalBar } from './EvalBar';
import { GameControls } from './GameControls';
import { GameOverBanner } from './GameOverBanner';
import { MoveHistory } from './MoveHistory';
import { PlayerBar } from './PlayerBar';

interface GameScreenProps {
  onExitToMenu: () => void;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function GameScreen({ onExitToMenu }: GameScreenProps) {
  const state = useGameState();
  const liveClockMs = useLiveClockMs();
  const prefs = usePreferences();

  const viewPly = state?.viewPly ?? 0;
  const totalPlies = state?.moves.length ?? 0;

  useEffect(() => {
    if (!state) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isEditableElement(event.target)) {
        return;
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          gameStore.setViewPly(viewPly - 1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          gameStore.setViewPly(viewPly + 1);
          break;
        case 'Home':
          event.preventDefault();
          gameStore.setViewPly(0);
          break;
        case 'End':
          event.preventDefault();
          gameStore.setViewPly(totalPlies);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [state !== null, viewPly, totalPlies]);

  const boardVm = useMemo(
    () => (state ? selectBoardViewModel(state) : null),
    [state]
  );

  const playerBars = useMemo(
    () => (state ? selectPlayerBars(state, liveClockMs) : null),
    [state, liveClockMs]
  );

  const moveRows = useMemo(
    () => (state ? selectMoveRows(state.moves) : []),
    [state?.moves]
  );

  const canUndo = useMemo(() => (state ? selectCanUndo(state) : false), [state]);

  const handleExitToMenu = () => {
    gameStore.pauseAndPersist();
    onExitToMenu();
  };

  if (!state || !boardVm || !playerBars) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg-canvas)] p-6">
        <ChessLogo size="lg" />
        <p className="text-sm text-[var(--text-secondary)]">No active game found.</p>
        <button
          type="button"
          onClick={onExitToMenu}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Menu
        </button>
      </div>
    );
  }

  const isPlaying = state.status.kind === 'playing';
  const liveTurn: Color = state.moves.length % 2 === 0 ? 'w' : 'b';
  const resignColor: Color =
    state.config.mode.kind === 'ai' ? state.config.mode.humanColor : liveTurn;

  const matchBadge =
    state.config.mode.kind === 'ai'
      ? `vs Stockfish · ${DIFFICULTY_PRESET_BY_ID[state.config.mode.difficulty].label}`
      : 'Local 2-Player';

  const handleResign = () => {
    gameStore.resign(resignColor);
  };

  const handleOfferDraw = () => {
    gameStore.offerOrAcceptDraw(liveTurn);
  };

  const handleRematch = () => {
    gameStore.startGame(state.config);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-canvas)] lg:h-screen lg:overflow-hidden">
      <header className="theme-transition flex h-13 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/90 px-3 backdrop-blur-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <ChessLogo size="sm" />
          <span
            aria-hidden="true"
            className="hidden h-4 w-px bg-[var(--border-subtle)] sm:inline-block"
          />
          <div className="hidden items-center gap-2 text-xs text-[var(--text-secondary)] sm:flex">
            <span className="font-medium text-[var(--text-primary)]">{matchBadge}</span>
            <span className="rounded-md bg-[var(--bg-surface)] px-1.5 py-0.5 font-medium text-[var(--text-secondary)]">
              {state.config.timeControl.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {state.engineStatus === 'loading' && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-primary)]" aria-hidden="true" />
              <span className="hidden sm:inline">Loading Stockfish…</span>
              <span className="sm:hidden">Engine…</span>
            </span>
          )}

          {state.engineStatus === 'error' && (
            <span
              role="alert"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-danger)]/40 bg-[var(--accent-danger-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent-danger)]"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Engine unavailable
            </span>
          )}

          <button
            type="button"
            onClick={handleExitToMenu}
            className="theme-transition inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Menu
          </button>

          <ThemeToggle
            compact
            theme={prefs.theme}
            onToggle={() => preferencesStore.toggleTheme()}
          />
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-[1160px] flex-1 flex-col items-center justify-center gap-4 px-3 py-3 sm:px-6 lg:flex-row lg:items-stretch lg:gap-6 lg:py-4">
        <div className="flex w-full max-w-[min(calc(100vw-1.5rem),calc(100dvh-13.5rem),600px)] flex-col justify-center lg:w-auto lg:flex-1 lg:max-w-[min(calc(100dvh-13.5rem+2.5rem),640px)]">
          <div
            className={
              prefs.evalBarVisible
                ? 'grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-x-2.5 gap-y-2'
                : 'grid grid-cols-1 gap-y-2'
            }
          >
            {prefs.evalBarVisible && <div aria-hidden="true" />}
            <PlayerBar vm={playerBars.top} />

            {prefs.evalBarVisible && (
              <EvalBar evaluation={state.evaluation} orientation={state.orientation} />
            )}

            <ChessBoard
              vm={boardVm}
              onAttemptMove={(from, to) => gameStore.attemptMove(from, to)}
              onConfirmPromotion={(piece) => gameStore.confirmPromotion(piece)}
              onCancelPromotion={() => gameStore.cancelPromotion()}
            />

            {prefs.evalBarVisible && <div aria-hidden="true" />}
            <PlayerBar vm={playerBars.bottom} />
          </div>

          {!boardVm.isViewingLive && (
            <div className="mt-2 flex items-center justify-center">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-[var(--accent-secondary)]/45 bg-[var(--accent-secondary-soft)] px-3.5 py-1 text-xs font-medium text-[var(--text-primary)]">
                <History
                  className="h-3.5 w-3.5 text-[var(--accent-secondary)]"
                  aria-hidden="true"
                />
                <span className="tabular-nums">
                  Viewing ply {boardVm.viewPly} —
                </span>
                <button
                  type="button"
                  onClick={() => gameStore.setViewPly(boardVm.totalPlies)}
                  className="font-semibold text-[var(--accent-secondary)] underline decoration-current/50 underline-offset-2 hover:decoration-current"
                >
                  Back to live
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="flex min-h-0 w-full max-w-[600px] shrink-0 flex-col gap-3 lg:w-[356px] lg:max-h-[min(calc(100dvh-5.5rem),712px)] lg:self-center xl:w-[376px]">
          {state.status.kind === 'ended' && (
            <GameOverBanner
              winner={state.status.winner}
              reason={state.status.reason}
              onRematch={handleRematch}
              onBackToMenu={handleExitToMenu}
            />
          )}

          {isPlaying && state.drawOfferedBy !== null && (
            <section
              role="status"
              aria-live="polite"
              className="theme-transition rounded-2xl border border-[var(--accent-secondary)]/45 bg-[var(--bg-card)] p-3 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-secondary-soft)] text-[var(--accent-secondary)]">
                  <Scale className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    {state.drawOfferedBy === 'w' ? 'White' : 'Black'} offered a draw
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Respond on behalf of {state.drawOfferedBy === 'w' ? 'Black' : 'White'}.
                  </p>
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (state.drawOfferedBy) {
                      gameStore.offerOrAcceptDraw(oppositeColor(state.drawOfferedBy));
                    }
                  }}
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-[var(--accent-primary)] px-2.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
                >
                  Accept Draw
                </button>
                <button
                  type="button"
                  onClick={() => gameStore.declineDraw()}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]"
                >
                  Decline
                </button>
              </div>
            </section>
          )}

          <MoveHistory
            rows={moveRows}
            viewPly={state.viewPly}
            totalPlies={state.moves.length}
            onSelectPly={(ply) => gameStore.setViewPly(ply)}
          />

          <GameControls
            modeKind={state.config.mode.kind}
            isPlaying={isPlaying}
            isViewingLive={boardVm.isViewingLive}
            aiThinking={state.aiThinking}
            canUndo={canUndo}
            hasActiveDrawOffer={state.drawOfferedBy !== null}
            prefs={prefs}
            onRequestHint={() => gameStore.requestHint()}
            onUndo={() => gameStore.undoMove()}
            onFlipBoard={() => gameStore.flipBoard()}
            onToggleEvalBar={() => preferencesStore.toggleEvalBar()}
            onToggleSound={() => preferencesStore.toggleSound()}
            onToggleAutoFlip={() => preferencesStore.toggleAutoFlipLocal()}
            onOfferDraw={handleOfferDraw}
            onResign={handleResign}
            onSelectBoardPreset={(preset) => preferencesStore.setBoardPreset(preset)}
          />
        </aside>
      </main>
    </div>
  );
}
