import { formatEvaluation } from '../../app/selectors';
import type { Color, Evaluation } from '../../domain/types';

interface EvalBarProps {
  evaluation: Evaluation | null;
  orientation: Color;
}

export function EvalBar({ evaluation, orientation }: EvalBarProps) {
  const { label, whitePercent } = formatEvaluation(evaluation);
  const whiteAdvantaged = whitePercent >= 50;
  const labelAtTop =
    (orientation === 'w' && !whiteAdvantaged) || (orientation === 'b' && whiteAdvantaged);

  return (
    <div
      role="meter"
      aria-label="Position evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(whitePercent)}
      aria-valuetext={label}
      className="relative flex w-6 shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--eval-black)] shadow-[var(--shadow-card)] select-none sm:w-7"
    >
      <div
        className={`absolute right-0 left-0 bg-[var(--eval-white)] transition-[height] duration-300 ease-out ${
          orientation === 'w' ? 'bottom-0' : 'top-0'
        }`}
        style={{ height: `${whitePercent}%` }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-0 left-0 z-10 h-px bg-black/25"
      />

      <span
        className={`tabular-nums pointer-events-none relative z-20 px-0.5 text-center text-[9px] leading-none font-bold tracking-tight sm:text-[10px] ${
          labelAtTop ? 'mt-1.5 mb-auto' : 'mt-auto mb-1.5'
        } ${whiteAdvantaged ? 'text-[#18181b]' : 'text-[#f3f4f6]'}`}
      >
        {label}
      </span>
    </div>
  );
}
