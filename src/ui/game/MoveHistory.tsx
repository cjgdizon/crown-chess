import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { MoveRow } from '../../app/selectors';

interface MoveHistoryProps {
  rows: MoveRow[];
  viewPly: number;
  totalPlies: number;
  onSelectPly: (ply: number) => void;
}

export function MoveHistory({ rows, viewPly, totalPlies, onSelectPly }: MoveHistoryProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeCellRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const container = listRef.current;
    if (!container) {
      return;
    }

    if (viewPly === 0) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const activeEl = activeCellRef.current;
    if (!activeEl) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      return;
    }

    const elTop = activeEl.offsetTop;
    const elBottom = elTop + activeEl.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;

    if (elTop < viewTop) {
      container.scrollTo({ top: Math.max(0, elTop - 8), behavior: 'smooth' });
    } else if (elBottom > viewBottom) {
      container.scrollTo({
        top: elBottom - container.clientHeight + 8,
        behavior: 'smooth',
      });
    }
  }, [viewPly, totalPlies]);

  const moveSummary =
    totalPlies === 0
      ? 'Start'
      : viewPly === totalPlies
        ? `Move ${Math.ceil(totalPlies / 2)}`
        : `Ply ${viewPly} / ${totalPlies}`;

  const canStepBack = viewPly > 0;
  const canStepForward = viewPly < totalPlies;

  return (
    <section
      aria-label="Move history"
      className="theme-transition flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] lg:min-h-0"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3.5 py-2.5">
        <h2 className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
          Moves
        </h2>
        <span className="tabular-nums text-xs font-medium text-[var(--text-muted)]">
          {moveSummary}
        </span>
      </div>

      <div ref={listRef} className="relative flex-1 overflow-y-auto px-2 py-2">
        {rows.length === 0 ? (
          <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-center text-xs text-[var(--text-muted)]">
            No moves played yet. Select or drag a piece to start.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {rows.map((row) => {
              const isWhiteActive = viewPly === row.white.ply;
              const isBlackActive = row.black !== undefined && viewPly === row.black.ply;

              return (
                <div
                  key={row.moveNumber}
                  className="grid grid-cols-[2.25rem_1fr_1fr] items-center gap-1 rounded-lg px-1 py-0.5 text-sm"
                >
                  <span className="tabular-nums pl-1 text-xs font-medium text-[var(--text-muted)]">
                    {row.moveNumber}.
                  </span>

                  <button
                    ref={isWhiteActive ? activeCellRef : undefined}
                    type="button"
                    onClick={() => onSelectPly(row.white.ply)}
                    aria-current={isWhiteActive ? 'step' : undefined}
                    className={`tabular-nums rounded-md px-2 py-1 text-left font-medium transition-colors ${
                      isWhiteActive
                        ? 'bg-[var(--accent-primary-soft)] font-semibold text-[var(--accent-primary)]'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                    }`}
                  >
                    {row.white.san}
                  </button>

                  {row.black ? (
                    <button
                      ref={isBlackActive ? activeCellRef : undefined}
                      type="button"
                      onClick={() => {
                        if (row.black) {
                          onSelectPly(row.black.ply);
                        }
                      }}
                      aria-current={isBlackActive ? 'step' : undefined}
                      className={`tabular-nums rounded-md px-2 py-1 text-left font-medium transition-colors ${
                        isBlackActive
                          ? 'bg-[var(--accent-primary-soft)] font-semibold text-[var(--accent-primary)]'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                      }`}
                    >
                      {row.black.san}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-1 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/50 px-2 py-1.5">
        <div className="grid flex-1 grid-cols-4 gap-1">
          <button
            type="button"
            disabled={!canStepBack}
            onClick={() => onSelectPly(0)}
            aria-label="First move"
            title="First move (Home)"
            className="inline-flex h-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={!canStepBack}
            onClick={() => onSelectPly(viewPly - 1)}
            aria-label="Previous move"
            title="Previous move (Left Arrow)"
            className="inline-flex h-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={!canStepForward}
            onClick={() => onSelectPly(viewPly + 1)}
            aria-label="Next move"
            title="Next move (Right Arrow)"
            className="inline-flex h-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={!canStepForward}
            onClick={() => onSelectPly(totalPlies)}
            aria-label="Latest move"
            title="Latest move (End)"
            className="inline-flex h-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
