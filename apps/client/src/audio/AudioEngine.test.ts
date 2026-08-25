import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AudioEngine,
  createProceduralMusicSamples,
  MUSIC_LOOP_DURATION_SECONDS,
  MUSIC_TRACK_METADATA,
} from './AudioEngine';

class FakeAudioParam {
  public value = 1;

  public cancelScheduledValues(): AudioParam {
    return this as unknown as AudioParam;
  }

  public setValueAtTime(value: number): AudioParam {
    this.value = value;
    return this as unknown as AudioParam;
  }

  public exponentialRampToValueAtTime(value: number): AudioParam {
    this.value = value;
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

  public start(when = 0): void {
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
  private readonly data: Float32Array;

  public constructor(length: number) {
    this.data = new Float32Array(length);
  }

  public getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeAudioContext {
  public state: AudioContextState;
  public currentTime = 0;
  public readonly sampleRate = 48_000;
  public readonly destination = new FakeNode();
  public readonly gains: FakeGainNode[] = [];
  public readonly oscillators: FakeOscillatorNode[] = [];
  public readonly bufferSources: FakeBufferSourceNode[] = [];
  public resumeCount = 0;
  public closeCount = 0;

  public constructor(state: AudioContextState = 'suspended') {
    this.state = state;
  }

  public createGain(): GainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return Object.assign(node, { gain: node.gainValue }) as unknown as GainNode;
  }

  public createOscillator(): OscillatorNode {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return Object.assign(node, { frequency: node.frequencyValue }) as unknown as OscillatorNode;
  }

  public createBufferSource(): AudioBufferSourceNode {
    const node = new FakeBufferSourceNode();
    this.bufferSources.push(node);
    return node as unknown as AudioBufferSourceNode;
  }

  public createBuffer(_channels: number, length: number): AudioBuffer {
    return new FakeAudioBuffer(length) as unknown as AudioBuffer;
  }

  public resume(): Promise<void> {
    this.resumeCount += 1;
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

  it('starts one deterministic music loop only after unlock and keeps it through repeated room updates', async () => {
    const context = new FakeAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const engine = new AudioEngine({ contextFactory: factory });

    engine.setRoomActive(true);
    expect(factory).not.toHaveBeenCalled();
    expect(context.bufferSources).toHaveLength(0);

    engine.handleUserInteraction();
    await flushPromises();

    expect(context.bufferSources).toHaveLength(1);
    expect(context.bufferSources[0]?.loop).toBe(true);
    expect(context.bufferSources[0]?.loopEnd).toBeCloseTo(MUSIC_LOOP_DURATION_SECONDS);
    expect(context.oscillators).toHaveLength(0);

    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    expect(context.bufferSources).toHaveLength(1);
  });

  it('publishes a deterministic three-section music loop with the intended tempo', () => {
    const first = createProceduralMusicSamples(2_000);
    const second = createProceduralMusicSamples(2_000);
    expect(Array.from(first)).toEqual(Array.from(second));
    expect(MUSIC_TRACK_METADATA.bpm).toBeGreaterThanOrEqual(110);
    expect(MUSIC_TRACK_METADATA.bpm).toBeLessThanOrEqual(114);
    expect(MUSIC_TRACK_METADATA.sectionCount).toBe(3);
    expect(MUSIC_TRACK_METADATA.durationSeconds).toBeGreaterThan(45);
    expect(MUSIC_TRACK_METADATA.durationSeconds).toBeLessThan(55);
    const sectionLength = Math.floor(first.length / 3);
    const energy = [0, 1, 2].map(section => {
      const start = section * sectionLength;
      const end = section === 2 ? first.length : start + sectionLength;
      return Array.from(first.slice(start, end)).reduce((total, sample) => total + Math.abs(sample), 0);
    });
    expect(new Set(energy.map(value => value.toFixed(3))).size).toBeGreaterThan(1);
  });

  it('fades on hidden state, resumes the same source, and stops after leaving the room', () => {
    vi.useFakeTimers();
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    const source = context.bufferSources[0];
    expect(source).toBeDefined();

    engine.setDocumentHidden(true);
    expect(source?.stops).toHaveLength(0);
    engine.setDocumentHidden(false);
    expect(context.bufferSources).toHaveLength(1);

    engine.setRoomActive(false);
    vi.advanceTimersByTime(250);
    expect(source?.stops).toHaveLength(1);
  });

  it('stops presentation tails without stopping UI clicks or background music', () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    const music = context.bufferSources[0];

    engine.play('victory', { scope: 'presentation' });
    engine.play('ui.click');
    engine.stopPresentationVoices();

    expect(music?.stops).toHaveLength(0);
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
});
