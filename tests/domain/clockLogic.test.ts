import { describe, expect, it } from 'vitest';
import {
  commitClockOnMove,
  computeLiveClockMs,
  createInitialClock,
  isTimed,
  pauseClock,
} from '../../src/domain/clockLogic';
import type { TimeControl } from '../../src/domain/types';

const UNLIMITED: TimeControl = {
  id: 'unlimited',
  category: 'unlimited',
  label: 'Unlimited',
  initialMs: 0,
  incrementMs: 0,
};

const BLITZ_3_2: TimeControl = {
  id: '3+2',
  category: 'blitz',
  label: '3 + 2',
  initialMs: 180_000,
  incrementMs: 2_000,
};

const BULLET_1_0: TimeControl = {
  id: '1+0',
  category: 'bullet',
  label: '1 + 0',
  initialMs: 60_000,
  incrementMs: 0,
};

describe('clockLogic', () => {
  it('identifies timed vs unlimited controls and initializes clocks paused', () => {
    expect(isTimed(UNLIMITED)).toBe(false);
    expect(isTimed(BLITZ_3_2)).toBe(true);

    expect(createInitialClock(UNLIMITED)).toEqual({
      bankMs: { w: 0, b: 0 },
      activeSinceMs: null,
    });
    expect(createInitialClock(BLITZ_3_2)).toEqual({
      bankMs: { w: 180_000, b: 180_000 },
      activeSinceMs: null,
    });
  });

  it('starts ticking after ply 1 without deducting White time on ply 1', () => {
    const initial = createInitialClock(BLITZ_3_2);
    const afterPly1 = commitClockOnMove(initial, 'w', 10_000, BLITZ_3_2, 1);

    expect(afterPly1.expired).toBe(false);
    expect(afterPly1.clock).toEqual({
      bankMs: { w: 180_000, b: 180_000 },
      activeSinceMs: 10_000,
    });
  });

  it('deducts elapsed time and applies increment on ply >= 2', () => {
    const afterPly1 = commitClockOnMove(createInitialClock(BLITZ_3_2), 'w', 10_000, BLITZ_3_2, 1);

    // Black thinks for 4.5s, gets +2s increment => 180_000 - 4_500 + 2_000 = 177_500
    const afterPly2 = commitClockOnMove(afterPly1.clock, 'b', 14_500, BLITZ_3_2, 2);
    expect(afterPly2.expired).toBe(false);
    expect(afterPly2.clock).toEqual({
      bankMs: { w: 180_000, b: 177_500 },
      activeSinceMs: 14_500,
    });

    // White thinks for 1.5s, gets +2s increment => 180_000 - 1_500 + 2_000 = 180_500
    const afterPly3 = commitClockOnMove(afterPly2.clock, 'w', 16_000, BLITZ_3_2, 3);
    expect(afterPly3.expired).toBe(false);
    expect(afterPly3.clock).toEqual({
      bankMs: { w: 180_500, b: 177_500 },
      activeSinceMs: 16_000,
    });
  });

  it('flags expiration when remaining time hits 0 or below without granting increment', () => {
    const clock = {
      bankMs: { w: 5_000, b: 60_000 },
      activeSinceMs: 1_000,
    };

    // Exact 0 remaining expires even when time control has increment
    const expired = commitClockOnMove(clock, 'w', 6_000, BLITZ_3_2, 3);
    expect(expired.expired).toBe(true);
    expect(expired.clock).toEqual({
      bankMs: { w: 0, b: 60_000 },
      activeSinceMs: null,
    });
  });

  it('computes live clock clamped at 0 and guards against backwards timestamps', () => {
    const clock = {
      bankMs: { w: 10_000, b: 25_000 },
      activeSinceMs: 5_000,
    };

    expect(computeLiveClockMs(clock, 'w', 8_250, BULLET_1_0)).toEqual({
      w: 6_750,
      b: 25_000,
    });
    expect(computeLiveClockMs(clock, 'w', 20_000, BULLET_1_0)).toEqual({
      w: 0,
      b: 25_000,
    });
    // Monotonic guard: nowMs < activeSinceMs does not add phantom time
    expect(computeLiveClockMs(clock, 'w', 4_000, BULLET_1_0)).toEqual({
      w: 10_000,
      b: 25_000,
    });
  });

  it('flushes elapsed time cleanly on pauseClock and is a no-op for unlimited games', () => {
    const clock = {
      bankMs: { w: 60_000, b: 55_000 },
      activeSinceMs: 1_000,
    };

    expect(pauseClock(clock, 'b', 4_200, BULLET_1_0)).toEqual({
      bankMs: { w: 60_000, b: 51_800 },
      activeSinceMs: null,
    });

    const unlimitedInitial = createInitialClock(UNLIMITED);
    expect(commitClockOnMove(unlimitedInitial, 'w', 9_000, UNLIMITED, 1)).toEqual({
      clock: { bankMs: { w: 0, b: 0 }, activeSinceMs: null },
      expired: false,
    });
    expect(computeLiveClockMs(unlimitedInitial, 'w', 99_000, UNLIMITED)).toEqual({
      w: 0,
      b: 0,
    });
  });
});
