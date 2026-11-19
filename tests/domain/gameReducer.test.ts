import { describe, expect, it } from 'vitest';
import { INITIAL_FEN } from '../../src/domain/chessRules';
import type { SavedGameSnapshot } from '../../src/domain/contracts';
import { reduceGame } from '../../src/domain/gameReducer';
import {
  TIME_CONTROLS,
  type GameAction,
  type GameConfig,
  type GameState,
  type Preferences,
} from '../../src/domain/types';

const DEFAULT_REDUCER_PREFS: Pick<Preferences, 'autoFlipLocal' | 'evalBarVisible'> = {
  autoFlipLocal: false,
  evalBarVisible: true,
};

const BLITZ_3_2 = TIME_CONTROLS.find((tc) => tc.id === '3+2')!;
const UNLIMITED = TIME_CONTROLS.find((tc) => tc.id === 'unlimited')!;

function runActions(
  initial: GameState | null,
  steps: Array<{
    action: GameAction;
    nowMs?: number;
    prefs?: Pick<Preferences, 'autoFlipLocal' | 'evalBarVisible'>;
  }>
) {
  let state = initial;
  let lastEffects = [] as ReturnType<typeof reduceGame>['effects'];

  for (const step of steps) {
    const res = reduceGame(
      state,
      step.action,
      step.nowMs ?? 1_000,
      step.prefs ?? DEFAULT_REDUCER_PREFS
    );
    state = res.state;
    lastEffects = res.effects;
  }

  return { state, lastEffects };
}

describe('gameReducer', () => {
  it('starts a local game with White orientation, start sound, persistence, and initial eval', () => {
    const config: GameConfig = { mode: { kind: 'local' }, timeControl: BLITZ_3_2 };
    const { state, effects } = reduceGame(
      null,
      { type: 'START_GAME', config, gameId: 'game-1' },
      1_000,
      DEFAULT_REDUCER_PREFS
    );

    expect(state).not.toBeNull();
    expect(state?.orientation).toBe('w');
    expect(state?.aiThinking).toBe(false);
    expect(state?.clock).toEqual({
      bankMs: { w: 180_000, b: 180_000 },
      activeSinceMs: null,
    });
    expect(effects).toEqual([
      { type: 'ABORT_ENGINE' },
      { type: 'PLAY_SOUND', sound: 'game-start' },
      { type: 'PERSIST_SNAPSHOT' },
      { type: 'REQUEST_EVAL', fen: INITIAL_FEN },
    ]);
  });

  it('starts an AI game as Black with Black orientation and immediate AI move request', () => {
    const config: GameConfig = {
      mode: { kind: 'ai', humanColor: 'b', difficulty: 'expert' },
      timeControl: UNLIMITED,
    };
    const { state, effects } = reduceGame(
      null,
      { type: 'START_GAME', config, gameId: 'game-ai-b' },
      1_000,
      DEFAULT_REDUCER_PREFS
    );

    expect(state?.orientation).toBe('b');
    expect(state?.aiThinking).toBe(true);
    expect(effects).toContainEqual({
      type: 'REQUEST_AI_MOVE',
      fen: INITIAL_FEN,
      difficulty: 'expert',
      gameId: 'game-ai-b',
      expectedPly: 0,
    });
  });

  it('enforces turn ownership in AI mode (blocks human on AI turn and AI on human turn)', () => {
    const config: GameConfig = {
      mode: { kind: 'ai', humanColor: 'w', difficulty: 'club' },
      timeControl: BLITZ_3_2,
    };
    const started = reduceGame(
      null,
      { type: 'START_GAME', config, gameId: 'g1' },
      1_000,
      DEFAULT_REDUCER_PREFS
    ).state!;

    // AI cannot move on White's (human) turn
    const wrongAi = reduceGame(
      started,
      { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'ai' },
      2_000,
      DEFAULT_REDUCER_PREFS
    );
    expect(wrongAi.state?.moves).toHaveLength(0);
    expect(wrongAi.effects).toEqual([]);

    // Human plays 1. e4 -> triggers AI move
    const afterHuman = reduceGame(
      started,
      { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'human' },
      2_000,
      DEFAULT_REDUCER_PREFS
    );
    expect(afterHuman.state?.moves).toHaveLength(1);
    expect(afterHuman.state?.aiThinking).toBe(true);
    expect(afterHuman.effects).toContainEqual({
      type: 'REQUEST_AI_MOVE',
      fen: afterHuman.state!.moves[0]!.fenAfter,
      difficulty: 'club',
      gameId: 'g1',
      expectedPly: 1,
    });

    // Human cannot move while AI is to move
    const wrongHuman = reduceGame(
      afterHuman.state,
      { type: 'COMMIT_MOVE', from: 'e7', to: 'e5', source: 'human' },
      3_000,
      DEFAULT_REDUCER_PREFS
    );
    expect(wrongHuman.state?.moves).toHaveLength(1);
    expect(wrongHuman.effects).toEqual([]);
  });

  it('handles Undo in AI mode: pops 1 ply while AI is thinking, 2 plies on human turn, and blocks ply 1 when AI opened', () => {
    // Case A: Human is White
    const configW: GameConfig = {
      mode: { kind: 'ai', humanColor: 'w', difficulty: 'club' },
      timeControl: BLITZ_3_2,
    };
    const afterWhiteMove = runActions(null, [
      { action: { type: 'START_GAME', config: configW, gameId: 'ai-w' }, nowMs: 1_000 },
      { action: { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'human' }, nowMs: 2_000 },
    ]).state!;

    expect(afterWhiteMove.aiThinking).toBe(true);

    // Undo while AI is thinking -> aborts engine and pops 1 ply back to ply 0
    const undoMidThink = reduceGame(
      afterWhiteMove,
      { type: 'UNDO_MOVE' },
      2_500,
      DEFAULT_REDUCER_PREFS
    );
    expect(undoMidThink.state?.moves).toHaveLength(0);
    expect(undoMidThink.state?.aiThinking).toBe(false);
    expect(undoMidThink.state?.clock).toEqual({
      bankMs: { w: 180_000, b: 180_000 },
      activeSinceMs: null,
    });
    expect(undoMidThink.effects).toContainEqual({ type: 'ABORT_ENGINE' });
    expect(undoMidThink.effects).toContainEqual({ type: 'PERSIST_SNAPSHOT' });

    // After full turn pair (1. e4 e5 2. Nf3 Nc6), Undo pops 2 plies and restores ply-2 clock snapshot
    const afterFourPlies = runActions(null, [
      { action: { type: 'START_GAME', config: configW, gameId: 'ai-w2' }, nowMs: 1_000 },
      { action: { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'human' }, nowMs: 2_000 },
      { action: { type: 'COMMIT_MOVE', from: 'e7', to: 'e5', source: 'ai' }, nowMs: 5_000 },
      { action: { type: 'COMMIT_MOVE', from: 'g1', to: 'f3', source: 'human' }, nowMs: 10_000 },
      { action: { type: 'COMMIT_MOVE', from: 'b8', to: 'c6', source: 'ai' }, nowMs: 14_000 },
    ]).state!;

    const ply2Clock = afterFourPlies.moves[1]!.clockAfterMs;
    const undoPair = reduceGame(afterFourPlies, { type: 'UNDO_MOVE' }, 20_000, DEFAULT_REDUCER_PREFS);
    expect(undoPair.state?.moves).toHaveLength(2);
    expect(undoPair.state?.viewPly).toBe(2);
    expect(undoPair.state?.aiThinking).toBe(false);
    expect(undoPair.state?.clock).toEqual({
      bankMs: ply2Clock,
      activeSinceMs: 20_000,
    });

    // Case B: Human is Black and AI played opening ply 1 -> Undo must be disabled
    const configB: GameConfig = {
      mode: { kind: 'ai', humanColor: 'b', difficulty: 'club' },
      timeControl: BLITZ_3_2,
    };
    const afterAiOpening = runActions(null, [
      { action: { type: 'START_GAME', config: configB, gameId: 'ai-b' }, nowMs: 1_000 },
      { action: { type: 'COMMIT_MOVE', from: 'd2', to: 'd4', source: 'ai' }, nowMs: 2_000 },
    ]).state!;

    const blockedUndo = reduceGame(afterAiOpening, { type: 'UNDO_MOVE' }, 3_000, DEFAULT_REDUCER_PREFS);
    expect(blockedUndo.state?.moves).toHaveLength(1);
    expect(blockedUndo.effects).toEqual([]);
  });

  it('handles Undo in Local mode (pops 1 ply and auto-flips orientation back when enabled)', () => {
    const config: GameConfig = { mode: { kind: 'local' }, timeControl: BLITZ_3_2 };
    const autoFlipPrefs = { autoFlipLocal: true, evalBarVisible: false };

    const afterOneMove = runActions(null, [
      { action: { type: 'START_GAME', config, gameId: 'loc-1' }, nowMs: 1_000, prefs: autoFlipPrefs },
      { action: { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'human' }, nowMs: 2_000, prefs: autoFlipPrefs },
    ]).state!;

    expect(afterOneMove.orientation).toBe('b');

    const undone = reduceGame(afterOneMove, { type: 'UNDO_MOVE' }, 3_000, autoFlipPrefs);
    expect(undone.state?.moves).toHaveLength(0);
    expect(undone.state?.orientation).toBe('w');
    expect(undone.state?.clock.activeSinceMs).toBeNull();
    // evalBarVisible is false, so no REQUEST_EVAL emitted
    expect(undone.effects).toEqual([{ type: 'ABORT_ENGINE' }, { type: 'PERSIST_SNAPSHOT' }]);
  });

  it('enforces history scrubbing read-only invariant and clamps SET_VIEW_PLY', () => {
    const config: GameConfig = { mode: { kind: 'local' }, timeControl: UNLIMITED };
    const afterTwoMoves = runActions(null, [
      { action: { type: 'START_GAME', config, gameId: 'scrub-1' } },
      { action: { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'e7', to: 'e5', source: 'human' } },
    ]).state!;

    // Clamps below 0 and above moves.length
    const clampedLow = reduceGame(afterTwoMoves, { type: 'SET_VIEW_PLY', ply: -5 }, 1_000, DEFAULT_REDUCER_PREFS).state!;
    expect(clampedLow.viewPly).toBe(0);

    const clampedHigh = reduceGame(clampedLow, { type: 'SET_VIEW_PLY', ply: 99 }, 1_000, DEFAULT_REDUCER_PREFS).state!;
    expect(clampedHigh.viewPly).toBe(2);

    // While scrubbing at ply 1, committing a move and requesting a hint are ignored
    const scrubbed = reduceGame(afterTwoMoves, { type: 'SET_VIEW_PLY', ply: 1 }, 1_000, DEFAULT_REDUCER_PREFS).state!;
    const blockedMove = reduceGame(
      scrubbed,
      { type: 'COMMIT_MOVE', from: 'g1', to: 'f3', source: 'human' },
      2_000,
      DEFAULT_REDUCER_PREFS
    );
    expect(blockedMove.state?.moves).toHaveLength(2);
    expect(blockedMove.effects).toEqual([]);

    const blockedHint = reduceGame(scrubbed, { type: 'REQUEST_HINT' }, 2_000, DEFAULT_REDUCER_PREFS);
    expect(blockedHint.effects).toEqual([]);

    // In AI mode, an AI reply still commits cleanly while the human is viewing an earlier ply, without yanking viewPly
    const aiConfig: GameConfig = {
      mode: { kind: 'ai', humanColor: 'w', difficulty: 'club' },
      timeControl: UNLIMITED,
    };
    const waitingForAi = runActions(null, [
      { action: { type: 'START_GAME', config: aiConfig, gameId: 'scrub-ai' } },
      { action: { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'human' } },
      { action: { type: 'SET_VIEW_PLY', ply: 0 } },
    ]).state!;
    expect(waitingForAi.aiThinking).toBe(true);
    expect(waitingForAi.viewPly).toBe(0);

    const afterAiReply = reduceGame(
      waitingForAi,
      { type: 'COMMIT_MOVE', from: 'e7', to: 'e5', source: 'ai' },
      2_000,
      DEFAULT_REDUCER_PREFS
    ).state!;
    expect(afterAiReply.moves).toHaveLength(2);
    expect(afterAiReply.aiThinking).toBe(false);
    expect(afterAiReply.viewPly).toBe(0);
  });

  it('handles draw offers, same-side no-op, decline, acceptance, and ignores draw offers in AI mode', () => {
    const localConfig: GameConfig = { mode: { kind: 'local' }, timeControl: BLITZ_3_2 };
    const localStart = reduceGame(
      null,
      { type: 'START_GAME', config: localConfig, gameId: 'draw-1' },
      1_000,
      DEFAULT_REDUCER_PREFS
    ).state!;

    const offered = reduceGame(localStart, { type: 'OFFER_OR_ACCEPT_DRAW', color: 'w' }, 1_500, DEFAULT_REDUCER_PREFS).state!;
    expect(offered.drawOfferedBy).toBe('w');

    // Same side offering again is a no-op
    const duplicate = reduceGame(offered, { type: 'OFFER_OR_ACCEPT_DRAW', color: 'w' }, 1_600, DEFAULT_REDUCER_PREFS);
    expect(duplicate.state?.status).toEqual({ kind: 'playing' });
    expect(duplicate.state?.drawOfferedBy).toBe('w');

    // Decline clears offer
    const declined = reduceGame(offered, { type: 'DECLINE_DRAW' }, 1_700, DEFAULT_REDUCER_PREFS).state!;
    expect(declined.drawOfferedBy).toBeNull();

    // Offer then opposite side accepts -> mutual-draw
    const reoffered = reduceGame(declined, { type: 'OFFER_OR_ACCEPT_DRAW', color: 'b' }, 1_800, DEFAULT_REDUCER_PREFS).state!;
    const accepted = reduceGame(reoffered, { type: 'OFFER_OR_ACCEPT_DRAW', color: 'w' }, 1_900, DEFAULT_REDUCER_PREFS);
    expect(accepted.state?.status).toEqual({
      kind: 'ended',
      winner: 'draw',
      reason: 'mutual-draw',
    });
    expect(accepted.effects).toEqual([
      { type: 'ABORT_ENGINE' },
      { type: 'PLAY_SOUND', sound: 'game-end' },
      { type: 'CLEAR_SNAPSHOT' },
    ]);

    // AI mode rejects draw offers
    const aiConfig: GameConfig = {
      mode: { kind: 'ai', humanColor: 'w', difficulty: 'club' },
      timeControl: UNLIMITED,
    };
    const aiStart = reduceGame(
      null,
      { type: 'START_GAME', config: aiConfig, gameId: 'ai-draw' },
      1_000,
      DEFAULT_REDUCER_PREFS
    ).state!;
    const aiOffer = reduceGame(aiStart, { type: 'OFFER_OR_ACCEPT_DRAW', color: 'w' }, 2_000, DEFAULT_REDUCER_PREFS);
    expect(aiOffer.state?.drawOfferedBy).toBeNull();
  });

  it('rejects stale evaluations and hints when FEN does not match live position', () => {
    const config: GameConfig = { mode: { kind: 'local' }, timeControl: UNLIMITED };
    const afterE4 = runActions(null, [
      { action: { type: 'START_GAME', config, gameId: 'stale-1' } },
      { action: { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'human' } },
    ]).state!;

    const liveFen = afterE4.moves[0]!.fenAfter;

    // Stale eval for INITIAL_FEN is ignored
    const staleEval = reduceGame(
      afterE4,
      { type: 'ENGINE_EVAL_UPDATED', fen: INITIAL_FEN, evaluation: { kind: 'cp', whiteCp: 35, depth: 12 } },
      2_000,
      DEFAULT_REDUCER_PREFS
    ).state!;
    expect(staleEval.evaluation).toBeNull();

    // Matching eval is applied
    const freshEval = reduceGame(
      afterE4,
      { type: 'ENGINE_EVAL_UPDATED', fen: liveFen, evaluation: { kind: 'cp', whiteCp: 22, depth: 14 } },
      2_000,
      DEFAULT_REDUCER_PREFS
    ).state!;
    expect(freshEval.evaluation).toEqual({ kind: 'cp', whiteCp: 22, depth: 14 });

    // Stale hint is ignored; matching hint is applied and cleared on next move
    const staleHint = reduceGame(
      freshEval,
      { type: 'HINT_RECEIVED', fen: INITIAL_FEN, from: 'd2', to: 'd4', uci: 'd2d4' },
      2_000,
      DEFAULT_REDUCER_PREFS
    ).state!;
    expect(staleHint.activeHint).toBeNull();

    const freshHint = reduceGame(
      freshEval,
      { type: 'HINT_RECEIVED', fen: liveFen, from: 'e7', to: 'e5', uci: 'e7e5' },
      2_000,
      DEFAULT_REDUCER_PREFS
    ).state!;
    expect(freshHint.activeHint).toEqual({ from: 'e7', to: 'e5', uci: 'e7e5' });

    const afterReply = reduceGame(
      freshHint,
      { type: 'COMMIT_MOVE', from: 'c7', to: 'c5', source: 'human' },
      3_000,
      DEFAULT_REDUCER_PREFS
    ).state!;
    expect(afterReply.activeHint).toBeNull();
  });

  it('ends on timeout with insufficient material check and clears snapshot on checkmate/resign', () => {
    const config: GameConfig = { mode: { kind: 'local' }, timeControl: BLITZ_3_2 };

    // Checkmate (Fool's mate) emits game-end and clears snapshot
    const foolsMate = runActions(null, [
      { action: { type: 'START_GAME', config, gameId: 'mate-1' }, nowMs: 1_000 },
      { action: { type: 'COMMIT_MOVE', from: 'f2', to: 'f3', source: 'human' }, nowMs: 2_000 },
      { action: { type: 'COMMIT_MOVE', from: 'e7', to: 'e5', source: 'human' }, nowMs: 3_000 },
      { action: { type: 'COMMIT_MOVE', from: 'g2', to: 'g4', source: 'human' }, nowMs: 4_000 },
      { action: { type: 'COMMIT_MOVE', from: 'd8', to: 'h4', source: 'human' }, nowMs: 5_000 },
    ]);
    expect(foolsMate.state?.status).toEqual({
      kind: 'ended',
      winner: 'b',
      reason: 'checkmate',
    });
    expect(foolsMate.state?.clock.activeSinceMs).toBeNull();
    expect(foolsMate.lastEffects).toEqual([
      { type: 'ABORT_ENGINE' },
      { type: 'PLAY_SOUND', sound: 'game-end' },
      { type: 'CLEAR_SNAPSHOT' },
    ]);

    // Timeout with sufficient material -> opponent wins
    const midGame = runActions(null, [
      { action: { type: 'START_GAME', config, gameId: 'flag-1' }, nowMs: 1_000 },
      { action: { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'human' }, nowMs: 2_000 },
    ]).state!;
    const flagged = reduceGame(midGame, { type: 'TIME_EXPIRED', loser: 'b' }, 182_000, DEFAULT_REDUCER_PREFS);
    expect(flagged.state?.status).toEqual({
      kind: 'ended',
      winner: 'w',
      reason: 'timeout',
    });
    expect(flagged.state?.clock.bankMs.b).toBe(0);
    expect(flagged.effects).toContainEqual({ type: 'CLEAR_SNAPSHOT' });

    // Timeout when opponent has bare king (restored snapshot with K vs K+Q) -> timeout-insufficient-material
    const bareKingSnapshot: SavedGameSnapshot = {
      version: 1,
      savedAtIso: '2026-01-01T00:00:00.000Z',
      gameId: 'flag-insuff',
      config,
      moves: [
        {
          ply: 1,
          uci: 'e1e2',
          san: 'Ke2',
          from: 'e1',
          to: 'e2',
          color: 'w',
          fenAfter: '4k3/8/8/8/8/8/4K3/3q4 b - - 0 1',
          isCheck: false,
          isCastle: false,
          clockAfterMs: { w: 10_000, b: 10_000 },
        },
      ],
      orientation: 'w',
      status: { kind: 'playing' },
      clockBankMs: { w: 10_000, b: 10_000 },
    };
    const restored = reduceGame(
      null,
      { type: 'RESTORE_GAME', snapshot: bareKingSnapshot },
      5_000,
      DEFAULT_REDUCER_PREFS
    ).state!;
    expect(restored.clock.activeSinceMs).toBe(5_000);

    // Black (with queen) flags against White's bare king -> draw by timeout-insufficient-material
    const timedOutDraw = reduceGame(
      restored,
      { type: 'TIME_EXPIRED', loser: 'b' },
      15_000,
      DEFAULT_REDUCER_PREFS
    );
    expect(timedOutDraw.state?.status).toEqual({
      kind: 'ended',
      winner: 'draw',
      reason: 'timeout-insufficient-material',
    });

    // Resignation pauses clock and awards opponent win
    const resigned = reduceGame(midGame, { type: 'RESIGN', color: 'w' }, 5_000, DEFAULT_REDUCER_PREFS);
    expect(resigned.state?.status).toEqual({
      kind: 'ended',
      winner: 'b',
      reason: 'resignation',
    });
    expect(resigned.state?.clock.activeSinceMs).toBeNull();
  });

  it('handles sound priority (check > promote > castle > capture > move) and OPEN/CANCEL_PROMOTION', () => {
    const config: GameConfig = { mode: { kind: 'local' }, timeControl: UNLIMITED };
    // Play a quick game to test move, capture, castle, check sounds
    const started = reduceGame(
      null,
      { type: 'START_GAME', config, gameId: 'sfx-1' },
      1_000,
      DEFAULT_REDUCER_PREFS
    ).state!;

    const s1 = reduceGame(started, { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'human' }, 1_000, DEFAULT_REDUCER_PREFS);
    expect(s1.effects).toContainEqual({ type: 'PLAY_SOUND', sound: 'move' });

    const s2 = reduceGame(s1.state, { type: 'COMMIT_MOVE', from: 'd7', to: 'd5', source: 'human' }, 1_000, DEFAULT_REDUCER_PREFS);
    const s3 = reduceGame(s2.state, { type: 'COMMIT_MOVE', from: 'e4', to: 'd5', source: 'human' }, 1_000, DEFAULT_REDUCER_PREFS);
    expect(s3.effects).toContainEqual({ type: 'PLAY_SOUND', sound: 'capture' });

    // Non-promotion square does not open promotion picker
    const badPromo = reduceGame(s3.state, { type: 'OPEN_PROMOTION', from: 'd5', to: 'd6' }, 1_000, DEFAULT_REDUCER_PREFS);
    expect(badPromo.state?.pendingPromotion).toBeNull();

    // Castle sound
    const castleRun = runActions(null, [
      { action: { type: 'START_GAME', config, gameId: 'sfx-castle' } },
      { action: { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'e7', to: 'e5', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'g1', to: 'f3', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'b8', to: 'c6', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'f1', to: 'c4', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'g8', to: 'f6', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'e1', to: 'g1', source: 'human' } },
    ]);
    expect(castleRun.lastEffects).toContainEqual({ type: 'PLAY_SOUND', sound: 'castle' });

    // Check sound (Scholar's check: Qh5+ after f6? Use 1. e4 e5 2. Qh5 g6 3. Qxe5+ — capture AND check -> 'check')
    const checkCaptureRun = runActions(null, [
      { action: { type: 'START_GAME', config, gameId: 'sfx-check' } },
      { action: { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'e7', to: 'e5', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'd1', to: 'h5', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'g7', to: 'g6', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'h5', to: 'e5', source: 'human' } },
    ]);
    expect(checkCaptureRun.lastEffects).toContainEqual({ type: 'PLAY_SOUND', sound: 'check' });
  });

  it('commits promotion through OPEN_PROMOTION / CANCEL_PROMOTION and preserves engineStatus across START_GAME', () => {
    const config: GameConfig = { mode: { kind: 'local' }, timeControl: UNLIMITED };
    // Reach a legal promotion from INITIAL_FEN: 1. a4 b5 2. axb5 a6 3. bxa6 Nc6 4. a7 Nb8 -> 5. axb8=Q
    const beforePromo = runActions(null, [
      { action: { type: 'START_GAME', config, gameId: 'promo-1' } },
      { action: { type: 'ENGINE_STATUS_CHANGED', status: 'ready' } },
      { action: { type: 'COMMIT_MOVE', from: 'a2', to: 'a4', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'b7', to: 'b5', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'a4', to: 'b5', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'a7', to: 'a6', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'b5', to: 'a6', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'b8', to: 'c6', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'a6', to: 'a7', source: 'human' } },
      { action: { type: 'COMMIT_MOVE', from: 'c6', to: 'b8', source: 'human' } },
    ]).state!;

    const opened = reduceGame(
      beforePromo,
      { type: 'OPEN_PROMOTION', from: 'a7', to: 'b8' },
      1_000,
      DEFAULT_REDUCER_PREFS
    ).state!;
    expect(opened.pendingPromotion).toEqual({ from: 'a7', to: 'b8', color: 'w' });

    const cancelled = reduceGame(opened, { type: 'CANCEL_PROMOTION' }, 1_000, DEFAULT_REDUCER_PREFS).state!;
    expect(cancelled.pendingPromotion).toBeNull();

    // Commit promotion (capture + promote -> promote sound wins over capture)
    const promoted = reduceGame(
      opened,
      { type: 'COMMIT_MOVE', from: 'a7', to: 'b8', promotion: 'q', source: 'human' },
      1_000,
      DEFAULT_REDUCER_PREFS
    );
    expect(promoted.state?.pendingPromotion).toBeNull();
    expect(promoted.state?.moves.at(-1)?.promotion).toBe('q');
    expect(promoted.effects).toContainEqual({ type: 'PLAY_SOUND', sound: 'promote' });

    // Starting a new game preserves engineStatus === 'ready'
    const rematch = reduceGame(
      promoted.state,
      { type: 'START_GAME', config, gameId: 'promo-2' },
      2_000,
      DEFAULT_REDUCER_PREFS
    ).state!;
    expect(rematch.engineStatus).toBe('ready');
    expect(rematch.moves).toHaveLength(0);
  });

  it('triggers timeout inside COMMIT_MOVE when a timed move arrives after clock exhaustion', () => {
    const config: GameConfig = { mode: { kind: 'local' }, timeControl: BLITZ_3_2 };
    const afterPly1 = runActions(null, [
      { action: { type: 'START_GAME', config, gameId: 'late-move' }, nowMs: 1_000 },
      { action: { type: 'COMMIT_MOVE', from: 'e2', to: 'e4', source: 'human' }, nowMs: 2_000 },
    ]).state!;

    // Black submits move 185 seconds later (exceeds 180s bank) -> times out instead of committing
    const timedOut = reduceGame(
      afterPly1,
      { type: 'COMMIT_MOVE', from: 'e7', to: 'e5', source: 'human' },
      187_000,
      DEFAULT_REDUCER_PREFS
    );
    expect(timedOut.state?.moves).toHaveLength(1);
    expect(timedOut.state?.status).toEqual({
      kind: 'ended',
      winner: 'w',
      reason: 'timeout',
    });
    expect(timedOut.state?.clock).toEqual({
      bankMs: { w: 180_000, b: 0 },
      activeSinceMs: null,
    });
    expect(timedOut.effects).toEqual([
      { type: 'ABORT_ENGINE' },
      { type: 'PLAY_SOUND', sound: 'game-end' },
      { type: 'CLEAR_SNAPSHOT' },
    ]);
  });
});
