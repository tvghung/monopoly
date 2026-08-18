import { presentationTiming } from '../../presentation/timings';
import type { CharacterReactionKind } from '../../presentation/store/types';

export type { CharacterReactionKind } from '../../presentation/store/types';

export interface CharacterReactionSample {
  offsetY: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  spriteOpacity: number;
  done: boolean;
}

export interface CharacterReactionState {
  kind: CharacterReactionKind;
  elapsedMs: number;
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
  kind: CharacterReactionKind,
  elapsedMs: number,
  reducedMotion = false,
): CharacterReactionSample {
  if (reducedMotion) return IDLE_REACTION;
  const duration = getCharacterReactionDuration(kind);
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
    default:
      return IDLE_REACTION;
  }
}

export class CharacterReactionController {
  private active: CharacterReactionState | null = null;

  public start(kind: CharacterReactionKind): void {
    this.active = { kind, elapsedMs: 0 };
  }

  public reset(): void {
    this.active = null;
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
    const sample = sampleCharacterReaction(this.active.kind, this.active.elapsedMs);
    if (sample.done) this.reset();
    return sample;
  }
}
