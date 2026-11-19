import type { ClockBank, Color, GameState, TimeControl } from './types';

export function isTimed(tc: TimeControl): boolean {
  return tc.category !== 'unlimited' && tc.initialMs > 0;
}

export function createInitialClock(tc: TimeControl): GameState['clock'] {
  const initial = isTimed(tc) ? tc.initialMs : 0;
  return {
    bankMs: { w: initial, b: initial },
    activeSinceMs: null,
  };
}

export function computeLiveClockMs(
  clock: GameState['clock'],
  turn: Color,
  nowMs: number,
  tc: TimeControl
): ClockBank {
  if (!isTimed(tc) || clock.activeSinceMs === null) {
    return {
      w: Math.max(0, clock.bankMs.w),
      b: Math.max(0, clock.bankMs.b),
    };
  }

  const elapsed = Math.max(0, nowMs - clock.activeSinceMs);

  if (turn === 'w') {
    return {
      w: Math.max(0, clock.bankMs.w - elapsed),
      b: Math.max(0, clock.bankMs.b),
    };
  }

  return {
    w: Math.max(0, clock.bankMs.w),
    b: Math.max(0, clock.bankMs.b - elapsed),
  };
}

export function commitClockOnMove(
  clock: GameState['clock'],
  mover: Color,
  nowMs: number,
  tc: TimeControl,
  plyAfterMove: number
): { clock: GameState['clock']; expired: boolean } {
  if (!isTimed(tc)) {
    return {
      clock: {
        bankMs: { ...clock.bankMs },
        activeSinceMs: null,
      },
      expired: false,
    };
  }

  if (plyAfterMove <= 1) {
    return {
      clock: {
        bankMs: { ...clock.bankMs },
        activeSinceMs: nowMs,
      },
      expired: false,
    };
  }

  const elapsed = clock.activeSinceMs === null ? 0 : Math.max(0, nowMs - clock.activeSinceMs);
  const remaining = clock.bankMs[mover] - elapsed;

  if (remaining <= 0) {
    const expiredBank: ClockBank =
      mover === 'w'
        ? { w: 0, b: Math.max(0, clock.bankMs.b) }
        : { w: Math.max(0, clock.bankMs.w), b: 0 };

    return {
      clock: {
        bankMs: expiredBank,
        activeSinceMs: null,
      },
      expired: true,
    };
  }

  const updatedMoverMs = remaining + tc.incrementMs;
  const nextBank: ClockBank =
    mover === 'w'
      ? { w: updatedMoverMs, b: Math.max(0, clock.bankMs.b) }
      : { w: Math.max(0, clock.bankMs.w), b: updatedMoverMs };

  return {
    clock: {
      bankMs: nextBank,
      activeSinceMs: nowMs,
    },
    expired: false,
  };
}

export function pauseClock(
  clock: GameState['clock'],
  turn: Color,
  nowMs: number,
  tc: TimeControl
): GameState['clock'] {
  return {
    bankMs: computeLiveClockMs(clock, turn, nowMs, tc),
    activeSinceMs: null,
  };
}
