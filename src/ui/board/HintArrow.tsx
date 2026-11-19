import type { Color, Square } from '../../domain/types';

interface HintArrowProps {
  from: Square;
  to: Square;
  orientation: Color;
}

const SQUARE_SIZE = 100;
const START_OFFSET = 20;
const TIP_INSET = 13;
const SHAFT_HALF_WIDTH = 10.5;
const HEAD_LENGTH = 34;
const HEAD_HALF_WIDTH = 27;

function squareToCenter(square: Square, orientation: Color): { x: number; y: number } {
  const fileIndex = square.charCodeAt(0) - 97;
  const rankIndex = square.charCodeAt(1) - 49;
  const col = orientation === 'w' ? fileIndex : 7 - fileIndex;
  const row = orientation === 'w' ? 7 - rankIndex : rankIndex;

  return {
    x: col * SQUARE_SIZE + SQUARE_SIZE / 2,
    y: row * SQUARE_SIZE + SQUARE_SIZE / 2,
  };
}

function buildArrowPath(
  fromPt: { x: number; y: number },
  toPt: { x: number; y: number },
): string | null {
  const dx = toPt.x - fromPt.x;
  const dy = toPt.y - fromPt.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= START_OFFSET + TIP_INSET + 4) {
    return null;
  }

  const ux = dx / distance;
  const uy = dy / distance;
  const px = -uy;
  const py = ux;

  const startX = fromPt.x + ux * START_OFFSET;
  const startY = fromPt.y + uy * START_OFFSET;
  const tipX = toPt.x - ux * TIP_INSET;
  const tipY = toPt.y - uy * TIP_INSET;

  const usableLen = distance - START_OFFSET - TIP_INSET;
  const headLen = Math.min(HEAD_LENGTH, usableLen * 0.55);
  const neckX = tipX - ux * headLen;
  const neckY = tipY - uy * headLen;

  const tailLeftX = startX + px * SHAFT_HALF_WIDTH;
  const tailLeftY = startY + py * SHAFT_HALF_WIDTH;
  const tailRightX = startX - px * SHAFT_HALF_WIDTH;
  const tailRightY = startY - py * SHAFT_HALF_WIDTH;

  const neckLeftX = neckX + px * SHAFT_HALF_WIDTH;
  const neckLeftY = neckY + py * SHAFT_HALF_WIDTH;
  const neckRightX = neckX - px * SHAFT_HALF_WIDTH;
  const neckRightY = neckY - py * SHAFT_HALF_WIDTH;

  const wingLeftX = neckX + px * HEAD_HALF_WIDTH;
  const wingLeftY = neckY + py * HEAD_HALF_WIDTH;
  const wingRightX = neckX - px * HEAD_HALF_WIDTH;
  const wingRightY = neckY - py * HEAD_HALF_WIDTH;

  return [
    `M ${tailLeftX.toFixed(2)} ${tailLeftY.toFixed(2)}`,
    `L ${neckLeftX.toFixed(2)} ${neckLeftY.toFixed(2)}`,
    `L ${wingLeftX.toFixed(2)} ${wingLeftY.toFixed(2)}`,
    `L ${tipX.toFixed(2)} ${tipY.toFixed(2)}`,
    `L ${wingRightX.toFixed(2)} ${wingRightY.toFixed(2)}`,
    `L ${neckRightX.toFixed(2)} ${neckRightY.toFixed(2)}`,
    `L ${tailRightX.toFixed(2)} ${tailRightY.toFixed(2)}`,
    `A ${SHAFT_HALF_WIDTH} ${SHAFT_HALF_WIDTH} 0 0 0 ${tailLeftX.toFixed(2)} ${tailLeftY.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export function HintArrow({ from, to, orientation }: HintArrowProps) {
  const fromPt = squareToCenter(from, orientation);
  const toPt = squareToCenter(to, orientation);
  const pathData = buildArrowPath(fromPt, toPt);

  if (!pathData) {
    return null;
  }

  return (
    <svg
      viewBox="0 0 800 800"
      role="img"
      aria-label={`Suggested move from ${from} to ${to}`}
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
    >
      <path
        d={pathData}
        fill="var(--hint-arrow)"
        stroke="var(--hint-arrow-stroke)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
