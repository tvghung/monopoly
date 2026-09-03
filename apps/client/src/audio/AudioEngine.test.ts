import { afterEach, describe, expect, it, vi } from 'vitest';
import { tileState, type PublicGameState } from '@monopoly/shared';
import { makeRoom } from '../game/presentation/testFixtures';
import {
  AudioEngine,
  calculateMusicIntensityScore,
  deriveMusicIntensity,
  GAMEPLAY_MUSIC_STEMS,
  MUSIC_BARS,
  MUSIC_BEATS,
  MUSIC_LOOP_DURATION_SECONDS,
  MUSIC_STEM_IDS,
  MUSIC_STEM_LEVELS,
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
  public readonly numberOfChannels: number;

  public constructor(
    channels: number,
    public readonly length: number,
    public readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: channels }, () => new Float32Array(length));
    this.duration = length / sampleRate;
    this.numberOfChannels = channels;
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
  public decodedBuffers: AudioBuffer[] = [];
  public decodeCount = 0;
  public decodeFailures = 0;
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

  public decodeAudioData(): Promise<AudioBuffer> {
    this.decodeCount += 1;
    this.operations.push('decode-start');
    if (this.decodeFailures > 0) {
      this.decodeFailures -= 1;
      return Promise.reject(new Error('decode failed'));
    }
    const buffer = this.decodedBuffers.shift() ?? new FakeAudioBuffer(
      2,
      Math.round(this.sampleRate * MUSIC_LOOP_DURATION_SECONDS),
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

function makeFetcher(statusForUrl: (url: string) => number = () => 200): FetchMock {
  return vi.fn<typeof fetch>(input => {
    const status = statusForUrl(fetchUrl(input));
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as Response);
  });
}

function makeEngine(context: FakeAudioContext, fetcher = makeFetcher()): AudioEngine {
  return new AudioEngine({
    contextFactory: () => context as unknown as AudioContext,
    fetcher,
  });
}

function makeMusicBuffer(
  context: FakeAudioContext,
  lengthOffset = 0,
  channels = 2,
): AudioBuffer {
  return new FakeAudioBuffer(
    channels,
    Math.round(context.sampleRate * MUSIC_LOOP_DURATION_SECONDS) + lengthOffset,
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
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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
    const engine = new AudioEngine({ contextFactory: factory, fetcher: makeFetcher() });

    expect(() => engine.play('dice.impact')).not.toThrow();
    expect(factory).not.toHaveBeenCalled();
    expect(() => engine.handleUserInteraction('ui.click')).not.toThrow();
    expect(factory).toHaveBeenCalledOnce();
  });

  it('unlocks only on interaction and never replays a pre-unlock gameplay cue', async () => {
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
    const engine = new AudioEngine({ contextFactory: factory, fetcher: makeFetcher() });
    engine.setRoomActive(true);

    engine.handleUserInteraction('ui.click');
    await flushPromises();

    expect(factory).toHaveBeenCalledOnce();
    expect(context.resumeCount).toBe(1);
    expect(context.state).toBe('running');
    expect(context.oscillators).toHaveLength(1);
    expect(context.bufferSources.filter(source => source.loop)).toHaveLength(MUSIC_STEM_IDS.length);
    expect(context.operations.indexOf('oscillator-start'))
      .toBeLessThan(context.operations.indexOf('decode-start'));
  });

  it('loads and starts one rendered stem set after unlock, then reuses it', async () => {
    const context = new FakeAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const fetcher = makeFetcher();
    const engine = new AudioEngine({ contextFactory: factory, fetcher });

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
    expect(fetcher.mock.calls.map(([input]) => fetchUrl(input)))
      .toEqual(GAMEPLAY_MUSIC_STEMS.map(stem => stem.url));
    expect(context.decodeCount).toBe(GAMEPLAY_MUSIC_STEMS.length);
    expect(context.operations.filter(operation => operation === 'buffer-create')).toHaveLength(0);

    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
    expect(fetcher).toHaveBeenCalledTimes(GAMEPLAY_MUSIC_STEMS.length);
    expect(context.decodeCount).toBe(GAMEPLAY_MUSIC_STEMS.length);
  });

  it('starts lobby music when the room becomes active after an earlier unlock', async () => {
    const context = new FakeAudioContext();
    const engine = makeEngine(context);

    engine.handleUserInteraction();
    await flushPromises();
    expect(context.bufferSources).toHaveLength(0);

    engine.setRoomActive(true);
    await flushPromises();
    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
  });

  it('uses Foundation only when an additional stem is unavailable', async () => {
    const context = new FakeAudioContext();
    const fetcher = makeFetcher(url => url.endsWith('gameplay-city.ogg') ? 404 : 200);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);

    engine.handleUserInteraction();
    await flushPromises();

    expect(fetcher).toHaveBeenCalledTimes(GAMEPLAY_MUSIC_STEMS.length);
    expect(context.decodeCount).toBe(GAMEPLAY_MUSIC_STEMS.length - 1);
    expect(context.bufferSources).toHaveLength(1);
    expect(context.bufferSources[0]?.loop).toBe(true);
    expect(context.operations.filter(operation => operation === 'buffer-create')).toHaveLength(0);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('gameplay-city.ogg'));
  });

  it('falls back to one temporary legacy BGM when Foundation is unavailable', async () => {
    const context = new FakeAudioContext();
    const fetcher = makeFetcher(url => url.endsWith('gameplay-foundation.ogg') ? 404 : 200);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);

    engine.handleUserInteraction();
    await flushPromises();

    expect(context.decodeCount).toBe(GAMEPLAY_MUSIC_STEMS.length - 1);
    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
    expect(context.operations.filter(operation => operation === 'buffer-create'))
      .toHaveLength(MUSIC_STEM_IDS.length);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Falling back to temporary legacy BGM'));
  });

  it('falls back when Foundation is incompatible', async () => {
    const context = new FakeAudioContext();
    context.decodedBuffers = [makeMusicBuffer(context, 0, 1)];
    const fetcher = makeFetcher(url => url.endsWith('gameplay-city.ogg') ? 404 : 200);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);

    engine.handleUserInteraction();
    await flushPromises();

    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
    expect(context.operations.filter(operation => operation === 'buffer-create'))
      .toHaveLength(MUSIC_STEM_IDS.length);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('foundation is not stereo'));
  });

  it('falls back when Foundation decoding fails', async () => {
    const context = new FakeAudioContext();
    context.decodeFailures = 1;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine(context);
    engine.setRoomActive(true);

    engine.handleUserInteraction();
    await flushPromises();

    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
    expect(context.operations.filter(operation => operation === 'buffer-create'))
      .toHaveLength(MUSIC_STEM_IDS.length);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Falling back to temporary legacy BGM'));
  });

  it('uses one cached legacy fallback when every rendered stem is unavailable', async () => {
    const context = new FakeAudioContext();
    const fetcher = makeFetcher(() => 404);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);

    engine.handleUserInteraction();
    await flushPromises();
    engine.handleUserInteraction();
    await flushPromises();

    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length);
    expect(context.operations.filter(operation => operation === 'buffer-create'))
      .toHaveLength(MUSIC_STEM_IDS.length);
    expect(fetcher).toHaveBeenCalledTimes(GAMEPLAY_MUSIC_STEMS.length);
  });

  it('rejects an incompatible adaptive set and uses Foundation only', async () => {
    const context = new FakeAudioContext();
    context.decodedBuffers = [
      makeMusicBuffer(context),
      makeMusicBuffer(context, 1),
      makeMusicBuffer(context),
      makeMusicBuffer(context),
    ];
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine(context);
    engine.setRoomActive(true);

    engine.handleUserInteraction();
    await flushPromises();

    expect(context.bufferSources).toHaveLength(1);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("does not share Foundation's exact timeline"));
  });

  it.each([0, 1, 2, 3] as const)(
    'starts a restored game directly at intensity %i without a restart',
    async intensity => {
    const context = new FakeAudioContext();
    const engine = makeEngine(context);
    engine.setMusicIntensity(intensity);
    engine.setRoomActive(true);

    engine.handleUserInteraction();
    await flushPromises();

    expect(context.gains.slice(4, 8).map(gain => gain.gainValue.value))
      .toEqual(MUSIC_STEM_LEVELS[intensity]);
    expect(new Set(context.bufferSources.flatMap(source => source.starts))).toEqual(new Set([0.02]));
    },
  );

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

  it('defines the exact four-stem 64-bar rendered asset contract', () => {
    expect(GAMEPLAY_MUSIC_STEMS).toEqual([
      { id: 'foundation', url: '/audio/music/gameplay/gameplay-foundation.ogg' },
      { id: 'city', url: '/audio/music/gameplay/gameplay-city.ogg' },
      { id: 'wealth', url: '/audio/music/gameplay/gameplay-wealth.ogg' },
      { id: 'competition', url: '/audio/music/gameplay/gameplay-competition.ogg' },
    ]);
    expect(MUSIC_TRACK_METADATA.bpm).toBe(110);
    expect(MUSIC_BARS).toBe(64);
    expect(MUSIC_BEATS).toBe(256);
    expect(MUSIC_TRACK_METADATA.sections).toHaveLength(9);
    expect(MUSIC_TRACK_METADATA.sections.reduce((bars, section) => bars + section.bars, 0)).toBe(64);
    expect(MUSIC_TRACK_METADATA.durationSeconds).toBeGreaterThan(135);
    expect(MUSIC_TRACK_METADATA.durationSeconds).toBeLessThan(145);
    expect(MUSIC_TRACK_METADATA.transitionBars).toBe(4);
    expect(MUSIC_TRACK_METADATA.transitionFadeBeats).toBe(2);
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

  it('changes stem orchestration once at the next four-bar boundary', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    context.currentTime = 1;
    const cityGain = context.gains[5];
    expect(cityGain).toBeDefined();

    engine.setMusicIntensity(2);
    const boundary = cityGain?.gainValue.events.find(event => event.type === 'set' && event.time > 1);
    const ramp = cityGain?.gainValue.events.find(event => event.type === 'linear');
    expect(boundary).toBeDefined();
    expect(ramp?.value).toBe(MUSIC_STEM_LEVELS[2][1]);
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

  it('fades on hidden state, resumes the same source, and stops after leaving the room', async () => {
    vi.useFakeTimers();
    const context = new FakeAudioContext('running');
    const fetcher = makeFetcher();
    const engine = makeEngine(context, fetcher);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
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
    await flushPromises();
    expect(context.bufferSources).toHaveLength(MUSIC_STEM_IDS.length * 2);
    expect(fetcher).toHaveBeenCalledTimes(MUSIC_STEM_IDS.length);
    expect(context.decodeCount).toBe(MUSIC_STEM_IDS.length);
  });

  it('stops presentation tails without stopping UI clicks or background music', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setRoomActive(true);
    engine.handleUserInteraction();
    await flushPromises();
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
