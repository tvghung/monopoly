import { presentationTiming } from '../../presentation/timings';
import type { CharacterReactionKind } from '../../presentation/store/types';
import { getAnimationElapsedMs } from '../animationTime';

export type { CharacterReactionKind } from '../../presentation/store/types';

/**
 * A reaction this client plays on its own, outside the presentation pipeline: 'poke' is the hop a mascot standee gives when the
 * player points at it or clicks it. It never comes from game state, so it is not part of the presentation store types.
 */
export type CharacterLocalReactionKind = 'poke';
export type AnyCharacterReactionKind = CharacterReactionKind | CharacterLocalReactionKind;
export const CHARACTER_POKE_DURATION_MS = 560;

export interface CharacterReactionSample {
  offsetY: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  spriteOpacity: number;
  done: boolean;
}

export interface CharacterReactionState {
  kind: AnyCharacterReactionKind;
  elapsedMs: number;
  durationMs: number;
}

const IDLE_REACTION: CharacterReactionSample = {
  offsetY: 0,
  rotationZ: 0,
  scaleX: 1,
  scaleY: 1,
  spriteOpacity: 1,
  done: true,
};

export function getCharacterReactionDuration(kind: CharacterReactionKind): number {
  return presentationTiming.characterReaction[kind];
}

export function sampleCharacterReaction(
  kind: AnyCharacterReactionKind,
  elapsedMs: number,
  reducedMotion = false,
  durationMs = kind === 'poke' ? CHARACTER_POKE_DURATION_MS : getCharacterReactionDuration(kind),
): CharacterReactionSample {
  if (reducedMotion) return IDLE_REACTION;
  const duration = Math.max(0, durationMs);
  if (duration === 0) return { ...IDLE_REACTION };
  const progress = Math.min(1, Math.max(0, elapsedMs / duration));
  const wave = Math.sin(progress * Math.PI);
  const settle = Math.sin(progress * Math.PI * 2);

  switch (kind) {
    case 'happy':
      return {
        offsetY: wave * 0.06,
        rotationZ: settle * 0.025,
        scaleX: 1 - wave * 0.025,
        scaleY: 1 + wave * 0.05,
        spriteOpacity: 1,
        done: progress >= 1,
      };
    case 'sad':
      return {
        offsetY: -wave * 0.025,
        rotationZ: -wave * 0.05,
        scaleX: 1 + wave * 0.025,
        scaleY: 1 - wave * 0.035,
        spriteOpacity: 1,
        done: progress >= 1,
      };
    case 'jail':
      return {
        offsetY: wave * 0.035,
        rotationZ: settle * 0.07,
        scaleX: 1,
        scaleY: 1 + wave * 0.025,
        spriteOpacity: 1,
        done: progress >= 1,
      };
    case 'bankrupt':
      return {
        offsetY: wave * 0.025,
        rotationZ: -settle * 0.1,
        scaleX: 1 + wave * 0.035,
        scaleY: 1 - wave * 0.05,
        spriteOpacity: 1 - wave * 0.12,
        done: progress >= 1,
      };
    case 'emote':
      return {
        offsetY: wave * 0.045,
        rotationZ: settle * 0.045,
        scaleX: 1 + wave * 0.02,
        scaleY: 1 + wave * 0.02,
        spriteOpacity: 1,
        done: progress >= 1,
      };
    case 'poke': {
      // A small jump with a squash before and after it and a wiggle at the top; the card lands where it took off.
      const hop = Math.max(0, Math.sin(Math.min(1, Math.max(0, (progress - 0.12) / 0.76)) * Math.PI));
      const squash = progress < 0.12
        ? Math.sin((progress / 0.12) * Math.PI)
        : progress > 0.88 ? Math.sin(((progress - 0.88) / 0.12) * Math.PI) : 0;
      return {
        offsetY: hop * 0.22,
        rotationZ: Math.sin(progress * Math.PI * 3) * 0.09 * hop,
        scaleX: 1 + squash * 0.1 - hop * 0.04,
        scaleY: 1 - squash * 0.12 + hop * 0.06,
        spriteOpacity: 1,
        done: progress >= 1,
      };
    }
    default:
      return IDLE_REACTION;
  }
}

export class CharacterReactionController {
  private active: CharacterReactionState | null = null;
  private startedAtMs = 0;

  public start(
    kind: AnyCharacterReactionKind,
    durationMs = kind === 'poke' ? CHARACTER_POKE_DURATION_MS : getCharacterReactionDuration(kind),
    startedAtMs = performance.now(),
  ): void {
    this.startedAtMs = startedAtMs;
    this.active = { kind, elapsedMs: 0, durationMs: Math.max(0, durationMs) };
  }

  public reset(): void {
    this.active = null;
    this.startedAtMs = 0;
  }

  public getState(): CharacterReactionState | null {
    return this.active ? { ...this.active } : null;
  }

  public advance(deltaMs: number, reducedMotion = false): CharacterReactionSample {
    if (!this.active) return IDLE_REACTION;
    if (reducedMotion) {
      this.reset();
      return IDLE_REACTION;
    }
    this.active.elapsedMs += Math.max(0, deltaMs);
    const sample = sampleCharacterReaction(this.active.kind, this.active.elapsedMs, false, this.active.durationMs);
    if (sample.done) this.reset();
    return sample;
  }

  public advanceAt(nowMs: number, reducedMotion = false): CharacterReactionSample {
    if (!this.active) return IDLE_REACTION;
    if (reducedMotion) {
      this.reset();
      return IDLE_REACTION;
    }
    this.active.elapsedMs = getAnimationElapsedMs(this.startedAtMs, nowMs);
    const sample = sampleCharacterReaction(this.active.kind, this.active.elapsedMs, false, this.active.durationMs);
    if (sample.done) this.reset();
    return sample;
  }
}
