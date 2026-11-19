import { useEffect, useRef } from 'react';
import type { Color, PromotionPiece, Square } from '../../domain/types';
import { PieceSvg } from './PieceSvg';

interface PromotionModalProps {
  color: Color;
  targetSquare: Square;
  orientation: Color;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

const PROMOTION_CHOICES: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];

const PROMOTION_LABELS: Readonly<Record<PromotionPiece, string>> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
};

function squareToGrid(square: Square, orientation: Color): { col: number; row: number } {
  const fileIndex = square.charCodeAt(0) - 97;
  const rankIndex = square.charCodeAt(1) - 49;
  const col = orientation === 'w' ? fileIndex : 7 - fileIndex;
  const row = orientation === 'w' ? 7 - rankIndex : rankIndex;

  return { col, row };
}

export function PromotionModal({
  color,
  targetSquare,
  orientation,
  onSelect,
  onCancel,
}: PromotionModalProps) {
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);
  const { col, row } = squareToGrid(targetSquare, orientation);

  const expandUpward = row >= 4;

  useEffect(() => {
    firstButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);

  const positionStyle = expandUpward
    ? {
        left: `${col * 12.5}%`,
        bottom: `${(7 - row) * 12.5}%`,
        width: '12.5%',
        height: '50%',
      }
    : {
        left: `${col * 12.5}%`,
        top: `${row * 12.5}%`,
        width: '12.5%',
        height: '50%',
      };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose promotion piece"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onCancel}
      className="absolute inset-0 z-30 bg-black/35 backdrop-blur-[1px]"
    >
      <div
        style={positionStyle}
        onClick={(event) => event.stopPropagation()}
        className={`absolute flex overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-[var(--shadow-popover)] ${
          expandUpward ? 'flex-col-reverse' : 'flex-col'
        }`}
      >
        {PROMOTION_CHOICES.map((piece, index) => (
          <button
            key={piece}
            ref={index === 0 ? firstButtonRef : undefined}
            type="button"
            aria-label={`Promote to ${PROMOTION_LABELS[piece]}`}
            onClick={() => onSelect(piece)}
            className="group flex flex-1 items-center justify-center p-1 transition-colors hover:bg-[var(--accent-primary-soft)] focus-visible:bg-[var(--accent-primary-soft)] focus-visible:outline-none"
          >
            <PieceSvg
              type={piece}
              color={color}
              draggable={false}
              className="h-full w-full transition-transform duration-150 group-hover:scale-110"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
