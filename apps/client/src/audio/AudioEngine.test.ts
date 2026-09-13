import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, GAMEPLAY_MUSIC_URL } from './AudioEngine';

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
}

class FakeNode {
  public disconnectCount = 0;
  public readonly connections: unknown[] = [];

  public connect(destination: unknown): unknown {
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
}

class FakeAudioBuffer {
  public readonly duration: number;
  public readonly numberOfChannels: number;

  public constructor(
    channels: number,
    public readonly length: number,
    public readonly sampleRate: number,
  ) {
    this.duration = length / sampleRate;
    this.numberOfChannels = channels;
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
  public decodeCount = 0;
  public resumeCount = 0;
  public closeCount = 0;
  public decodeImplementation?: () => Promise<AudioBuffer>;
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
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return Object.assign(node, { frequency: node.frequencyValue }) as unknown as OscillatorNode;
  }

  public createBufferSource(): AudioBufferSourceNode {
    const node = new FakeBufferSourceNode();
    this.bufferSources.push(node);
    return node as unknown as AudioBufferSourceNode;
  }

  public createBuffer(channels: number, length: number, sampleRate = this.sampleRate): AudioBuffer {
    return new FakeAudioBuffer(channels, length, sampleRate) as unknown as AudioBuffer;
  }

  public decodeAudioData(): Promise<AudioBuffer> {
    this.decodeCount += 1;
    return this.decodeImplementation?.() ?? Promise.resolve(
      new FakeAudioBuffer(2, this.sampleRate, this.sampleRate) as unknown as AudioBuffer,
    );
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function response(status = 200, body: ArrayBuffer | Promise<ArrayBuffer> = new ArrayBuffer(8)): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => body,
  } as Response;
}

function fetchUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function makeFetcher(handler: (url: string) => Promise<Response> | Response = () => response()): FetchMock {
  return vi.fn<typeof fetch>(async input => handler(fetchUrl(input)));
}

function makeEngine(context: FakeAudioContext, fetcher = makeFetcher()): AudioEngine {
  return new AudioEngine({
    contextFactory: () => context as unknown as AudioContext,
    fetcher,
  });
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function musicSources(context: FakeAudioContext): FakeBufferSourceNode[] {
  return context.bufferSources.filter(source => source.loop);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AudioEngine', () => {
  it('creates one context and applies master, music, and SFX gains', () => {
    const context = new FakeAudioContext('running');
    const factory = vi.fn(() => context as unknown as AudioContext);
    const engine = new AudioEngine({ contextFactory: factory, fetcher: makeFetcher() });

    engine.setMix({ masterGain: 0.6, musicGain: 0.2, sfxGain: 0.4 });
    engine.handleUserInteraction();
    engine.setMix({ masterGain: 0, musicGain: 0.5, sfxGain: 0 });

    expect(factory).toHaveBeenCalledOnce();
    expect(context.gains.slice(0, 3).map(node => node.gainValue.value)).toEqual([0, 0, 0.5]);
  });

  it('does not create audio or play ordinary cues before unlock', () => {
    const context = new FakeAudioContext();
    const factory = vi.fn(() => context as unknown as AudioContext);
    const engine = new AudioEngine({ contextFactory: factory, fetcher: makeFetcher() });

    engine.play('dice.impact');

    expect(factory).not.toHaveBeenCalled();
    expect(context.oscillators).toHaveLength(0);
  });

  it('keeps music silent outside an active game and loads one looping WAV while active', async () => {
    const context = new FakeAudioContext('running');
    const fetcher = makeFetcher();
    const engine = makeEngine(context, fetcher);

    engine.setGameActive(false);
    engine.handleUserInteraction();
    await flushPromises();
    expect(fetcher).not.toHaveBeenCalledWith(GAMEPLAY_MUSIC_URL, expect.anything());

    engine.setGameActive(true);
    await flushPromises();
    expect(fetcher.mock.calls.filter(([input]) => fetchUrl(input) === GAMEPLAY_MUSIC_URL)).toHaveLength(1);
    expect(musicSources(context)).toHaveLength(1);
    expect(musicSources(context)[0]?.loop).toBe(true);

    engine.setGameActive(true);
    await flushPromises();
    expect(fetcher.mock.calls.filter(([input]) => fetchUrl(input) === GAMEPLAY_MUSIC_URL)).toHaveLength(1);
    expect(musicSources(context)).toHaveLength(1);
  });

  it('starts active music after a suspended context is resumed by interaction', async () => {
    const context = new FakeAudioContext();
    const engine = makeEngine(context);

    engine.setGameActive(true);
    expect(musicSources(context)).toHaveLength(0);
    engine.handleUserInteraction();
    await flushPromises();

    expect(context.resumeCount).toBe(1);
    expect(musicSources(context)).toHaveLength(1);
  });

  it('fades out on game exit and starts a fresh source on re-entry', async () => {
    vi.useFakeTimers();
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setGameActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    expect(musicSources(context)).toHaveLength(1);

    engine.setGameActive(false);
    expect(musicSources(context)[0]?.stops).toHaveLength(1);
    vi.advanceTimersByTime(300);
    expect(musicSources(context)).toHaveLength(1);

    engine.setGameActive(true);
    await flushPromises();
    expect(musicSources(context)).toHaveLength(2);
  });

  it('does not start music when an old load resolves after exit or dispose', async () => {
    const body = deferred<ArrayBuffer>();
    const fetcher = makeFetcher(url => url === GAMEPLAY_MUSIC_URL
      ? response(200, body.promise)
      : response());
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context, fetcher);
    engine.setGameActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    engine.setGameActive(false);
    body.resolve(new ArrayBuffer(8));
    await flushPromises();
    expect(musicSources(context)).toHaveLength(0);

    const secondBody = deferred<ArrayBuffer>();
    const secondFetcher = makeFetcher(url => url === GAMEPLAY_MUSIC_URL
      ? response(200, secondBody.promise)
      : response());
    const secondContext = new FakeAudioContext('running');
    const disposedEngine = makeEngine(secondContext, secondFetcher);
    disposedEngine.setGameActive(true);
    disposedEngine.handleUserInteraction();
    await flushPromises();
    disposedEngine.dispose();
    secondBody.resolve(new ArrayBuffer(8));
    await flushPromises();
    expect(musicSources(secondContext)).toHaveLength(0);
  });

  it('stops and resumes music around document visibility without duplicating sources', async () => {
    vi.useFakeTimers();
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setGameActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    engine.setDocumentHidden(true);
    engine.setDocumentHidden(false);
    vi.advanceTimersByTime(300);
    await flushPromises();

    expect(musicSources(context)).toHaveLength(2);
  });

  it('keeps procedural cues available while sample cues load', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.handleUserInteraction();
    await flushPromises();

    engine.play('movement.hop');
    expect(context.oscillators).toHaveLength(1);
  });

  it('uses a cached sample after immediate procedural fallback', async () => {
    const sampleBody = deferred<ArrayBuffer>();
    const context = new FakeAudioContext('running');
    const fetcher = makeFetcher(url => url.endsWith('money-pay-01.ogg')
      ? response(200, sampleBody.promise)
      : response());
    const engine = makeEngine(context, fetcher);
    engine.handleUserInteraction();
    await flushPromises();
    engine.play('money.pay');
    expect(context.oscillators.length).toBeGreaterThan(0);

    sampleBody.resolve(new ArrayBuffer(8));
    await flushPromises();
    const decodeCount = context.decodeCount;
    context.currentTime = 1;
    engine.play('money.pay');
    expect(context.bufferSources.some(source => !source.loop && source.buffer)).toBe(true);
    expect(context.decodeCount).toBe(decodeCount);
    expect(fetcher.mock.calls.filter(([input]) => fetchUrl(input).endsWith('money-pay-01.ogg'))).toHaveLength(1);
  });

  it('falls back once and warns once when a sample cannot be fetched', async () => {
    const context = new FakeAudioContext('running');
    const fetcher = makeFetcher(url => url.endsWith('money-pay-01.ogg') ? response(404) : response());
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine(context, fetcher);
    engine.handleUserInteraction();
    await flushPromises();
    context.currentTime = 1;
    engine.play('money.pay');
    await flushPromises();
    context.currentTime = 2;
    engine.play('money.pay');
    await flushPromises();

    expect(context.oscillators.length).toBeGreaterThan(0);
    expect(warning.mock.calls.filter(([message]) => String(message).includes('money-pay-01.ogg'))).toHaveLength(1);
  });

  it('bounds voices, honors cooldown, and aborts presentation voices', () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.handleUserInteraction();
    const signalController = new AbortController();
    engine.play('ui.click', { scope: 'presentation', signal: signalController.signal });
    const oscillatorCount = context.oscillators.length;
    engine.play('ui.click', { scope: 'presentation' });
    expect(context.oscillators).toHaveLength(oscillatorCount);

    signalController.abort();
    expect(context.oscillators[0]?.stops.length).toBeGreaterThan(0);
    engine.stopPresentationVoices();
    expect(context.oscillators[0]?.disconnectCount).toBeGreaterThan(0);
  });

  it('keeps deterministic sample variations bounded across repeated plays', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.handleUserInteraction();
    await flushPromises();
    for (let index = 0; index < 5; index += 1) {
      context.currentTime = index + 1;
      engine.play('dice.impact');
      context.bufferSources.at(-1)?.end();
    }

    expect(context.bufferSources.filter(source => !source.loop && source.buffer)).toHaveLength(5);
  });

  it('disposes voices, buses, and the single context', async () => {
    const context = new FakeAudioContext('running');
    const engine = makeEngine(context);
    engine.setGameActive(true);
    engine.handleUserInteraction();
    await flushPromises();
    engine.play('ui.click');
    engine.dispose();

    expect(context.closeCount).toBe(1);
    expect(() => engine.play('ui.click')).not.toThrow();
  });
});
