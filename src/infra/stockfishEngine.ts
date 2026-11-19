import type { ChessEngine } from '../domain/contracts';
import type { Color, EngineStatus, Evaluation, Square } from '../domain/types';
import {
  getFenActiveColor,
  parseUciBestMove,
  parseUciInfoScore,
  parseUciMoveParts,
} from './uciParser';

export const DEFAULT_STOCKFISH_WORKER_URL = '/stockfish/stockfish-17.1-lite-single-03e3232.js';

export interface UciWorkerLike {
  postMessage(message: string): void;
  terminate(): void;
  setHandlers(onMessage: ((data: unknown) => void) | null, onError: (() => void) | null): void;
}

export interface StockfishEngineOptions {
  workerUrl?: string;
  createWorker?: (url: string) => UciWorkerLike;
  now?: () => number;
}

type HandshakePhase = 'none' | 'await-uciok' | 'await-readyok' | 'ready';

interface AiMoveJob {
  kind: 'ai-move';
  fen: string;
  activeColor: Color;
  skillLevel: number;
  depthCap: number;
  moveTimeMs: number;
  minDelayMs: number;
  startedAtMs: number;
  cancelled: boolean;
  settled: boolean;
  resolve: (uci: string | null) => void;
}

interface HintJob {
  kind: 'hint';
  fen: string;
  activeColor: Color;
  cancelled: boolean;
  settled: boolean;
  resolve: (hint: { from: Square; to: Square; uci: string } | null) => void;
}

interface EvalJob {
  kind: 'eval';
  fen: string;
  activeColor: Color;
  cancelled: boolean;
  onUpdate: (ev: Evaluation) => void;
}

type EngineJob = AiMoveJob | HintJob | EvalJob;

interface DelayedAiResolution {
  job: AiMoveJob;
  timer: ReturnType<typeof setTimeout>;
}

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function defaultCreateWorker(url: string): UciWorkerLike {
  // Classic worker (NOT { type: 'module' }) so Stockfish 17.1 Lite Single JS
  // auto-loads its sibling .wasm via location.pathname.replace(/\.js$/i, '.wasm').
  const worker = new Worker(url);
  return {
    postMessage(message: string): void {
      worker.postMessage(message);
    },
    terminate(): void {
      worker.terminate();
    },
    setHandlers(onMessage, onError): void {
      worker.onmessage = onMessage ? (event) => onMessage(event.data) : null;
      worker.onerror = onError ? () => onError() : null;
    },
  };
}

function clampSkillLevel(skillLevel: number): number {
  return Math.max(0, Math.min(20, Math.round(skillLevel)));
}

function settleJobCancelled(job: EngineJob): void {
  job.cancelled = true;
  if (job.kind === 'ai-move' && !job.settled) {
    job.settled = true;
    job.resolve(null);
  } else if (job.kind === 'hint' && !job.settled) {
    job.settled = true;
    job.resolve(null);
  }
}

export class StockfishEngine implements ChessEngine {
  private readonly workerUrl: string;
  private readonly createWorker: (url: string) => UciWorkerLike;
  private readonly now: () => number;

  private worker: UciWorkerLike | null = null;
  private status: EngineStatus = 'idle';
  private handshakePhase: HandshakePhase = 'none';
  private initPromise: Promise<void> | null = null;
  private resolveInit: (() => void) | null = null;
  private disposed = false;

  private activeJob: EngineJob | null = null;
  private stoppingActiveJob = false;
  private queuedJob: EngineJob | null = null;
  private delayedAi: DelayedAiResolution | null = null;

  private readonly statusListeners = new Set<(status: EngineStatus) => void>();

  constructor(options: StockfishEngineOptions = {}) {
    this.workerUrl = options.workerUrl ?? DEFAULT_STOCKFISH_WORKER_URL;
    this.createWorker = options.createWorker ?? defaultCreateWorker;
    this.now = options.now ?? defaultNow;
  }

  onStatusChange(cb: (status: EngineStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  init(): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }
    if (this.status === 'ready') {
      return Promise.resolve();
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.setStatus('loading');
    this.handshakePhase = 'await-uciok';

    this.initPromise = new Promise<void>((resolve) => {
      this.resolveInit = resolve;

      let worker: UciWorkerLike;
      try {
        worker = this.createWorker(this.workerUrl);
      } catch {
        this.failEngine();
        return;
      }

      this.worker = worker;
      worker.setHandlers(
        (data) => {
          this.handleWorkerMessage(data);
        },
        () => {
          this.failEngine();
        }
      );

      try {
        worker.postMessage('uci');
      } catch {
        this.failEngine();
      }
    });

    return this.initPromise;
  }

  searchBestMove(req: {
    fen: string;
    skillLevel: number;
    depthCap: number;
    moveTimeMs: number;
    minDelayMs: number;
  }): Promise<string | null> {
    if (this.disposed || this.status === 'error') {
      return Promise.resolve(null);
    }

    return new Promise<string | null>((resolve) => {
      const job: AiMoveJob = {
        kind: 'ai-move',
        fen: req.fen,
        activeColor: getFenActiveColor(req.fen),
        skillLevel: clampSkillLevel(req.skillLevel),
        depthCap: Math.max(1, Math.round(req.depthCap)),
        moveTimeMs: Math.max(1, Math.round(req.moveTimeMs)),
        minDelayMs: Math.max(0, Math.round(req.minDelayMs)),
        startedAtMs: 0,
        cancelled: false,
        settled: false,
        resolve,
      };
      this.enqueueJob(job);
    });
  }

  searchHint(fen: string): Promise<{ from: Square; to: Square; uci: string } | null> {
    if (this.disposed || this.status === 'error') {
      return Promise.resolve(null);
    }

    return new Promise<{ from: Square; to: Square; uci: string } | null>((resolve) => {
      const job: HintJob = {
        kind: 'hint',
        fen,
        activeColor: getFenActiveColor(fen),
        cancelled: false,
        settled: false,
        resolve,
      };
      this.enqueueJob(job);
    });
  }

  startEvaluation(fen: string, onUpdate: (ev: Evaluation) => void): void {
    if (this.disposed || this.status === 'error') {
      return;
    }

    const job: EvalJob = {
      kind: 'eval',
      fen,
      activeColor: getFenActiveColor(fen),
      cancelled: false,
      onUpdate,
    };
    this.enqueueJob(job);
  }

  cancelAll(): void {
    this.cancelDelayedAi();

    if (this.queuedJob) {
      settleJobCancelled(this.queuedJob);
      this.queuedJob = null;
    }

    if (this.activeJob) {
      settleJobCancelled(this.activeJob);
      if (!this.stoppingActiveJob && this.status === 'ready' && this.worker) {
        this.stoppingActiveJob = true;
        this.post('stop');
      }
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.cancelDelayedAi();

    if (this.queuedJob) {
      settleJobCancelled(this.queuedJob);
      this.queuedJob = null;
    }
    if (this.activeJob) {
      settleJobCancelled(this.activeJob);
      this.activeJob = null;
    }
    this.stoppingActiveJob = false;

    if (this.worker) {
      this.worker.setHandlers(null, null);
      try {
        this.worker.terminate();
      } catch {
        // Ignore termination failures on already-closed workers.
      }
      this.worker = null;
    }

    this.completeInitPromise();
    this.statusListeners.clear();
  }

  private setStatus(next: EngineStatus): void {
    if (this.status === next) {
      return;
    }
    this.status = next;
    for (const listener of this.statusListeners) {
      listener(next);
    }
  }

  private completeInitPromise(): void {
    const resolve = this.resolveInit;
    this.resolveInit = null;
    if (resolve) {
      resolve();
    }
  }

  private failEngine(): void {
    this.cancelDelayedAi();

    if (this.queuedJob) {
      settleJobCancelled(this.queuedJob);
      this.queuedJob = null;
    }
    if (this.activeJob) {
      settleJobCancelled(this.activeJob);
      this.activeJob = null;
    }
    this.stoppingActiveJob = false;
    this.handshakePhase = 'none';

    if (this.worker) {
      this.worker.setHandlers(null, null);
      try {
        this.worker.terminate();
      } catch {
        // Ignore termination errors.
      }
      this.worker = null;
    }

    this.initPromise = null;
    this.setStatus('error');
    this.completeInitPromise();
  }

  private cancelDelayedAi(): void {
    if (!this.delayedAi) {
      return;
    }
    clearTimeout(this.delayedAi.timer);
    settleJobCancelled(this.delayedAi.job);
    this.delayedAi = null;
  }

  private post(command: string): void {
    if (!this.worker || this.disposed) {
      return;
    }
    try {
      this.worker.postMessage(command);
    } catch {
      this.failEngine();
    }
  }

  private enqueueJob(job: EngineJob): void {
    this.cancelDelayedAi();

    if (this.queuedJob) {
      settleJobCancelled(this.queuedJob);
    }
    this.queuedJob = job;

    if (this.status === 'idle') {
      void this.init();
      return;
    }

    if (this.status === 'loading') {
      return;
    }

    if (this.status !== 'ready') {
      settleJobCancelled(job);
      this.queuedJob = null;
      return;
    }

    if (this.activeJob !== null) {
      settleJobCancelled(this.activeJob);
      if (!this.stoppingActiveJob) {
        this.stoppingActiveJob = true;
        this.post('stop');
      }
      return;
    }

    this.startQueuedJob();
  }

  private startQueuedJob(): void {
    if (
      this.disposed ||
      this.status !== 'ready' ||
      !this.worker ||
      this.activeJob !== null ||
      !this.queuedJob
    ) {
      return;
    }

    const job = this.queuedJob;
    this.queuedJob = null;
    this.activeJob = job;
    this.stoppingActiveJob = false;

    switch (job.kind) {
      case 'ai-move': {
        job.startedAtMs = this.now();
        this.post(`setoption name Skill Level value ${job.skillLevel}`);
        this.post(`position fen ${job.fen}`);
        this.post(`go depth ${job.depthCap} movetime ${job.moveTimeMs}`);
        break;
      }
      case 'hint': {
        this.post('setoption name Skill Level value 20');
        this.post(`position fen ${job.fen}`);
        this.post('go depth 14 movetime 600');
        break;
      }
      case 'eval': {
        this.post('setoption name Skill Level value 20');
        this.post(`position fen ${job.fen}`);
        this.post('go depth 18');
        break;
      }
      default: {
        const _exhaustive: never = job;
        return _exhaustive;
      }
    }
  }

  private handleWorkerMessage(data: unknown): void {
    if (this.disposed || typeof data !== 'string') {
      return;
    }

    const lines = data.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }
      this.handleUciLine(line);
    }
  }

  private handleUciLine(line: string): void {
    if (this.handshakePhase === 'await-uciok') {
      if (line === 'uciok') {
        this.handshakePhase = 'await-readyok';
        this.post('isready');
      }
      return;
    }

    if (this.handshakePhase === 'await-readyok') {
      if (line === 'readyok') {
        this.handshakePhase = 'ready';
        this.setStatus('ready');
        this.completeInitPromise();
        this.startQueuedJob();
      }
      return;
    }

    if (this.handshakePhase !== 'ready') {
      return;
    }

    if (line.startsWith('info ')) {
      if (this.activeJob && this.activeJob.kind === 'eval' && !this.activeJob.cancelled) {
        const evaluation = parseUciInfoScore(line, this.activeJob.activeColor);
        if (evaluation) {
          this.activeJob.onUpdate(evaluation);
        }
      }
      return;
    }

    if (line.startsWith('bestmove ')) {
      const finished = this.activeJob;
      this.activeJob = null;
      this.stoppingActiveJob = false;

      if (finished && !finished.cancelled) {
        this.finishActiveJob(finished, parseUciBestMove(line));
      }

      if (this.queuedJob !== null) {
        this.startQueuedJob();
      }
    }
  }

  private finishActiveJob(job: EngineJob, bestMove: string | null): void {
    switch (job.kind) {
      case 'ai-move': {
        const elapsed = Math.max(0, this.now() - job.startedAtMs);
        const remainingDelay = Math.max(0, job.minDelayMs - elapsed);
        if (remainingDelay > 0) {
          const timer = setTimeout(() => {
            if (this.delayedAi?.timer === timer) {
              this.delayedAi = null;
            }
            if (!job.cancelled && !job.settled && !this.disposed) {
              job.settled = true;
              job.resolve(bestMove);
            }
          }, remainingDelay);
          this.delayedAi = { job, timer };
        } else if (!job.settled) {
          job.settled = true;
          job.resolve(bestMove);
        }
        break;
      }
      case 'hint': {
        if (job.settled) {
          break;
        }
        job.settled = true;
        if (!bestMove) {
          job.resolve(null);
          break;
        }
        const parts = parseUciMoveParts(bestMove);
        job.resolve(parts ? { from: parts.from, to: parts.to, uci: bestMove } : null);
        break;
      }
      case 'eval': {
        // Depth reached naturally; nothing to resolve.
        break;
      }
      default: {
        const _exhaustive: never = job;
        return _exhaustive;
      }
    }
  }
}
