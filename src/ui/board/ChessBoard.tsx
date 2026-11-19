import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import type { BoardViewModel } from '../../app/selectors';
import type { Color, PieceType, PromotionPiece, Square } from '../../domain/types';
import { HintArrow } from './HintArrow';
import { PieceSvg } from './PieceSvg';
import { PromotionModal } from './PromotionModal';

interface ChessBoardProps {
  vm: BoardViewModel;
  onAttemptMove: (from: Square, to: Square) => void;
  onConfirmPromotion: (piece: PromotionPiece) => void;
  onCancelPromotion: () => void;
}

interface DragState {
  pointerId: number;
  from: Square;
  piece: { type: PieceType; color: Color };
  startX: number;
  startY: number;
  localX: number;
  localY: number;
  squareSize: number;
  startedDragging: boolean;
  hoverSquare: Square | null;
  wasAlreadySelected: boolean;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
const INDICES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const DRAG_THRESHOLD_PX = 4;

const PIECE_LABELS: Readonly<Record<PieceType, string>> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

function indicesToSquare(fileIdx: number, rankIdx: number): Square | null {
  const file = FILES[fileIdx];
  const rank = RANKS[rankIdx];
  if (!file || !rank) {
    return null;
  }
  return `${file}${rank}`;
}

function visualCellToCoords(
  visualRow: number,
  visualCol: number,
  orientation: Color
): { fileIdx: number; rankIdx: number; boardRow: number; square: Square } | null {
  const fileIdx = orientation === 'w' ? visualCol : 7 - visualCol;
  const rankIdx = orientation === 'w' ? 7 - visualRow : visualRow;
  const boardRow = 7 - rankIdx;
  const square = indicesToSquare(fileIdx, rankIdx);
  if (!square) {
    return null;
  }
  return { fileIdx, rankIdx, boardRow, square };
}

function pointToSquare(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  orientation: Color
): Square | null {
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;
  if (relX < 0 || relY < 0 || relX >= rect.width || relY >= rect.height) {
    return null;
  }
  const visualCol = Math.min(7, Math.max(0, Math.floor((relX / rect.width) * 8)));
  const visualRow = Math.min(7, Math.max(0, Math.floor((relY / rect.height) * 8)));
  const coords = visualCellToCoords(visualRow, visualCol, orientation);
  return coords ? coords.square : null;
}

function getPieceAtSquare(vm: BoardViewModel, square: Square): { type: PieceType; color: Color } | null {
  const fileIdx = square.charCodeAt(0) - 97;
  const rankIdx = square.charCodeAt(1) - 49;
  const boardRow = 7 - rankIdx;
  const cell = vm.board[boardRow]?.[fileIdx] ?? null;
  return cell ? { type: cell.type, color: cell.color } : null;
}

export function ChessBoard({
  vm,
  onAttemptMove,
  onConfirmPromotion,
  onCancelPromotion,
}: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    setSelectedSquare(null);
    setDrag(null);
  }, [vm.viewPly, vm.totalPlies, vm.canInteract]);

  const activeSourceSquare = vm.canInteract ? (drag?.from ?? selectedSquare) : null;
  const legalTargets = new Set<Square>(
    activeSourceSquare ? vm.legalMoves[activeSourceSquare] : []
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if (!vm.canInteract || vm.pendingPromotion !== null) {
      return;
    }

    const boardEl = boardRef.current;
    if (!boardEl) {
      return;
    }

    const rect = boardEl.getBoundingClientRect();
    const square = pointToSquare(event.clientX, event.clientY, rect, vm.orientation);
    if (!square) {
      return;
    }

    if (selectedSquare !== null && vm.legalMoves[selectedSquare].includes(square)) {
      event.preventDefault();
      onAttemptMove(selectedSquare, square);
      setSelectedSquare(null);
      setDrag(null);
      return;
    }

    const piece = getPieceAtSquare(vm, square);
    if (piece && piece.color === vm.turn) {
      event.preventDefault();
      const wasAlreadySelected = selectedSquare === square;
      setSelectedSquare(square);

      if (typeof boardEl.setPointerCapture === 'function') {
        try {
          boardEl.setPointerCapture(event.pointerId);
        } catch {
          // Synthetic pointer events without an active pointer id may throw.
        }
      }

      setDrag({
        pointerId: event.pointerId,
        from: square,
        piece,
        startX: event.clientX,
        startY: event.clientY,
        localX: event.clientX - rect.left,
        localY: event.clientY - rect.top,
        squareSize: rect.width / 8,
        startedDragging: false,
        hoverSquare: square,
        wasAlreadySelected,
      });
      return;
    }

    setSelectedSquare(null);
    setDrag(null);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const boardEl = boardRef.current;
    if (!boardEl) {
      return;
    }

    const rect = boardEl.getBoundingClientRect();
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    const startedDragging = drag.startedDragging || distance > DRAG_THRESHOLD_PX;
    const hoverSquare = pointToSquare(event.clientX, event.clientY, rect, vm.orientation);

    setDrag({
      ...drag,
      localX: event.clientX - rect.left,
      localY: event.clientY - rect.top,
      squareSize: rect.width / 8,
      startedDragging,
      hoverSquare,
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    const boardEl = boardRef.current;
    if (boardEl && typeof boardEl.hasPointerCapture === 'function') {
      try {
        if (boardEl.hasPointerCapture(event.pointerId)) {
          boardEl.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore if capture was already released.
      }
    }

    const rect = boardEl?.getBoundingClientRect();
    const dropSquare = rect
      ? pointToSquare(event.clientX, event.clientY, rect, vm.orientation)
      : null;

    if (drag.startedDragging) {
      if (
        dropSquare &&
        dropSquare !== drag.from &&
        vm.legalMoves[drag.from].includes(dropSquare)
      ) {
        onAttemptMove(drag.from, dropSquare);
        setSelectedSquare(null);
      } else if (dropSquare === drag.from) {
        setSelectedSquare(drag.from);
      } else {
        setSelectedSquare(null);
      }
    } else if (drag.wasAlreadySelected) {
      setSelectedSquare(null);
    } else {
      setSelectedSquare(drag.from);
    }

    setDrag(null);
  };

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const boardEl = boardRef.current;
    if (boardEl && typeof boardEl.hasPointerCapture === 'function') {
      try {
        if (boardEl.hasPointerCapture(event.pointerId)) {
          boardEl.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore if capture was already released.
      }
    }
    setDrag(null);
  };

  const handleSquareKeyboardActivate = (square: Square, event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 || !vm.canInteract || vm.pendingPromotion !== null) {
      return;
    }
    if (selectedSquare !== null && vm.legalMoves[selectedSquare].includes(square)) {
      onAttemptMove(selectedSquare, square);
      setSelectedSquare(null);
      return;
    }
    const piece = getPieceAtSquare(vm, square);
    if (piece && piece.color === vm.turn) {
      setSelectedSquare(selectedSquare === square ? null : square);
      return;
    }
    setSelectedSquare(null);
  };

  return (
    <div className="relative aspect-square w-full select-none">
      <div
        ref={boardRef}
        role="grid"
        aria-label="Chessboard"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className={`no-select relative grid h-full w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-xl border border-[var(--border-subtle)] shadow-[var(--shadow-board)] ${
          drag?.startedDragging ? 'cursor-grabbing' : ''
        }`}
      >
        {INDICES.map((visualRow) =>
          INDICES.map((visualCol) => {
            const coords = visualCellToCoords(visualRow, visualCol, vm.orientation);
            if (!coords) {
              return null;
            }

            const { fileIdx, rankIdx, boardRow, square } = coords;
            const piece = vm.board[boardRow]?.[fileIdx] ?? null;
            const isLight = (fileIdx + rankIdx) % 2 === 1;
            const isLastMove =
              vm.lastMove !== null &&
              (vm.lastMove.from === square || vm.lastMove.to === square);
            const isSelected = activeSourceSquare === square;
            const isKingInCheck = vm.kingInCheckSquare === square;
            const isLegalTarget = legalTargets.has(square);
            const isDragOrigin = Boolean(drag?.startedDragging && drag.from === square);
            const isDragHoverTarget = Boolean(
              drag?.startedDragging && drag.hoverSquare === square && isLegalTarget
            );
            const isMovablePiece = Boolean(
              vm.canInteract && piece && piece.color === vm.turn
            );

            const showRankLabel = visualCol === 0;
            const showFileLabel = visualRow === 7;
            const rankChar = RANKS[rankIdx];
            const fileChar = FILES[fileIdx];
            const coordColor = isLight
              ? 'var(--board-coord-on-light)'
              : 'var(--board-coord-on-dark)';

            const pieceDescription = piece
              ? `, ${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_LABELS[piece.type]}`
              : '';

            return (
              <button
                key={square}
                type="button"
                tabIndex={vm.canInteract && (isMovablePiece || isLegalTarget) ? 0 : -1}
                data-square={square}
                aria-label={`${square}${pieceDescription}`}
                onClick={(event) => handleSquareKeyboardActivate(square, event)}
                style={{
                  backgroundColor: isLight ? 'var(--board-light)' : 'var(--board-dark)',
                }}
                className={`relative flex items-center justify-center p-0 focus-visible:z-20 focus-visible:outline-offset-[-2px] ${
                  drag?.startedDragging
                    ? 'cursor-grabbing'
                    : isMovablePiece
                      ? 'cursor-grab'
                      : isLegalTarget
                        ? 'cursor-pointer'
                        : 'cursor-default'
                }`}
              >
                {isLastMove && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{ backgroundColor: 'var(--sq-last-move)' }}
                  />
                )}

                {isSelected && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{ backgroundColor: 'var(--sq-selected)' }}
                  />
                )}

                {isKingInCheck && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{ background: 'var(--sq-check-glow)' }}
                  />
                )}

                {isDragHoverTarget && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 ring-3 ring-inset ring-[var(--accent-primary)]"
                  />
                )}

                {isLegalTarget && !piece && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none relative z-10 h-[30%] w-[30%] rounded-full"
                    style={{ backgroundColor: 'var(--sq-legal-dot)' }}
                  />
                )}

                {isLegalTarget && piece && (
                  <svg
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="43"
                      fill="none"
                      stroke="var(--sq-legal-capture)"
                      strokeWidth="8.5"
                    />
                  </svg>
                )}

                {piece && (
                  <div
                    className={`pointer-events-none relative z-10 h-[88%] w-[88%] transition-opacity duration-100 ${
                      isDragOrigin ? 'opacity-25' : 'opacity-100'
                    }`}
                  >
                    <PieceSvg type={piece.type} color={piece.color} draggable={false} />
                  </div>
                )}

                {showRankLabel && rankChar && (
                  <span
                    aria-hidden="true"
                    style={{ color: coordColor }}
                    className="pointer-events-none absolute top-[3px] left-[4px] z-10 text-[10px] leading-none font-semibold sm:text-[11px]"
                  >
                    {rankChar}
                  </span>
                )}

                {showFileLabel && fileChar && (
                  <span
                    aria-hidden="true"
                    style={{ color: coordColor }}
                    className="pointer-events-none absolute right-[4px] bottom-[3px] z-10 text-[10px] leading-none font-semibold sm:text-[11px]"
                  >
                    {fileChar}
                  </span>
                )}
              </button>
            );
          })
        )}

        {vm.activeHint && (
          <HintArrow
            from={vm.activeHint.from}
            to={vm.activeHint.to}
            orientation={vm.orientation}
          />
        )}

        {vm.pendingPromotion && (
          <PromotionModal
            color={vm.pendingPromotion.color}
            targetSquare={vm.pendingPromotion.to}
            orientation={vm.orientation}
            onSelect={onConfirmPromotion}
            onCancel={onCancelPromotion}
          />
        )}
      </div>

      {drag?.startedDragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 z-40 will-change-transform"
          style={{
            width: `${drag.squareSize}px`,
            height: `${drag.squareSize}px`,
            transform: `translate3d(${drag.localX - drag.squareSize / 2}px, ${
              drag.localY - drag.squareSize / 2
            }px, 0) scale(1.1)`,
          }}
        >
          <PieceSvg
            type={drag.piece.type}
            color={drag.piece.color}
            draggable={false}
            className="h-full w-full drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)]"
          />
        </div>
      )}
    </div>
  );
}
