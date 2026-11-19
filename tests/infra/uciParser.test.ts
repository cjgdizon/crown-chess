import { describe, expect, it, vi } from 'vitest';
import {
  StockfishEngine,
  type UciWorkerLike,
} from '../../src/infra/stockfishEngine';
import {
  getFenActiveColor,
  parseUciBestMove,
  parseUciInfoScore,
  parseUciMoveParts,
} from '../../src/infra/uciParser';
import type { EngineStatus, Evaluation } from '../../src/domain/types';

const WHITE_TO_MOVE_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK_TO_MOVE_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

class FakeUciWorker implements UciWorkerLike {
  readonly posted: string[] = [];
  terminated = false;
  private onMessage: ((data: unknown) => void) | null = null;
  private onError: (() => void) | null = null;

  postMessage(message: string): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  setHandlers(onMessage: ((data: unknown) => void) | null, onError: (() => void) | null): void {
    this.onMessage = onMessage;
    this.onError = onError;
  }

  emit(line: string): void {
    this.onMessage?.(line);
  }

  emitError(): void {
    this.onError?.();
  }
}

describe('uciParser', () => {
  describe('getFenActiveColor', () => {
    it('extracts w and b active colors from valid FEN strings', () => {
      expect(getFenActiveColor(WHITE_TO_MOVE_FEN)).toBe('w');
      expect(getFenActiveColor(BLACK_TO_MOVE_FEN)).toBe('b');
    });

    it('defaults to white for malformed FEN input', () => {
      expect(getFenActiveColor('')).toBe('w');
      expect(getFenActiveColor('not-a-fen')).toBe('w');
    });
  });

  describe('parseUciInfoScore', () => {
    it('parses centipawn scores from White perspective without flipping', () => {
      const line = 'info depth 14 seldepth 20 multipv 1 score cp 135 nodes 42000 pv e2e4 e7e5';
      expect(parseUciInfoScore(line, 'w')).toEqual({
        kind: 'cp',
        whiteCp: 135,
        depth: 14,
      });

      const negLine = 'info depth 12 score cp -48 pv d2d4';
      expect(parseUciInfoScore(negLine, 'w')).toEqual({
        kind: 'cp',
        whiteCp: -48,
        depth: 12,
      });
    });

    it('negates centipawn and mate scores when Black is to move', () => {
      const blackBetterCp = 'info depth 16 score cp 85 nodes 10000 pv c7c5';
      expect(parseUciInfoScore(blackBetterCp, 'b')).toEqual({
        kind: 'cp',
        whiteCp: -85,
        depth: 16,
      });

      const whiteBetterCp = 'info depth 16 score cp -140 pv e7e5';
      expect(parseUciInfoScore(whiteBetterCp, 'b')).toEqual({
        kind: 'cp',
        whiteCp: 140,
        depth: 16,
      });

      const blackMates = 'info depth 18 score mate 3 pv d8h4';
      expect(parseUciInfoScore(blackMates, 'b')).toEqual({
        kind: 'mate',
        whiteMateIn: -3,
        depth: 18,
      });

      const blackGetsMated = 'info depth 18 score mate -2 pv g8f6';
      expect(parseUciInfoScore(blackGetsMated, 'b')).toEqual({
        kind: 'mate',
        whiteMateIn: 2,
        depth: 18,
      });
    });

    it('normalizes zero scores to positive 0 even when Black is to move', () => {
      const ev = parseUciInfoScore('info depth 10 score cp 0 pv e7e5', 'b');
      expect(ev).toEqual({ kind: 'cp', whiteCp: 0, depth: 10 });
      if (ev?.kind === 'cp') {
        expect(Object.is(ev.whiteCp, 0)).toBe(true);
      }
    });

    it('ignores lowerbound and upperbound aspiration lines', () => {
      expect(
        parseUciInfoScore('info depth 15 score cp 90 lowerbound nodes 5000 pv e2e4', 'w')
      ).toBeNull();
      expect(
        parseUciInfoScore('info depth 15 score cp -20 upperbound nodes 5000 pv e2e4', 'b')
      ).toBeNull();
    });

    it('returns null for non-score info lines and invalid lines', () => {
      expect(parseUciInfoScore('info string NNUE evaluation using nn.nnue', 'w')).toBeNull();
      expect(parseUciInfoScore('info depth 10 currmove e2e4 currmovenumber 1', 'w')).toBeNull();
      expect(parseUciInfoScore('bestmove e2e4 ponder e7e5', 'w')).toBeNull();
      expect(parseUciInfoScore('readyok', 'w')).toBeNull();
      expect(parseUciInfoScore('info depth 10 score cp nope', 'w')).toBeNull();
    });
  });

  describe('parseUciBestMove', () => {
    it('extracts valid bestmove tokens including promotions', () => {
      expect(parseUciBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
      expect(parseUciBestMove('bestmove e7e8q')).toBe('e7e8q');
    });

    it('returns null for (none), 0000, or malformed bestmove lines', () => {
      expect(parseUciBestMove('bestmove (none)')).toBeNull();
      expect(parseUciBestMove('bestmove 0000')).toBeNull();
      expect(parseUciBestMove('bestmove z9a1')).toBeNull();
      expect(parseUciBestMove('info depth 5 score cp 10')).toBeNull();
    });
  });

  describe('parseUciMoveParts', () => {
    it('parses standard and promotion UCI strings', () => {
      expect(parseUciMoveParts('e2e4')).toEqual({ from: 'e2', to: 'e4' });
      expect(parseUciMoveParts('a7a8n')).toEqual({ from: 'a7', to: 'a8', promotion: 'n' });
    });

    it('rejects invalid squares, invalid promotions, and wrong lengths', () => {
      expect(parseUciMoveParts('e2e9')).toBeNull();
      expect(parseUciMoveParts('e7e8k')).toBeNull();
      expect(parseUciMoveParts('e2e')).toBeNull();
      expect(parseUciMoveParts('e2e4qq')).toBeNull();
    });
  });
});

describe('StockfishEngine serialized UCI scheduler', () => {
  it('completes uci -> uciok -> isready -> readyok handshake idempotently', async () => {
    const worker = new FakeUciWorker();
    const statuses: EngineStatus[] = [];
    const engine = new StockfishEngine({
      createWorker: () => worker,
    });
    engine.onStatusChange((s) => statuses.push(s));

    const p1 = engine.init();
    const p2 = engine.init();
    expect(worker.posted).toEqual(['uci']);

    worker.emit('uciok');
    expect(worker.posted).toEqual(['uci', 'isready']);

    worker.emit('readyok');
    await Promise.all([p1, p2]);

    expect(statuses).toEqual(['loading', 'ready']);
    engine.dispose();
    expect(worker.terminated).toBe(true);
  });

  it('drains stopped eval bestmove before starting AI search and normalizes eval scores', async () => {
    const worker = new FakeUciWorker();
    let now = 1000;
    const engine = new StockfishEngine({
      createWorker: () => worker,
      now: () => now,
    });

    const initPromise = engine.init();
    worker.emit('uciok');
    worker.emit('readyok');
    await initPromise;

    const evals: Evaluation[] = [];
    engine.startEvaluation(BLACK_TO_MOVE_FEN, (ev) => evals.push(ev));
    expect(worker.posted.slice(-3)).toEqual([
      'setoption name Skill Level value 20',
      `position fen ${BLACK_TO_MOVE_FEN}`,
      'go depth 18',
    ]);

    worker.emit('info depth 10 score cp 45 pv c7c5');
    expect(evals).toEqual([{ kind: 'cp', whiteCp: -45, depth: 10 }]);

    // Request AI move while eval is running -> must send stop and wait for bestmove before next go
    const aiPromise = engine.searchBestMove({
      fen: BLACK_TO_MOVE_FEN,
      skillLevel: 8,
      depthCap: 6,
      moveTimeMs: 350,
      minDelayMs: 0,
    });
    expect(worker.posted.at(-1)).toBe('stop');
    // Verify the AI position/go commands have NOT been sent before bestmove drains
    expect(worker.posted.filter((cmd) => cmd.startsWith('go '))).toHaveLength(1);

    // Late eval info after cancellation is ignored
    worker.emit('info depth 11 score cp 99 pv e7e5');
    expect(evals).toHaveLength(1);

    // Drain stopped eval's bestmove -> now AI job starts
    worker.emit('bestmove c7c5');
    expect(worker.posted.slice(-3)).toEqual([
      'setoption name Skill Level value 8',
      `position fen ${BLACK_TO_MOVE_FEN}`,
      'go depth 6 movetime 350',
    ]);

    now += 50;
    worker.emit('bestmove e7e5');
    await expect(aiPromise).resolves.toBe('e7e5');

    engine.dispose();
  });

  it('enforces minDelayMs floor and cancels delayed AI resolution on cancelAll', async () => {
    vi.useFakeTimers();
    try {
      const worker = new FakeUciWorker();
      let now = 500;
      const engine = new StockfishEngine({
        createWorker: () => worker,
        now: () => now,
      });

      const initPromise = engine.init();
      worker.emit('uciok');
      worker.emit('readyok');
      await initPromise;

      const movePromise = engine.searchBestMove({
        fen: WHITE_TO_MOVE_FEN,
        skillLevel: 0,
        depthCap: 2,
        moveTimeMs: 150,
        minDelayMs: 350,
      });

      now = 550;
      worker.emit('bestmove e2e4');

      // Cancelling during minDelayMs resolves null instead of emitting stale move
      engine.cancelAll();
      await vi.advanceTimersByTimeAsync(400);
      await expect(movePromise).resolves.toBeNull();

      engine.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
