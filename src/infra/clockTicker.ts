import { computeLiveClockMs, isTimed } from '../domain/clockLogic';
import type { Color, GameState, TimeControl } from '../domain/types';

export interface ClockSource {
  playing: boolean;
  timeControl: TimeControl;
  clock: GameState['clock'];
  turn: Color;
}

export interface ClockTickerOptions {
  getClockSource: () => ClockSource | null;
  onTick: (nowMs: number) => void;
  onTimeout: (loser: Color) => void;
  onFlushSnapshot: () => void;
  now?: () => number;
  intervalMs?: number;
}

const DEFAULT_TICK_INTERVAL_MS = 100;

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class ClockTicker {
  private readonly getClockSource: () => ClockSource | null;
  private readonly onTick: (nowMs: number) => void;
  private readonly onTimeout: (loser: Color) => void;
  private readonly onFlushSnapshot: () => void;
  private readonly now: () => number;
  private readonly intervalMs: number;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  private readonly handleVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.onFlushSnapshot();
    }
  };

  private readonly handlePageHide = (): void => {
    this.onFlushSnapshot();
  };

  constructor(options: ClockTickerOptions) {
    this.getClockSource = options.getClockSource;
    this.onTick = options.onTick;
    this.onTimeout = options.onTimeout;
    this.onFlushSnapshot = options.onFlushSnapshot;
    this.now = options.now ?? defaultNow;
    this.intervalMs = options.intervalMs ?? DEFAULT_TICK_INTERVAL_MS;

    this.attachLifecycleListeners();
  }

  /** Starts or stops the 100ms ticker based on whether a timed game clock is actively running. */
  sync(): void {
    if (this.disposed) {
      return;
    }

    const src = this.getClockSource();
    const shouldTick =
      src !== null &&
      src.playing &&
      isTimed(src.timeControl) &&
      src.clock.activeSinceMs !== null;

    if (shouldTick && this.intervalId === null) {
      this.intervalId = setInterval(() => {
        this.tick();
      }, this.intervalMs);
    } else if (!shouldTick && this.intervalId !== null) {
      this.stopInterval();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stopInterval();
    this.detachLifecycleListeners();
  }

  private tick(): void {
    if (this.disposed) {
      return;
    }
    const src = this.getClockSource();
    if (
      src === null ||
      !src.playing ||
      !isTimed(src.timeControl) ||
      src.clock.activeSinceMs === null
    ) {
      this.stopInterval();
      return;
    }

    const currentNow = this.now();
    const live = computeLiveClockMs(src.clock, src.turn, currentNow, src.timeControl);
    this.onTick(currentNow);

    if (live[src.turn] <= 0) {
      this.stopInterval();
      this.onTimeout(src.turn);
    }
  }

  private stopInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private attachLifecycleListeners(): void {
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', this.handlePageHide);
    }
  }

  private detachLifecycleListeners(): void {
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('pagehide', this.handlePageHide);
    }
  }
}
