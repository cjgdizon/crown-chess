import type { DragEvent } from 'react';
import type { Color, PieceType } from '../../domain/types';

interface PieceSvgProps {
  type: PieceType;
  color: Color;
  className?: string;
  draggable?: boolean;
}

const PIECE_NAMES: Readonly<Record<PieceType, string>> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

const WHITE_FILL = '#FFFFFF';
const WHITE_STROKE = '#1A1D24';
const BLACK_FILL = '#1C1F26';
const BLACK_STROKE = '#0F1115';
const BLACK_DETAIL = '#E5E7EB';

function renderPieceArtwork(type: PieceType, color: Color) {
  const isWhite = color === 'w';
  const fill = isWhite ? WHITE_FILL : BLACK_FILL;
  const stroke = isWhite ? WHITE_STROKE : BLACK_STROKE;
  const detail = isWhite ? WHITE_STROKE : BLACK_DETAIL;

  switch (type) {
    case 'p':
      return (
        <g>
          <path
            d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {!isWhite && (
            <>
              <path
                d="M18.6 25.4c2.1.85 5.7.85 7.8 0"
                fill="none"
                stroke={BLACK_DETAIL}
                strokeWidth="1.15"
                strokeLinecap="round"
              />
              <path
                d="M13.5 36.8h18"
                fill="none"
                stroke={BLACK_DETAIL}
                strokeWidth="1.15"
                strokeLinecap="round"
              />
            </>
          )}
        </g>
      );

    case 'r':
      return (
        <g
          fill={fill}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
          <path d="M34 14l-3 3H14l-3-3" />
          <path d="M31 17v12.5H14V17" />
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
          {isWhite ? (
            <path d="M11 14h23" fill="none" stroke={WHITE_STROKE} strokeLinejoin="miter" />
          ) : (
            <g fill="none" stroke={BLACK_DETAIL} strokeWidth="1.15" strokeLinejoin="miter">
              <path d="M12 35.5h21" />
              <path d="M13 31.5h19" />
              <path d="M14 29.5h17" />
              <path d="M14 16.5h17" />
              <path d="M11 14h23" />
            </g>
          )}
        </g>
      );

    case 'n':
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
          />
          <path
            d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
          />
          <circle cx="9" cy="25.5" r="0.65" fill={detail} stroke={detail} strokeWidth="0.9" />
          <ellipse
            cx="14.5"
            cy="15.5"
            rx="0.6"
            ry="1.35"
            transform="rotate(30 14.5 15.5)"
            fill={detail}
            stroke={detail}
            strokeWidth="0.9"
          />
          {!isWhite && (
            <path
              d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34-2.37-4.49-5.79-6.64-9.19-7.16l-.51-.1z"
              fill={BLACK_DETAIL}
              stroke="none"
            />
          )}
        </g>
      );

    case 'b':
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <g fill={fill} stroke={stroke} strokeWidth="1.5">
            <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" />
            <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
            <circle cx="22.5" cy="8" r="2.5" />
          </g>
          <path
            d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"
            fill="none"
            stroke={detail}
            strokeWidth={isWhite ? '1.5' : '1.25'}
            strokeLinejoin="miter"
          />
        </g>
      );

    case 'q':
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <g fill={fill} stroke={stroke} strokeWidth="1.5">
            <circle cx="6" cy="12" r="2.25" />
            <circle cx="14" cy="9" r="2.25" />
            <circle cx="22.5" cy="8" r="2.25" />
            <circle cx="31" cy="9" r="2.25" />
            <circle cx="39" cy="12" r="2.25" />
            <path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" />
            <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
          </g>
          <g fill="none" stroke={detail} strokeWidth={isWhite ? '1.5' : '1.15'}>
            {!isWhite && <path d="M9 26c8.5-1.5 21-1.5 27 0" />}
            <path d="M11.5 30c3.5-1 18.5-1 22 0" />
            <path d="M12 33.5c6-1 15-1 21 0" />
            {!isWhite && (
              <>
                <path d="M10.5 36c6-1 18-1 24 0" />
                <path d="M11 38.5a35 35 1 0 0 23 0" />
              </>
            )}
          </g>
        </g>
      );

    case 'k':
      return (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M22.5 11.63V6M20 8h5"
            fill="none"
            stroke={stroke}
            strokeWidth="1.75"
            strokeLinejoin="miter"
          />
          <path
            d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
          />
          <path
            d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
          />
          {!isWhite && (
            <path
              d="M32 29.5s8.5-4 6.03-9.65C34.15 14 25 18 22.5 24.5v2.1-2.1C20 18 10.85 14 6.97 19.85 4.5 25.5 13 29.5 13 29.5"
              fill="none"
              stroke={BLACK_DETAIL}
              strokeWidth="1.15"
            />
          )}
          <g fill="none" stroke={detail} strokeWidth={isWhite ? '1.5' : '1.15'}>
            <path d="M11.5 30c5.5-3 15.5-3 21 0" />
            <path d="M11.5 33.5c5.5-3 15.5-3 21 0" />
            <path d="M11.5 37c5.5-3 15.5-3 21 0" />
          </g>
        </g>
      );

    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function PieceSvg({ type, color, className, draggable = false }: PieceSvgProps) {
  const colorLabel = color === 'w' ? 'White' : 'Black';
  const ariaLabel = `${colorLabel} ${PIECE_NAMES[type]}`;

  const handleDragStart = (event: DragEvent<SVGSVGElement>) => {
    if (!draggable) {
      event.preventDefault();
    }
  };

  return (
    <svg
      viewBox="0 0 45 45"
      role="img"
      aria-label={ariaLabel}
      data-draggable={draggable ? 'true' : 'false'}
      onDragStart={handleDragStart}
      className={className ? `select-none ${className}` : 'h-full w-full select-none'}
    >
      {renderPieceArtwork(type, color)}
    </svg>
  );
}
