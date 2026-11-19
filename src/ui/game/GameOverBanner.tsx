import { ArrowLeft, RotateCcw, Scale, Trophy } from 'lucide-react';
import type { Color, EndReason } from '../../domain/types';

interface GameOverBannerProps {
  winner: Color | 'draw';
  reason: EndReason;
  onRematch: () => void;
  onBackToMenu: () => void;
}

function formatWinnerName(winner: Color | 'draw'): string {
  if (winner === 'w') {
    return 'White';
  }
  if (winner === 'b') {
    return 'Black';
  }
  return 'Draw';
}

function formatResultCopy(winner: Color | 'draw', reason: EndReason): {
  headline: string;
  detail: string;
} {
  const winnerName = formatWinnerName(winner);

  switch (reason) {
    case 'checkmate':
      return {
        headline: `${winnerName} wins by checkmate`,
        detail: 'King has no legal escape.',
      };
    case 'stalemate':
      return {
        headline: 'Draw by stalemate',
        detail: 'No legal moves remaining without check.',
      };
    case 'insufficient-material':
      return {
        headline: 'Draw by insufficient material',
        detail: 'Neither side can force checkmate.',
      };
    case 'threefold-repetition':
      return {
        headline: 'Draw by threefold repetition',
        detail: 'The same position occurred three times.',
      };
    case 'fifty-move':
      return {
        headline: 'Draw by fifty-move rule',
        detail: 'Fifty moves without a capture or pawn move.',
      };
    case 'timeout':
      return {
        headline: `${winnerName} wins on time`,
        detail: 'Opponent ran out of time.',
      };
    case 'timeout-insufficient-material':
      return {
        headline: 'Draw by timeout vs insufficient material',
        detail: 'Time expired, but opponent lacks mating material.',
      };
    case 'resignation':
      return {
        headline: `${winnerName} wins by resignation`,
        detail: 'Opponent resigned the match.',
      };
    case 'mutual-draw':
      return {
        headline: 'Draw by agreement',
        detail: 'Both players agreed to a draw.',
      };
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export function GameOverBanner({
  winner,
  reason,
  onRematch,
  onBackToMenu,
}: GameOverBannerProps) {
  const isDraw = winner === 'draw';
  const { headline, detail } = formatResultCopy(winner, reason);

  return (
    <section
      role="status"
      aria-live="polite"
      className="theme-transition rounded-2xl border border-[var(--accent-primary)]/40 bg-[var(--bg-card)] p-3.5 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            isDraw
              ? 'bg-[var(--accent-secondary-soft)] text-[var(--accent-secondary)]'
              : 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]'
          }`}
        >
          {isDraw ? (
            <Scale className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Trophy className="h-4 w-4" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{headline}</p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{detail}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onRematch}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Rematch
        </button>
        <button
          type="button"
          onClick={onBackToMenu}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to Menu
        </button>
      </div>
    </section>
  );
}
