import { formatClockMs, type PlayerBarVM } from '../../app/selectors';
import { oppositeColor } from '../../domain/types';
import { PieceSvg } from '../board/PieceSvg';

interface PlayerBarProps {
  vm: PlayerBarVM;
}

export function PlayerBar({ vm }: PlayerBarProps) {
  const capturedColor = oppositeColor(vm.color);

  const clockClasses = vm.isTurn
    ? vm.isLowTime
      ? 'border-[var(--accent-danger)] bg-[var(--accent-danger-soft)] text-[var(--accent-danger)]'
      : 'border-[var(--accent-primary)]/60 bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-card)]'
    : vm.isLowTime
      ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--accent-danger)]/85'
      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]';

  return (
    <div className="theme-transition flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 sm:min-h-[48px]">
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
            vm.isTurn
              ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
          }`}
        >
          <PieceSvg type="k" color={vm.color} className="h-6 w-6" />
          {vm.isTurn && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-card)] bg-[var(--accent-primary)]"
            />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {vm.label}
            </span>
            <span className="hidden truncate text-xs text-[var(--text-secondary)] sm:inline">
              {vm.subtitle}
            </span>
            {vm.isThinking && (
              <span
                role="status"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent-primary-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-primary)]"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-primary)]" />
                Thinking
              </span>
            )}
          </div>

          {(vm.capturedPieces.length > 0 || vm.materialAdvantage > 0) && (
            <div className="mt-0.5 flex items-center gap-1.5">
              {vm.capturedPieces.length > 0 && (
                <div className="flex items-center -space-x-1.5" aria-label="Captured pieces">
                  {vm.capturedPieces.map((piece, idx) => (
                    <span
                      key={`${piece}-${idx}`}
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
                    >
                      <PieceSvg type={piece} color={capturedColor} className="h-4 w-4" />
                    </span>
                  ))}
                </div>
              )}
              {vm.materialAdvantage > 0 && (
                <span className="tabular-nums rounded bg-[var(--bg-surface)] px-1.5 py-0.25 text-[11px] font-semibold text-[var(--text-secondary)]">
                  +{vm.materialAdvantage}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {vm.isTimed && (
        <div
          aria-label={`${vm.label} remaining time`}
          className={`tabular-nums shrink-0 rounded-lg border px-2.5 py-1 text-base font-semibold tracking-tight transition-colors sm:text-lg ${clockClasses}`}
        >
          {formatClockMs(vm.clockMs)}
        </div>
      )}
    </div>
  );
}
