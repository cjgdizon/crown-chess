import type { SoundPlayer } from '../domain/contracts';
import type { SoundKind } from '../domain/types';

function isAudioContextCtor(value: unknown): value is new () => AudioContext {
  return typeof value === 'function';
}

function resolveAudioContextCtor(): (new () => AudioContext) | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  if (typeof globalThis.AudioContext === 'function') {
    return globalThis.AudioContext;
  }
  if ('webkitAudioContext' in globalThis) {
    const candidate: unknown = Reflect.get(globalThis, 'webkitAudioContext');
    if (isAudioContextCtor(candidate)) {
      return candidate;
    }
  }
  return null;
}

export class WebAudioSoundPlayer implements SoundPlayer {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  play(sound: SoundKind): void {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    try {
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      switch (sound) {
        case 'move':
          this.playWoodTap(ctx, now, 250, 115, 0.12, 0.055);
          break;
        case 'capture':
          this.playWoodTap(ctx, now, 195, 78, 0.16, 0.075);
          this.playNoiseBurst(ctx, now, 950, 1.4, 0.13, 0.055);
          break;
        case 'castle':
          this.playWoodTap(ctx, now, 240, 110, 0.11, 0.05);
          this.playWoodTap(ctx, now + 0.085, 290, 130, 0.11, 0.05);
          break;
        case 'check':
          this.playTone(ctx, now, 'triangle', 660, 0.09, 0.09);
          this.playTone(ctx, now + 0.075, 'triangle', 880, 0.1, 0.13);
          break;
        case 'promote':
          this.playTone(ctx, now, 'sine', 523.25, 0.09, 0.11);
          this.playTone(ctx, now + 0.06, 'sine', 659.25, 0.09, 0.11);
          this.playTone(ctx, now + 0.12, 'sine', 783.99, 0.1, 0.16);
          break;
        case 'game-start':
          this.playTone(ctx, now, 'sine', 392.0, 0.08, 0.14);
          this.playTone(ctx, now + 0.09, 'sine', 523.25, 0.09, 0.18);
          break;
        case 'game-end':
          this.playTone(ctx, now, 'sine', 523.25, 0.07, 0.34);
          this.playTone(ctx, now, 'sine', 392.0, 0.06, 0.34);
          this.playTone(ctx, now + 0.04, 'triangle', 329.63, 0.05, 0.36);
          break;
        default: {
          const _exhaustive: never = sound;
          return _exhaustive;
        }
      }
    } catch {
      // Audio playback is best-effort and must never throw into game logic.
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      return this.ctx;
    }
    const Ctor = resolveAudioContextCtor();
    if (!Ctor) {
      return null;
    }
    try {
      this.ctx = new Ctor();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private playWoodTap(
    ctx: AudioContext,
    startTime: number,
    startFreq: number,
    endFreq: number,
    peakGain: number,
    durationSec: number
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + durationSec);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(820, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + durationSec + 0.01);
  }

  private playNoiseBurst(
    ctx: AudioContext,
    startTime: number,
    centerFreq: number,
    q: number,
    peakGain: number,
    durationSec: number
  ): void {
    const buffer = this.ensureNoiseBuffer(ctx);
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centerFreq, startTime);
    filter.Q.setValueAtTime(q, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(startTime);
    source.stop(startTime + durationSec + 0.01);
  }

  private playTone(
    ctx: AudioContext,
    startTime: number,
    type: OscillatorType,
    freq: number,
    peakGain: number,
    durationSec: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + durationSec + 0.01);
  }

  private ensureNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const frameCount = Math.max(1, Math.floor(ctx.sampleRate * 0.1));
    const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      channel[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }
}
