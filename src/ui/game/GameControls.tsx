import { useEffect, useState } from 'react';
import {
  ArrowUpDown,
  BarChart3,
  Flag,
  Handshake,
  Lightbulb,
  RefreshCw,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { BoardPreset, Preferences } from '../../domain/types';

interface GameControlsProps {
  modeKind: 'ai' | 'local';
  isPlaying: boolean;
  isViewingLive: boolean;
  aiThinking: boolean;
  canUndo: boolean;
  hasActiveDrawOffer: boolean;
  prefs: Preferences;
  onRequestHint: () => void;
  onUndo: () => void;
  onFlipBoard: () => void;
  onToggleEvalBar: () => void;
  onToggleSound: () => void;
  onToggleAutoFlip: () => void;
  onOfferDraw: () => void;
  onResign: () => void;
  onSelectBoardPreset: (preset: BoardPreset) => void;
}

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

export function GameControls({
  modeKind,
  isPlaying,
  isViewingLive,
  aiThinking,
  canUndo,
  hasActiveDrawOffer,
  prefs,
  onRequestHint,
  onUndo,
  onFlipBoard,
  onToggleEvalBar,
  onToggleSound,
  onToggleAutoFlip,
  onOfferDraw,
  onResign,
  onSelectBoardPreset,
}: GameControlsProps) {
  const [confirmingResign, setConfirmingResign] = useState(false);

  useEffect(() => {
    if (!isPlaying) {
      setConfirmingResign(false);
    }
  }, [isPlaying]);

  const hintDisabled = !isPlaying || !isViewingLive || aiThinking;

  return (
    <section
      aria-label="Game controls"
      className="theme-transition flex flex-col gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 shadow-[var(--shadow-card)]"
    >
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={hintDisabled}
          onClick={onRequestHint}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 disabled:hover:border-[var(--border-subtle)] disabled:hover:bg-[var(--bg-surface)]"
        >
          <Lightbulb className="h-3.5 w-3.5 text-[var(--accent-secondary)]" aria-hidden="true" />
          Hint
        </button>

        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 disabled:hover:border-[var(--border-subtle)] disabled:hover:bg-[var(--bg-surface)]"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          Undo
        </button>

        <button
          type="button"
          onClick={onFlipBoard}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]"
        >
          <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
          Flip
        </button>
      </div>

      <div className={`grid gap-1.5 ${modeKind === 'local' ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <button
          type="button"
          aria-pressed={prefs.evalBarVisible}
          onClick={onToggleEvalBar}
          className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors ${
            prefs.evalBarVisible
              ? 'border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
          Eval Bar
        </button>

        <button
          type="button"
          aria-pressed={prefs.soundEnabled}
          onClick={onToggleSound}
          className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors ${
            prefs.soundEnabled
              ? 'border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
          }`}
        >
          {prefs.soundEnabled ? (
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Sound
        </button>

        {modeKind === 'local' && (
          <button
            type="button"
            aria-pressed={prefs.autoFlipLocal}
            onClick={onToggleAutoFlip}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors ${
              prefs.autoFlipLocal
                ? 'border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
            }`}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Auto-Flip
          </button>
        )}
      </div>

      {isPlaying && (
        <div className="flex items-center gap-1.5">
          {modeKind === 'local' && !confirmingResign && (
            <button
              type="button"
              disabled={hasActiveDrawOffer}
              onClick={onOfferDraw}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-45"
            >
              <Handshake className="h-3.5 w-3.5" aria-hidden="true" />
              {hasActiveDrawOffer ? 'Draw Offered' : 'Offer Draw'}
            </button>
          )}

          {confirmingResign ? (
            <div className="flex flex-1 items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setConfirmingResign(false);
                  onResign();
                }}
                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-danger)] px-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                Confirm Resign?
              </button>
              <button
                type="button"
                onClick={() => setConfirmingResign(false)}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingResign(true)}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--accent-danger)]/35 bg-[var(--accent-danger-soft)] px-2.5 text-xs font-medium text-[var(--accent-danger)] transition-colors hover:border-[var(--accent-danger)]/60"
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              Resign
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2">
        <span className="text-[11px] font-medium text-[var(--text-muted)]">Board</span>
        <div className="flex items-center gap-1.5" role="group" aria-label="Board theme">
          {BOARD_SWATCHES.map((swatch) => {
            const active = prefs.boardPreset === swatch.id;
            return (
              <button
                key={swatch.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectBoardPreset(swatch.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
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
    </section>
  );
}
