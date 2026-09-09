import { afterEach, describe, expect, it, vi } from 'vitest';
import { tileState, type PublicGameState } from '@monopoly/shared';
import { makeRoom } from '../game/presentation/testFixtures';
import { AUDIO_REGISTRY } from './audioRegistry';
import type { AudioCueId } from './types';
import {
  AudioEngine,
  calculateMusicIntensityScore,
  deriveMusicIntensity,
  GAMEPLAY_MUSIC_STEMS,
  MUSIC_BARS,
  MUSIC_BEATS,
  MUSIC_BPM,
  MUSIC_LOOP_DURATION_SECONDS,
  MUSIC_MANIFEST_URL,
  MUSIC_PHRASE_BEATS,
  MUSIC_SAMPLE_RATE,
  MUSIC_SEGMENT_COUNT,
  MUSIC_STEM_IDS,
  MUSIC_STEM_LEVELS,
  MUSIC_TRACK_METADATA,
  calculateMusicSegmentBoundaries,
  MUSIC_TOTAL_SOURCE_FRAMES,
} from './AudioEngine';

class FakeAudioParam {
  public value = 1;
  public readonly events: Array<{ type: string; value: number; time: number }> = [];

  public cancelScheduledValues(time: number): AudioParam {
    this.events.push({ type: 'cancel', value: this.value, time });
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
  public readonly connections: AudioNode[] = [];

  public connect(destination: AudioNode): AudioNode {
    this.connections.push(destination);
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
}

class FakeAudioBuffer {
  private readonly data: Array<Float32Array | undefined>;
  public readonly duration: number;
  public readonly numberOfChannels: number;

  public constructor(
    channels: number,
    public readonly length: number,
    public readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: channels });
    this.duration = length / sampleRate;
    this.numberOfChannels = channels;
  }

  public getChannelData(channel: number): Float32Array {
    const existing = this.data[channel];
    if (existing) return existing;
    const data = new Float32Array(this.length);
    this.data[channel] = data;
    return data;
  }
}

class FakeAudioContext {
  public state: AudioContextState | 'interrupted';
  public currentTime = 0;
  public readonly sampleRate = 48_000;
  public readonly destination = new FakeNode();
  public readonly gains: FakeGainNode[] = [];
  public readonly oscillators: FakeOscillatorNode[] = [];
  public readonly bufferSources: FakeBufferSourceNode[] = [];
  public readonly operations: string[] = [];
  public decodedBuffers: AudioBuffer[] = [];
  public decodeCount = 0;
  public decodeFailures = 0;
  public resumeCount = 0;
  public closeCount = 0;
  public resumeImplementation?: () => Promise<void>;

  public constructor(state: FakeAudioContext['state'] = 'suspended') {
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

  public decodeAudioData(): Promise<AudioBuffer> {
    this.decodeCount += 1;
    this.operations.push('decode-start');
    if (this.decodeFailures > 0) {
      this.decodeFailures -= 1;
      return Promise.reject(new Error('decode failed'));
    }
    const buffer = this.decodedBuffers.shift() ?? new FakeAudioBuffer(
      2,
      Math.round(this.sampleRate * MUSIC_PHRASE_BEATS * 60 / MUSIC_BPM),
      this.sampleRate,
    ) as unknown as AudioBuffer;
    return Promise.resolve(buffer);
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

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function fetchUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function response(status: number, body: ArrayBuffer | string = new ArrayBuffer(8)): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : ''),
    arrayBuffer: () => Promise.resolve(typeof body === 'string' ? new ArrayBuffer(8) : body),
  } as Response;
}

function makeManifest(): Record<string, unknown> {
  const boundaries = calculateMusicSegmentBoundaries();
  const last = boundaries.at(-1)!;
  return {
    schemaVersion: 1,
    track: {
      bpm: MUSIC_BPM,
      beatsPerBar: 4,
      bars: MUSIC_BARS,
      segmentBars: 4,
      segmentCount: MUSIC_SEGMENT_COUNT,
      sampleRate: 48_000,
      totalFrames: last.startFrame + last.frameCount,
    },
    stems: GAMEPLAY_MUSIC_STEMS.map(stem => ({
      id: stem.id,
      segments: boundaries.map(segment => ({
        ...segment,
        file: `segments/${stem.id}/${String(segment.index).padStart(2, '0')}.ogg`,
        sha256: '',
      })),
    })),
  };
}

function makeFetcher(
  statusForUrl: (url: string) => number = () => 200,
): FetchMock {
  return vi.fn<typeof fetch>(input => {
    const url = fetchUrl(input);
    const status = statusForUrl(url);
    return Promise.resolve(url === MUSIC_MANIFEST_URL
      ? response(status, JSON.stringify(makeManifest()))
      : response(status));
  });
}

function makeEngine(context: FakeAudioContext, fetcher = makeFetcher()): AudioEngine {
  return new AudioEngine({
    contextFactory: () => context as unknown as AudioContext,
    fetcher,
  });
}

function makeSegmentBuffer(
  context: FakeAudioContext,
  segmentIndex: number,
  channels = 2,
  lengthOffset = 0,
): AudioBuffer {
  const segment = calculateMusicSegmentBoundaries()[segmentIndex];
  if (!segment) throw new RangeError(`Missing test segment ${segmentIndex}`);
  return new FakeAudioBuffer(
    channels,
    segment.frameCount + lengthOffset,
    context.sampleRate,
  ) as unknown as AudioBuffer;
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
  for (let index = 0; index < 100; index += 1) await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AudioEngine', () => {
  it('applies live Master, SFX, and Music gains while preserving exact zero mute', async () => {
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
    const engine = new AudioEngine({ contextFactory: factory, fetcher: makeFetcher() });

    expect(() => engine.play('dice.impact')).not.toThrow();
    expect(factory).not.toHaveBeenCalled();
    expect(() => engine.handleUserInteraction('ui.click')).not.toThrow();
    expect(factory).toHaveBeenCalledOnce();
  });

  it('unlocks only on interaction and does not replay a pre-unlock SFX', async () => {
    const context = new FakeAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const engine = new AudioEngine({ contextFactory: factory, fetcher: makeFetcher() });

    engine.play('money.receive');
    expect(factory).not.toHaveBeenCalled();
    engine.handleUserInteraction();
    await flushPromises();
    expect(context.resumeCount).toBe(1);
    expect(context.oscillators).toHaveLength(0);
    engine.handleUserInteraction('ui.click');
    expect(context.oscillators).toHaveLength(1);
  });

  it('drops ordinary SFX while suspended but allows the current unlock cue', async () => {
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

  it('keeps unlock/SFX initialization free of gameplay music when no room is active', async () => {
    const context = new FakeAudioContext();
    const fetcher = makeFetcher();
    const engine = makeEngine(context, fetcher);

    engine.handleUserInteraction('ui.click');
    await flushPromises();

    expect(context.resumeCount).toBe(1);
    expect(context.oscillators).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(context.decodeCount).toBe(0);
  });

  it('starts current and next rendered phrases with one shared timestamp per phrase', async () => {
    const context = new FakeAudioContext();
    const fetcher = makeFetcher();
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);

    engine.handleUserInteraction();
    await flushPromises();

    const snapshot = engine.getMusicTransportSnapshot();
    expect(snapshot?.status).toBe('playing');
    expect(snapshot?.retainedPhraseSequences).toEqual([0, 1]);
    expect(snapshot?.retainedDecodedBuffers).toBe(8);
    expect(snapshot?.retainedDecodedPcmBytes).toBeLessThan(32 * 1024 * 1024);
    expect(context.decodeCount).toBe(8);
    expect(fetcher).toHaveBeenCalledTimes(9);
    expect(context.bufferSources).toHaveLength(8);
    expect(context.bufferSources.every(source => !source.loop)).toBe(true);
    expect(new Set(context.bufferSources.slice(0, 4).flatMap(source => source.starts))).toEqual(new Set([0.02]));
    expect(context.bufferSources.slice(4).every(source => (
      Math.abs((source.starts[0] ?? 0) - (0.02 + calculateMusicSegmentBoundaries()[1].startFrame / MUSIC_SAMPLE_RATE))
        < 0.000001
    ))).toBe(true);
  });

  it('keeps the musical clock on absolute AudioContext scheduling across segment and loop boundaries', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();

    const anchor = engine.getMusicTransportSnapshot()?.anchorTime ?? 0;
    const boundaries = calculateMusicSegmentBoundaries();
    const endSequence = (sequence: number) => {
      const loopIndex = Math.floor(sequence / MUSIC_SEGMENT_COUNT);
      const start = anchor + (
        loopIndex * MUSIC_TOTAL_SOURCE_FRAMES + boundaries[sequence % MUSIC_SEGMENT_COUNT].startFrame
      ) / MUSIC_SAMPLE_RATE;
      const source = context.bufferSources.find(candidate => (
        candidate.starts[0] !== undefined
        && Math.abs(candidate.starts[0] - start) < 0.000001
        && candidate.onended !== null
      ));
      expect(source, `sequence ${sequence} source`).toBeDefined();
      source?.end();
    };

    for (let sequence = 0; sequence < 50; sequence += 1) {
      endSequence(sequence);
      await flushPromises();
    }

    const sequence16 = context.bufferSources.find(source => (
      source.starts[0] !== undefined
      && Math.abs(source.starts[0] - (anchor + MUSIC_TOTAL_SOURCE_FRAMES / MUSIC_SAMPLE_RATE)) < 0.000001
    ));
    expect(sequence16).toBeDefined();
    expect(engine.getMusicTransportSnapshot()?.retainedPhraseSequences.length).toBeLessThanOrEqual(2);
    expect(engine.getMusicTransportSnapshot()?.retainedDecodedBuffers).toBeLessThanOrEqual(8);
    expect(engine.getMusicTransportSnapshot()?.scheduledSequences.length).toBeLessThanOrEqual(2);
  });

  it.each([0, 1, 2, 3] as const)('restored intensity %i starts directly at that level', async intensity => {
    const context = new FakeAudioContext();
    const engine = makeEngine(context);
    engine.setMusicIntensity(intensity);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();

    expect(context.gains.slice(4, 8).map(gain => gain.gainValue.value))
      .toEqual(MUSIC_STEM_LEVELS[intensity]);
  });

  it('applies the latest intensity at the next phrase boundary with a two-beat fade', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    context.currentTime = 1;

    engine.setMusicIntensity(1);
    engine.setMusicIntensity(2);
    const cityGain = context.gains[9]?.gainValue;
    const ramp = cityGain?.events.filter(event => event.type === 'linear').at(-1);
    const boundary = cityGain?.events.find(event => event.type === 'set' && event.time > 1);

    expect(boundary?.time).toBeCloseTo(
      0.02 + calculateMusicSegmentBoundaries()[1].startFrame / MUSIC_SAMPLE_RATE,
      6,
    );
    expect(ramp?.value).toBe(MUSIC_STEM_LEVELS[2][1]);
    expect((ramp?.time ?? 0) - (boundary?.time ?? 0)).toBeCloseTo(2 * 60 / MUSIC_BPM, 6);
    expect(context.bufferSources).toHaveLength(8);
  });

  it('degrades optional stems to Foundation-only without restarting the phrase', async () => {
    const context = new FakeAudioContext();
    const fetcher = makeFetcher(url => url.includes('/city/') ? 404 : 200);
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();

    expect(context.bufferSources).toHaveLength(2);
    expect(engine.getMusicTransportSnapshot()?.adaptive).toBe(false);
    expect(engine.getMusicTransportSnapshot()?.retainedDecodedBuffers).toBe(2);
  });

  it('fades to silence and does not synthesize gameplay music when Foundation is unavailable', async () => {
    const context = new FakeAudioContext();
    const fetcher = makeFetcher(url => url.includes('/foundation/') ? 404 : 200);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();

    expect(context.bufferSources).toHaveLength(0);
    expect(context.oscillators).toHaveLength(0);
    expect(engine.getMusicTransportSnapshot()?.status).toBe('failed');
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Foundation unavailable'));
  });

  it('treats a missing manifest as permanent and does not retry it on interaction', async () => {
    const context = new FakeAudioContext();
    const fetcher = makeFetcher(url => url === MUSIC_MANIFEST_URL ? 404 : 200);
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();

    expect(engine.getMusicTransportSnapshot()?.status).toBe('failed');
    expect(context.bufferSources).toHaveLength(0);
    engine.handleUserInteraction();
    await flushPromises();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['malformed JSON', '{'],
    ['invalid schema', JSON.stringify({ schemaVersion: 2 })],
  ])('treats %s as a permanent manifest failure', async (_name, body) => {
    const context = new FakeAudioContext();
    const fetcher = vi.fn<typeof fetch>(input => Promise.resolve(
      fetchUrl(input) === MUSIC_MANIFEST_URL ? response(200, body) : response(200),
    ));
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();

    expect(engine.getMusicTransportSnapshot()?.status).toBe('failed');
    expect(context.bufferSources).toHaveLength(0);
    engine.handleUserInteraction();
    await flushPromises();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('allows one later activation retry for a transient manifest failure', async () => {
    const context = new FakeAudioContext();
    let manifestRequests = 0;
    const fetcher = vi.fn<typeof fetch>(input => {
      const url = fetchUrl(input);
      if (url === MUSIC_MANIFEST_URL && manifestRequests++ === 0) {
        return Promise.reject(new Error('temporary manifest network failure'));
      }
      return Promise.resolve(url === MUSIC_MANIFEST_URL
        ? response(200, JSON.stringify(makeManifest()))
        : response(200));
    });
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    expect(engine.getMusicTransportSnapshot()?.status).toBe('failed');

    engine.handleUserInteraction();
    await flushPromises();
    expect(engine.getMusicTransportSnapshot()?.status).toBe('playing');
    expect(context.bufferSources).toHaveLength(8);
    expect(manifestRequests).toBe(2);
  });

  it('keeps silence after a permanent Foundation decode failure', async () => {
    const context = new FakeAudioContext();
    context.decodeFailures = 1;
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();

    expect(engine.getMusicTransportSnapshot()?.status).toBe('failed');
    expect(context.bufferSources).toHaveLength(0);
    expect(context.oscillators).toHaveLength(0);
    const decodes = context.decodeCount;
    engine.handleUserInteraction();
    await flushPromises();
    expect(context.decodeCount).toBe(decodes);
  });

  it('retries an optional transient stem only in a clean room session', async () => {
    const context = new FakeAudioContext('running');
    let cityRequests = 0;
    const fetcher = makeFetcher(url => {
      if (url.includes('/city/')) return cityRequests++ === 0 ? 503 : 200;
      return 200;
    });
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    expect(context.bufferSources).toHaveLength(2);
    expect(engine.getMusicTransportSnapshot()?.adaptive).toBe(false);

    engine.setRoomActive(false);
    engine.setRoomActive(true);
    await flushPromises();
    expect(context.bufferSources).toHaveLength(10);
    expect(engine.getMusicTransportSnapshot()?.adaptive).toBe(true);
    expect(cityRequests).toBe(3);
  });

  it.each([
    ['timeline', () => ({ channels: 2, lengthOffset: 1 })],
    ['stereo', () => ({ channels: 1, lengthOffset: 0 })],
  ])('degrades an optional %s incompatibility to Foundation-only', async (_name, makeIssue) => {
    const context = new FakeAudioContext();
    const issue = makeIssue();
    context.decodedBuffers = [
      makeSegmentBuffer(context, 0),
      makeSegmentBuffer(context, 0, issue.channels, issue.lengthOffset),
      makeSegmentBuffer(context, 0),
      makeSegmentBuffer(context, 0),
    ];
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();

    expect(context.bufferSources).toHaveLength(2);
    expect(engine.getMusicTransportSnapshot()?.adaptive).toBe(false);
  });

  it('allows one later activation retry for a transient segment request', async () => {
    const context = new FakeAudioContext('running');
    let foundationRequests = 0;
    const fetcher = makeFetcher(url => {
      if (url.includes('/foundation/')) {
        foundationRequests += 1;
        return foundationRequests === 1 ? 503 : 200;
      }
      return 200;
    });
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    expect(context.bufferSources).toHaveLength(0);

    engine.handleUserInteraction();
    await flushPromises();
    expect(context.bufferSources).toHaveLength(8);
    expect(foundationRequests).toBe(3);
  });

  it('releases scheduled sources and decoded phrases on hidden/leave, then re-enters cleanly', async () => {
    vi.useFakeTimers();
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    const firstSources = context.bufferSources.slice();

    engine.setDocumentHidden(true);
    expect(engine.getMusicTransportSnapshot()?.retainedDecodedBuffers).toBe(0);
    vi.advanceTimersByTime(250);
    expect(firstSources.every(source => source.stops.length === 1)).toBe(true);

    engine.setDocumentHidden(false);
    await flushPromises();
    expect(context.bufferSources).toHaveLength(16);
    expect(engine.getMusicTransportSnapshot()?.scheduledSequences).toEqual([0, 1]);

    engine.setRoomActive(false);
    vi.advanceTimersByTime(250);
    expect(engine.getMusicTransportSnapshot()?.retainedDecodedBuffers).toBe(0);
  });

  it('does not overlap transports during rapid room re-entry', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    const oldSources = context.bufferSources.slice();

    engine.setRoomActive(false);
    engine.setRoomActive(true);
    await flushPromises();

    expect(oldSources.every(source => source.stops.length === 1)).toBe(true);
    expect(context.bufferSources.slice(8).every(source => source.stops.length === 0)).toBe(true);
    expect(engine.getMusicTransportSnapshot()?.scheduledSequences).toEqual([0, 1]);
    expect(engine.getMusicTransportSnapshot()?.activeSourceCount).toBe(8);
  });

  it.each(['suspended', 'interrupted'] as const)('resumes a %s context only after trusted interaction', async state => {
    const context = new FakeAudioContext(state);
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.setMusicIntensity(2);
    engine.handleUserInteraction();
    await flushPromises();

    expect(context.resumeCount).toBe(1);
    expect(context.bufferSources).toHaveLength(8);
    expect(context.gains.slice(4, 8).map(gain => gain.gainValue.value)).toEqual(MUSIC_STEM_LEVELS[2]);
  });

  it('discards the old transport when a closed context is replaced', async () => {
    const first = new FakeAudioContext('running');
    const second = new FakeAudioContext('running');
    let contextIndex = 0;
    const factory = vi.fn(() => contextIndex++ === 0
      ? first as unknown as AudioContext
      : second as unknown as AudioContext);
    const engine = new AudioEngine({ contextFactory: factory, fetcher: makeFetcher() });
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    first.state = 'closed';

    engine.handleUserInteraction();
    await flushPromises();

    expect(factory).toHaveBeenCalledTimes(2);
    expect(first.bufferSources.every(source => source.stops.length === 1)).toBe(true);
    expect(second.bufferSources).toHaveLength(8);
  });

  it('ignores a late manifest completion after room leave and disposal', async () => {
    let resolveManifest!: (value: Response) => void;
    const pendingManifest = new Promise<Response>(resolve => { resolveManifest = resolve; });
    const context = new FakeAudioContext('running');
    const fetcher = vi.fn<typeof fetch>(() => pendingManifest);
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await Promise.resolve();
    engine.setRoomActive(false);
    resolveManifest(response(200, JSON.stringify(makeManifest())));
    await flushPromises();
    expect(context.bufferSources).toHaveLength(0);
    expect(engine.getMusicTransportSnapshot()?.retainedDecodedBuffers).toBe(0);

    let resolveDisposed!: (value: Response) => void;
    const pendingDisposed = new Promise<Response>(resolve => { resolveDisposed = resolve; });
    const disposedContext = new FakeAudioContext('running');
    const disposedFetcher = vi.fn<typeof fetch>(() => pendingDisposed);
    const disposedEngine = makeEngine(disposedContext, disposedFetcher);
    disposedEngine.setRoomActive(true);
    disposedEngine.handleUserInteraction();
    await Promise.resolve();
    disposedEngine.dispose();
    resolveDisposed(response(200, JSON.stringify(makeManifest())));
    await flushPromises();
    expect(disposedContext.bufferSources).toHaveLength(0);
    expect(disposedEngine.getMusicTransportSnapshot()).toBeNull();
  });

  it('preserves the shared Master/Music/SFX buses and every registered cue remains SFX', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.handleUserInteraction();
    await flushPromises();

    expect(context.gains[1]?.connections).toEqual([context.gains[0]]);
    expect(context.gains[2]?.connections).toEqual([context.gains[0]]);
    expect(context.gains[3]?.connections).toEqual([context.gains[2]]);
    for (const cue of Object.keys(AUDIO_REGISTRY) as AudioCueId[]) {
      const voiceGainIndex = context.gains.length;
      engine.play(cue);
      expect(context.gains[voiceGainIndex]?.connections).toEqual([context.gains[1]]);
    }
  });

  it('stops presentation tails without stopping UI, unrelated SFX, or music', () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.handleUserInteraction();
    engine.play('victory', { scope: 'presentation' });
    engine.play('ui.click');
    engine.play('movement.hop');
    engine.stopPresentationVoices();

    expect(context.oscillators.slice(0, 3).every(source => source.stops.length === 2)).toBe(true);
    expect(context.oscillators[3]?.stops).toHaveLength(1);
    expect(context.oscillators[4]?.stops).toHaveLength(1);
  });

  it('enforces cooldown and polyphony limits for spam-prone SFX', () => {
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

  it('preserves exact zero mix mute, cooldowns, presentation cancellation, and disposal', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.handleUserInteraction();
    await flushPromises();
    engine.setMix({ masterGain: 0, musicGain: 0, sfxGain: 0 });
    expect(context.gains.slice(0, 3).map(node => node.gainValue.value)).toEqual([0, 0, 0]);

    engine.play('movement.hop');
    context.currentTime = 0.1;
    engine.play('movement.hop');
    expect(context.oscillators).toHaveLength(1);
    engine.play('victory', { scope: 'presentation' });
    engine.stopPresentationVoices();
    expect(context.oscillators.at(-1)?.stops).toHaveLength(2);

    engine.dispose();
    await flushPromises();
    expect(context.closeCount).toBe(1);
  });

  it('survives StrictMode-style release followed by immediate retain', async () => {
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

  it('preserves the existing public-state intensity weights and hysteresis', () => {
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

    const state = makeRoom().gameState;
    developBoard(state, 12, 0);
    expect(calculateMusicIntensityScore(state)).toBeGreaterThan(0.145);
    expect(calculateMusicIntensityScore(state)).toBeLessThan(0.215);
    expect(deriveMusicIntensity(state, 0)).toBe(0);
    expect(deriveMusicIntensity(state, 1)).toBe(1);
  });

  it('keeps the four-stem 64-bar contract while exposing the segmented timeline', () => {
    expect(GAMEPLAY_MUSIC_STEMS).toHaveLength(4);
    expect(MUSIC_STEM_IDS).toEqual(['foundation', 'city', 'wealth', 'competition']);
    expect(MUSIC_BARS).toBe(64);
    expect(MUSIC_BEATS).toBe(256);
    expect(MUSIC_TRACK_METADATA.bpm).toBe(110);
    expect(MUSIC_TRACK_METADATA.transitionBars).toBe(4);
    expect(MUSIC_TRACK_METADATA.transitionFadeBeats).toBe(2);
    expect(MUSIC_LOOP_DURATION_SECONDS).toBeCloseTo(256 * 60 / MUSIC_BPM, 8);
    expect(calculateMusicSegmentBoundaries()).toHaveLength(16);
    expect(MUSIC_TOTAL_SOURCE_FRAMES).toBe(6_702_545);
  });
});
