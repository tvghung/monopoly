import { afterEach, describe, expect, it, vi } from 'vitest';
import { tileState, type PublicGameState } from '@monopoly/shared';
import { makeRoom } from '../game/presentation/testFixtures';
import {
  AudioEngine,
  calculateMusicIntensityScore,
  createProceduralMusicStems,
  deriveMusicIntensity,
  MUSIC_BARS,
  MUSIC_BEATS,
  MUSIC_LOOP_DURATION_SECONDS,
  MUSIC_MAIN_MELODY_PHRASES,
  MUSIC_STEM_IDS,
  MUSIC_TRACK_METADATA,
} from './AudioEngine';

class FakeAudioParam {
  public value = 1;
  public readonly events: Array<{ type: string; value: number; time: number }> = [];

  public cancelScheduledValues(time: number): AudioParam {
    this.events.push({ type: 'cancel', value: this.value, time });
    return this as unknown as AudioParam;
  }

  public cancelAndHoldAtTime(time: number): AudioParam {
    this.events.push({ type: 'hold', value: this.value, time });
    return this as unknown as AudioParam;
  }

  public setValueAtTime(value: number, time: number): AudioParam {
    this.value = value;
    this.events.push({ type: 'set', value, time });
    return this as unknown as AudioParam;
  }

  public exponentialRampToValueAtTime(value: number, time: number): AudioParam {
    this.value = value;
    this.events.push({ type: 'exponential', value, time });
    return this as unknown as AudioParam;
  }

  public linearRampToValueAtTime(value: number, time: number): AudioParam {
    this.value = value;
    this.events.push({ type: 'linear', value, time });
    return this as unknown as AudioParam;
  }
}

class FakeNode {
  public disconnectCount = 0;

  public connect(destination: AudioNode): AudioNode {
    return destination;
  }

  public disconnect(): void {
    this.disconnectCount += 1;
  }
}

class FakeGainNode extends FakeNode {
  public readonly gainValue = new FakeAudioParam();
}

class FakeSourceNode extends FakeNode {
  public onended: ((this: AudioScheduledSourceNode, event: Event) => unknown) | null = null;
  public readonly starts: number[] = [];
  public readonly stops: Array<number | undefined> = [];

  public constructor(private readonly recordStart?: () => void) {
    super();
  }

  public start(when = 0): void {
    this.recordStart?.();
    this.starts.push(when);
  }

  public stop(when?: number): void {
    this.stops.push(when);
  }

  public end(): void {
    this.onended?.call(this as unknown as AudioScheduledSourceNode, new Event('ended'));
  }
}

class FakeOscillatorNode extends FakeSourceNode {
  public type: OscillatorType = 'sine';
  public readonly frequencyValue = new FakeAudioParam();
}

class FakeBufferSourceNode extends FakeSourceNode {
  public buffer: AudioBuffer | null = null;
  public loop = false;
  public loopStart = 0;
  public loopEnd = 0;
}

class FakeAudioBuffer {
  private readonly data: Float32Array[];
  public readonly duration: number;

  public constructor(channels: number, length: number, sampleRate: number) {
    this.data = Array.from({ length: channels }, () => new Float32Array(length));
    this.duration = length / sampleRate;
  }

  public getChannelData(channel: number): Float32Array {
    const data = this.data[channel];
    if (!data) throw new RangeError('Missing fake audio channel');
    return data;
  }
}

class FakeAudioContext {
  public state: AudioContextState | 'interrupted';
  public currentTime = 0;
  public readonly sampleRate = 400;
  public readonly destination = new FakeNode();
  public readonly gains: FakeGainNode[] = [];
  public readonly oscillators: FakeOscillatorNode[] = [];
  public readonly bufferSources: FakeBufferSourceNode[] = [];
  public readonly operations: string[] = [];
  public resumeCount = 0;
  public closeCount = 0;
  public resumeImplementation?: () => Promise<void>;

  public constructor(state: AudioContextState = 'suspended') {
    this.state = state;
  }

  public createGain(): GainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return Object.assign(node, { gain: node.gainValue }) as unknown as GainNode;
  }

  public createOscillator(): OscillatorNode {
    const node = new FakeOscillatorNode(() => this.operations.push('oscillator-start'));
    this.oscillators.push(node);
    return Object.assign(node, { frequency: node.frequencyValue }) as unknown as OscillatorNode;
  }

  public createBufferSource(): AudioBufferSourceNode {
    const node = new FakeBufferSourceNode(() => this.operations.push('buffer-source-start'));
    this.bufferSources.push(node);
    return node as unknown as AudioBufferSourceNode;
  }

  public createBuffer(channels: number, length: number, sampleRate = this.sampleRate): AudioBuffer {
    this.operations.push('buffer-create');
    return new FakeAudioBuffer(channels, length, sampleRate) as unknown as AudioBuffer;
  }

  public resume(): Promise<void> {
    this.resumeCount += 1;
    if (this.resumeImplementation) return this.resumeImplementation();
    this.state = 'running';
    return Promise.resolve();
  }

  public close(): Promise<void> {
    this.closeCount += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
}

function makeEngine(context: FakeAudioContext): AudioEngine {
  return new AudioEngine({ contextFactory: () => context as unknown as AudioContext });
}

function developBoard(state: PublicGameState, count: number, level: number): void {
  state.boardState.ownedProps = Object.fromEntries(
    tileState
      .map((tile, tileID) => ({ tile, tileID }))
      .filter(({ tile }) => tile.price !== undefined)
      .slice(0, count)
      .map(({ tile, tileID }) => [
        tileID,
        { id: 'player-a', color: 'red' as const, houses: tile.rentTiers ? level : 0 },
      ]),
  );
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AudioEngine', () => {
  it('applies live Master, SFX, and Music gains and preserves exact zero mute', async () => {
    const context = new FakeAudioContext();
    const engine = makeEngine(context);
    engine.setMix({ masterGain: 0.6, sfxGain: 0.4, musicGain: 0.2 });

    engine.handleUserInteraction();
    await flushPromises();

    expect(context.gains.slice(0, 3).map(node => node.gainValue.value)).toEqual([0.6, 0.4, 0.2]);

    engine.setMix({ masterGain: 0, sfxGain: 0, musicGain: 0.5 });
    expect(context.gains.slice(0, 3).map(node => node.gainValue.value)).toEqual([0, 0, 0.5]);

    engine.setMix({ masterGain: 1, sfxGain: 0.4, musicGain: 0 });
    expect(context.gains.slice(0, 3).map(node => node.gainValue.value)).toEqual([1, 0.4, 0]);
  });

  it('is a graceful no-op when Web Audio is unsupported', () => {
    const factory = vi.fn(() => null);
    const engine = new AudioEngine({ contextFactory: factory });

    expect(() => engine.play('dice.impact')).not.toThrow();
    expect(factory).not.toHaveBeenCalled();
    expect(() => engine.handleUserInteraction('ui.click')).not.toThrow();
    expect(factory).toHaveBeenCalledOnce();
  });

  it('unlocks only on interaction and never replays a pre-unlock gameplay cue', async () => {
    const context = new FakeAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const engine = new AudioEngine({ contextFactory: factory });

    engine.play('money.receive');
    expect(factory).not.toHaveBeenCalled();

    engine.handleUserInteraction();
    await flushPromises();
    expect(context.resumeCount).toBe(1);
    expect(context.oscillators).toHaveLength(0);

    engine.handleUserInteraction('ui.click');
    expect(context.oscillators).toHaveLength(1);
  });

  it('drops ordinary playback while suspended but may play the current unlock cue', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.handleUserInteraction();
    context.state = 'suspended';

    engine.play('dice.impact');
    expect(context.oscillators).toHaveLength(0);
    expect(context.bufferSources).toHaveLength(0);

    engine.handleUserInteraction('ui.click');
    await flushPromises();
    expect(context.resumeCount).toBe(1);
    expect(context.oscillators).toHaveLength(1);
  });

  it('resumes one suspended context and starts the pending cue before music initialization', async () => {
    const context = new FakeAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const engine = new AudioEngine({ contextFactory: factory });
    engine.setRoomActive(true);

    engine.handleUserInteraction('ui.click');
    await flushPromises();

    expect(factory).toHaveBeenCalledOnce();
    expect(context.resumeCount).toBe(1);
    expect(context.state).toBe('running');
    expect(context.oscillators).toHaveLength(1);
    expect(context.bufferSources.filter(source => source.loop)).toHaveLength(MUSIC_STEM_IDS.length);
    expect(context.operations.indexOf('oscillator-start'))
      .toBeLessThan(context.operations.indexOf('buffer-create'));
  });

  it('starts one deterministic music loop only after unlock and keeps it through repeated room updates', async () => {
    const context = new FakeAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const engine = new AudioEngine({ contextFactory: factory });

    engine.setRoomActive(true);
    expect(factory).not.toHaveBeenCalled();
    expect(context.bufferSources).toHaveLength(0);

    engine.handleUserInteraction();
    await flushPromises();

    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
    expect(context.bufferSources.every(source => source.loop)).toBe(true);
    expect(context.bufferSources.every(source => (
      Math.abs(source.loopEnd - MUSIC_LOOP_DURATION_SECONDS) < 0.01
    ))).toBe(true);
    expect(new Set(context.bufferSources.flatMap(source => source.starts))).toEqual(new Set([0.02]));
    expect(context.oscillators).toHaveLength(0);

    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
  });

  it('starts music when the room becomes active after an earlier unlock', async () => {
    const context = new FakeAudioContext();
    const engine = makeEngine(context);

    engine.handleUserInteraction();
    await flushPromises();
    expect(context.bufferSources).toHaveLength(0);

    engine.setRoomActive(true);
    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
  });

  it('starts a restored late game at its requested orchestration without a restart', async () => {
    const context = new FakeAudioContext();
    const engine = makeEngine(context);
    engine.setMusicIntensity(3);
    engine.setRoomActive(true);

    engine.handleUserInteraction();
    await flushPromises();

    expect(context.gains.slice(4, 8).map(gain => gain.gainValue.value)).toEqual([1, 1, 1, 0.78]);
    expect(new Set(context.bufferSources.flatMap(source => source.starts))).toEqual(new Set([0.02]));
  });

  it('recovers on a later activation while an ineffective resume remains unresolved', async () => {
    const context = new FakeAudioContext();
    let settleFirstResume: (() => void) | undefined;
    context.resumeImplementation = vi.fn()
      .mockImplementationOnce(() => new Promise<void>(resolve => {
        settleFirstResume = resolve;
      }))
      .mockImplementationOnce(() => {
        context.state = 'running';
        return Promise.resolve();
      });
    const engine = makeEngine(context);
    engine.setRoomActive(true);

    engine.handleUserInteraction();
    engine.handleUserInteraction('ui.click');
    await flushPromises();

    expect(context.resumeCount).toBe(2);
    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
    expect(context.oscillators).toHaveLength(1);

    settleFirstResume?.();
    await flushPromises();
    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
    expect(context.oscillators).toHaveLength(1);
  });

  it('retries a temporary resume rejection on the next trusted interaction', async () => {
    const context = new FakeAudioContext();
    context.resumeImplementation = vi.fn()
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockImplementationOnce(() => {
        context.state = 'running';
        return Promise.resolve();
      });
    const engine = makeEngine(context);
    engine.setRoomActive(true);

    engine.handleUserInteraction();
    await flushPromises();
    expect(context.bufferSources).toHaveLength(0);

    engine.handleUserInteraction('ui.click');
    await flushPromises();
    expect(context.resumeCount).toBe(2);
    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
    expect(context.oscillators).toHaveLength(1);
  });

  it('treats Safari interrupted state as recoverable on the next interaction', async () => {
    const context = new FakeAudioContext();
    context.state = 'interrupted';
    context.resumeImplementation = vi.fn(() => {
      context.state = 'running';
      return Promise.resolve();
    });
    const engine = makeEngine(context);
    engine.setRoomActive(true);

    engine.handleUserInteraction();
    await flushPromises();

    expect(context.resumeCount).toBe(1);
    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
  });

  it('renders a deterministic 64-bar score with four distinct synchronized stems', () => {
    const first = createProceduralMusicStems(400);
    const second = createProceduralMusicStems(400);
    const checksum = (samples: Float32Array) => {
      let total = 0;
      for (let index = 0; index < samples.length; index += 97) total += samples[index] ?? 0;
      return total;
    };

    expect(first.map(stem => [checksum(stem.left), checksum(stem.right)]))
      .toEqual(second.map(stem => [checksum(stem.left), checksum(stem.right)]));
    expect(first).toHaveLength(4);
    expect(first.every(stem => stem.left.length === stem.right.length)).toBe(true);
    expect(new Set(first.map(stem => checksum(stem.left).toFixed(5))).size).toBe(4);
    expect(MUSIC_TRACK_METADATA.bpm).toBe(110);
    expect(MUSIC_BARS).toBe(64);
    expect(MUSIC_BEATS).toBe(256);
    expect(MUSIC_TRACK_METADATA.sections).toHaveLength(9);
    expect(MUSIC_TRACK_METADATA.sections.reduce((bars, section) => bars + section.bars, 0)).toBe(64);
    expect(MUSIC_MAIN_MELODY_PHRASES).toHaveLength(32);
    expect(MUSIC_TRACK_METADATA.durationSeconds).toBeGreaterThan(135);
    expect(MUSIC_TRACK_METADATA.durationSeconds).toBeLessThan(145);
    expect(MUSIC_TRACK_METADATA.melodicActivityRatio).toBeGreaterThanOrEqual(0.55);
    expect(MUSIC_TRACK_METADATA.melodicActivityRatio).toBeLessThanOrEqual(0.65);
    expect(first.every(stem => (
      Math.abs(stem.left[0] ?? 0) < 0.001
      && Math.abs(stem.right[0] ?? 0) < 0.001
      && Math.abs(stem.left.at(-1) ?? 0) < 0.001
      && Math.abs(stem.right.at(-1) ?? 0) < 0.001
    ))).toBe(true);
    let peak = 0;
    for (let index = 0; index < first[0].left.length; index += 1) {
      for (const channel of ['left', 'right'] as const) {
        const sample = first[0][channel][index]
          + first[1][channel][index]
          + first[2][channel][index]
          + first[3][channel][index] * 0.78;
        peak = Math.max(peak, Math.abs(sample));
      }
    }
    expect(peak).toBeLessThanOrEqual(MUSIC_TRACK_METADATA.samplePeakCeiling + 0.001);
  });

  it('keeps the main theme in its warm register and resolves short rises', () => {
    const notes: number[] = [];
    MUSIC_MAIN_MELODY_PHRASES.forEach(phrase => phrase.forEach(note => {
      if (note !== null) notes.push(note);
    }));
    expect(Math.min(...notes)).toBeGreaterThanOrEqual(65);
    expect(Math.max(...notes)).toBeLessThanOrEqual(76);

    MUSIC_MAIN_MELODY_PHRASES.forEach(phrase => {
      let previous: number | null = null;
      let ascendingSteps = 0;
      phrase.forEach(note => {
        if (note === null) {
          previous = null;
          ascendingSteps = 0;
          return;
        }
        ascendingSteps = previous !== null && note > previous ? ascendingSteps + 1 : 0;
        expect(ascendingSteps).toBeLessThanOrEqual(2);
        previous = note;
      });
    });
  });

  it('derives stable intensity from ownership, development, progression, and pressure', () => {
    const early = makeRoom().gameState;
    expect(deriveMusicIntensity(early)).toBe(0);

    const developing = makeRoom().gameState;
    developBoard(developing, 16, 2);
    developing.boardState.turnNumber = 36;
    expect(deriveMusicIntensity(developing)).toBe(2);

    const late = makeRoom().gameState;
    developBoard(late, 28, 4);
    late.boardState.turnNumber = 60;
    expect(deriveMusicIntensity(late)).toBe(3);

    const pressured = makeRoom().gameState;
    developBoard(pressured, 9, 0);
    pressured.players['player-a'].accountBalance = 200;
    pressured.boardState.finishedPlayers['player-c'] = {
      name: 'Chi', color: 'green', characterId: 'cat', reason: 'BANKRUPT', accountBalance: 0,
    };
    pressured.boardState.paymentShortfall = {
      debtorPlayerId: 'player-a',
      creditor: 'BANK',
      amount: 500,
      remainingAmount: 300,
      source: { kind: 'OTHER', description: 'test' },
      actionDeadlineAt: '2026-09-02T00:00:00.000Z',
      remainingClaimCount: 1,
    };
    const unpressured = makeRoom().gameState;
    developBoard(unpressured, 9, 0);
    expect(calculateMusicIntensityScore(pressured)).toBeGreaterThan(calculateMusicIntensityScore(unpressured));
    const pressureLevel = deriveMusicIntensity(pressured);
    expect(pressureLevel).toBe(1);
    expect(deriveMusicIntensity(pressured, pressureLevel)).toBe(pressureLevel);
  });

  it('changes stem orchestration once at the next four-bar boundary', () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    context.currentTime = 1;
    const cityGain = context.gains[5];
    expect(cityGain).toBeDefined();

    engine.setMusicIntensity(2);
    const boundary = cityGain?.gainValue.events.find(event => event.type === 'set' && event.time > 1);
    const ramp = cityGain?.gainValue.events.find(event => event.type === 'linear');
    expect(boundary).toBeDefined();
    expect(ramp?.value).toBe(1);
    expect(((boundary?.time ?? 0) - 0.02) / (60 / 110) % 16).toBeCloseTo(0, 6);
    expect((ramp?.time ?? 0) - (boundary?.time ?? 0)).toBeCloseTo(2 * 60 / 110, 6);

    const scheduledEventCount = cityGain?.gainValue.events.length;
    engine.setMusicIntensity(2);
    expect(cityGain?.gainValue.events).toHaveLength(scheduledEventCount ?? 0);

    context.currentTime = 20;
    const wealthGain = context.gains[6];
    engine.setMusicIntensity(1);
    expect(wealthGain?.gainValue.events.filter(event => event.type === 'linear').at(-1)?.value).toBe(0);
  });

  it('fades on hidden state, resumes the same source, and stops after leaving the room', () => {
    vi.useFakeTimers();
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    const sources = context.bufferSources.slice();
    expect(sources).toHaveLength(MUSIC_STEM_IDS.length);

    engine.setDocumentHidden(true);
    expect(sources.every(source => source.stops.length === 0)).toBe(true);
    engine.setDocumentHidden(false);
    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);

    engine.setRoomActive(false);
    vi.advanceTimersByTime(250);
    expect(sources.every(source => source.stops.length === 1)).toBe(true);

    engine.setRoomActive(true);
    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length * 2);
    expect(context.operations.filter(operation => operation === 'buffer-create'))
      .toHaveLength(MUSIC_STEM_IDS.length);
  });

  it('stops presentation tails without stopping UI clicks or background music', () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    const music = context.bufferSources.slice();

    engine.play('victory', { scope: 'presentation' });
    engine.play('ui.click');
    engine.stopPresentationVoices();

    expect(music.every(source => source.stops.length === 0)).toBe(true);
    expect(context.oscillators.slice(0, 3).every(source => source.stops.length === 2)).toBe(true);
    expect(context.oscillators[3]?.stops).toHaveLength(1);
  });

  it('enforces cooldown and polyphony limits for spam-prone cues', () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.handleUserInteraction();

    engine.play('movement.hop');
    context.currentTime = 0.1;
    engine.play('movement.hop');
    expect(context.oscillators).toHaveLength(1);

    context.oscillators[0]?.end();
    engine.play('movement.hop');
    expect(context.oscillators).toHaveLength(2);

    context.oscillators[1]?.end();
    context.currentTime = 0.12;
    engine.play('movement.hop');
    expect(context.oscillators).toHaveLength(2);
  });

  it('stops an active presentation voice when its abort signal fires', () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    const controller = new AbortController();
    engine.handleUserInteraction();

    engine.play('dice.shake', { signal: controller.signal });
    expect(context.oscillators[0]?.stops).toHaveLength(1);
    expect(context.bufferSources[0]?.stops).toHaveLength(1);

    controller.abort();
    expect(context.oscillators[0]?.stops).toHaveLength(2);
    expect(context.bufferSources[0]?.stops).toHaveLength(2);
  });

  it('stops voices, disconnects buses, and closes the context on dispose', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.handleUserInteraction();
    engine.play('victory');

    engine.dispose();
    await flushPromises();

    expect(context.closeCount).toBe(1);
    expect(context.oscillators).toHaveLength(3);
    expect(context.oscillators.every(source => source.stops.length === 2)).toBe(true);
    expect(context.gains.slice(0, 3).every(node => node.disconnectCount === 1)).toBe(true);
    expect(context.gains.slice(4).every(node => node.disconnectCount === 1)).toBe(true);
  });

  it('survives a StrictMode-style release and immediate retain before disposal', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.retain();
    engine.handleUserInteraction();
    engine.release();
    engine.retain();
    await flushPromises();

    expect(context.closeCount).toBe(0);
    engine.release();
    await flushPromises();
    expect(context.closeCount).toBe(1);
  });
});
