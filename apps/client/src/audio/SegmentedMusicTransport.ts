import {
  MUSIC_ASSET_ROOT,
  MUSIC_BPM,
  MUSIC_MANIFEST_URL,
  MUSIC_SAMPLE_RATE,
  MUSIC_SEGMENT_COUNT,
  MUSIC_STEM_IDS,
  MUSIC_STEM_LEVELS,
  parseGameplayMusicManifest,
  type GameplayMusicManifest,
  type GameplayMusicSegment,
  type MusicStemId,
} from './music';
import type { MusicIntensity } from './types';

const MUSIC_FADE_MS = 220;
const MUSIC_START_LEAD_SECONDS = 0.02;
const MUSIC_BUFFER_DURATION_TOLERANCE_SECONDS = 0.01;
const FLOAT32_BYTES = Float32Array.BYTES_PER_ELEMENT;

interface TransportFailure {
  message: string;
  retryable: boolean;
}

class SegmentFailure extends Error {
  public constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = 'SegmentFailure';
  }
}

class StaleTransportOperation extends Error {
  public constructor() {
    super('Stale segmented music operation');
    this.name = 'StaleTransportOperation';
  }
}

interface PhraseSet {
  sequence: number;
  segmentIndex: number;
  buffers: readonly AudioBuffer[];
}

interface PhraseGroup {
  phrase: PhraseSet;
  startAt: number;
  sources: AudioBufferSourceNode[];
  stemGains: GainNode[];
  initialLevels: number[];
  targetLevels: number[];
  transitionEndAt: number;
}

export interface SegmentedMusicTransportSnapshot {
  status: 'idle' | 'loading' | 'playing' | 'failed' | 'disposed';
  retainedPhraseSequences: number[];
  retainedDecodedBuffers: number;
  retainedDecodedPcmBytes: number;
  scheduledSequences: number[];
  activeSourceCount: number;
  adaptive: boolean;
  failure: TransportFailure | null;
  anchorTime: number;
}

export interface SegmentedMusicTransportOptions {
  context: AudioContext;
  output: GainNode;
  fetcher: typeof fetch;
  warn?: (message: string) => void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sequenceSegmentIndex(sequence: number): number {
  return sequence % MUSIC_SEGMENT_COUNT;
}

export function getMusicSequenceStartFrame(
  manifest: GameplayMusicManifest,
  sequence: number,
): number {
  const loopIndex = Math.floor(sequence / manifest.track.segmentCount);
  const segmentIndex = sequenceSegmentIndex(sequence);
  const segment = manifest.stems[0]?.segments[segmentIndex];
  if (!segment) throw new Error(`Missing Foundation segment ${segmentIndex}`);
  return loopIndex * manifest.track.totalFrames + segment.startFrame;
}

export function getMusicSequenceStartTime(
  manifest: GameplayMusicManifest,
  sequence: number,
  anchorTime: number,
): number {
  return anchorTime + getMusicSequenceStartFrame(manifest, sequence) / manifest.track.sampleRate;
}

function resolveSegmentUrl(segmentFile: string): string {
  const root = MUSIC_MANIFEST_URL.slice(0, MUSIC_MANIFEST_URL.lastIndexOf('/') + 1);
  if (!root.startsWith(MUSIC_ASSET_ROOT)) throw new Error('Invalid local gameplay music asset root');
  return `${root}${segmentFile}`;
}

function levelsFor(intensity: MusicIntensity): number[] {
  return [...MUSIC_STEM_LEVELS[intensity]];
}

export class SegmentedMusicTransport {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private readonly fetcher: typeof fetch;
  private readonly warn: (message: string) => void;
  private readonly transportGainNode: GainNode;
  private readonly phraseCache = new Map<number, PhraseSet>();
  private readonly phraseLoads = new Map<number, Promise<PhraseSet | null>>();
  private readonly phraseGroups = new Map<number, PhraseGroup>();
  private readonly segmentAttempts = new Map<string, number>();
  private readonly permanentSegments = new Set<string>();
  private manifest: GameplayMusicManifest | null = null;
  private manifestPromise: Promise<GameplayMusicManifest | null> | null = null;
  private manifestAttempts = 0;
  private manifestFailure: TransportFailure | null = null;
  private failure: TransportFailure | null = null;
  private abortController: AbortController | null = null;
  private startPromise: Promise<void> | null = null;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCleanupGroups: PhraseGroup[] = [];
  private generation = 0;
  private anchorTime = 0;
  private transportLevel: 0 | 1 = 0;
  private desiredIntensity: MusicIntensity = 0;
  private adaptive = true;
  private status: SegmentedMusicTransportSnapshot['status'] = 'idle';
  private disposed = false;

  public constructor(options: SegmentedMusicTransportOptions) {
    this.context = options.context;
    this.output = options.output;
    this.fetcher = options.fetcher;
    this.warn = options.warn ?? (() => {});
    this.transportGainNode = this.context.createGain();
    this.transportGainNode.gain.setValueAtTime(0, this.context.currentTime);
    this.transportGainNode.connect(this.output);
  }

  public setIntensity(intensity: MusicIntensity): void {
    if (this.disposed || intensity === this.desiredIntensity) return;
    this.desiredIntensity = intensity;
    if (this.status === 'playing') this.scheduleIntensityTransition();
  }

  public activate(allowRetry = false): void {
    if (this.disposed || this.context.state !== 'running') return;
    this.cancelCleanupTimer();
    if (this.status === 'playing') {
      this.rampTransport(1);
      return;
    }
    if (this.status === 'loading') return;
    if (this.status === 'failed') {
      if (!allowRetry || !this.failure?.retryable) return;
      this.failure = null;
      this.status = 'idle';
    }
    const generation = ++this.generation;
    this.abortController = new AbortController();
    this.status = 'loading';
    const startPromise = this.start(generation);
    this.startPromise = startPromise;
    void startPromise.catch(() => {}).finally(() => {
      if (this.startPromise === startPromise) this.startPromise = null;
    });
  }

  public stop(options: { immediate?: boolean; roomLeave?: boolean } = {}): void {
    if (this.disposed) return;
    const groups = [...this.phraseGroups.values()];
    ++this.generation;
    this.abortController?.abort();
    this.abortController = null;
    this.startPromise = null;
    this.manifestPromise = null;
    this.phraseLoads.clear();
    this.phraseCache.clear();
    this.phraseGroups.clear();
    this.anchorTime = 0;
    this.failure = null;
    this.status = 'idle';
    if (options.roomLeave) this.adaptive = true;
    if (options.immediate || groups.length === 0) {
      this.cancelCleanupTimer();
      this.teardownGroups(groups);
      this.setTransportGain(0);
      return;
    }
    this.rampTransport(0);
    this.scheduleGroupTeardown(groups);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation;
    this.abortController?.abort();
    this.abortController = null;
    this.startPromise = null;
    this.manifest = null;
    this.manifestPromise = null;
    this.phraseLoads.clear();
    this.phraseCache.clear();
    const groups = [...this.phraseGroups.values()];
    this.phraseGroups.clear();
    this.cancelCleanupTimer();
    this.teardownGroups(groups);
    this.transportGainNode.disconnect();
    this.status = 'disposed';
  }

  public getDebugSnapshot(): SegmentedMusicTransportSnapshot {
    let retainedDecodedBuffers = 0;
    let retainedDecodedPcmBytes = 0;
    this.phraseCache.forEach(phrase => {
      retainedDecodedBuffers += phrase.buffers.length;
      retainedDecodedPcmBytes += phrase.buffers.reduce(
        (total, buffer) => total + buffer.length * buffer.numberOfChannels * FLOAT32_BYTES,
        0,
      );
    });
    return {
      status: this.status,
      retainedPhraseSequences: [...this.phraseCache.keys()].sort((left, right) => left - right),
      retainedDecodedBuffers,
      retainedDecodedPcmBytes,
      scheduledSequences: [...this.phraseGroups.keys()].sort((left, right) => left - right),
      activeSourceCount: [...this.phraseGroups.values()]
        .reduce((total, group) => total + group.sources.length, 0),
      adaptive: this.adaptive,
      failure: this.failure,
      anchorTime: this.anchorTime,
    };
  }

  private async start(generation: number): Promise<void> {
    const manifest = await this.loadManifest(generation);
    if (!manifest || !this.isCurrent(generation)) {
      if (!manifest && this.isCurrent(generation)) {
        this.failure = this.manifestFailure ?? { message: 'Gameplay music manifest unavailable.', retryable: false };
        this.status = 'failed';
      }
      return;
    }
    const first = await this.loadAndRetainPhrase(0, generation);
    if (!first || !this.isCurrent(generation)) {
      if (this.isCurrent(generation)) this.failFoundation(this.failure ?? {
        message: 'Foundation phrase unavailable.',
        retryable: false,
      });
      return;
    }
    const second = await this.loadAndRetainPhrase(1, generation);
    if (!second || !this.isCurrent(generation)) {
      if (this.isCurrent(generation)) this.failFoundation(this.failure ?? {
        message: 'Next Foundation phrase unavailable.',
        retryable: false,
      });
      return;
    }

    this.anchorTime = this.context.currentTime + MUSIC_START_LEAD_SECONDS;
    this.status = 'playing';
    if (!this.schedulePhrase(first) || !this.schedulePhrase(second)) {
      this.failFoundation({ message: 'Could not schedule Foundation phrase.', retryable: false });
      return;
    }
    this.rampTransport(1);
  }

  private async loadManifest(generation: number): Promise<GameplayMusicManifest | null> {
    if (this.manifest) return this.manifest;
    if (this.manifestFailure && !this.manifestFailure.retryable) return null;
    if (this.manifestPromise) return this.manifestPromise;
    const attempt = this.manifestAttempts + 1;
    if (attempt > 2) return null;
    const promise = (async () => {
      let response: Response;
      try {
        response = await this.fetcher(MUSIC_MANIFEST_URL, {
          signal: this.abortController?.signal,
        });
      } catch (error) {
        if (error instanceof StaleTransportOperation || isAbortError(error) || !this.isCurrent(generation)) {
          return null;
        }
        const message = `Could not load gameplay music manifest: ${failureMessage(error)}`;
        this.manifestAttempts = attempt;
        this.manifestFailure = { message, retryable: attempt < 2 };
        this.warn(message);
        return null;
      }
      try {
        if (!response.ok) {
          throw new SegmentFailure(
            `Could not load gameplay music manifest: HTTP ${response.status}`,
            response.status >= 500,
          );
        }
        let raw: string;
        try {
          raw = await response.text();
        } catch (error) {
          throw new SegmentFailure(
            `Could not read gameplay music manifest: ${failureMessage(error)}`,
            true,
          );
        }
        const manifest = parseGameplayMusicManifest(JSON.parse(raw));
        if (!this.isCurrent(generation)) throw new StaleTransportOperation();
        this.manifest = manifest;
        this.manifestFailure = null;
        return manifest;
      } catch (error) {
        if (error instanceof StaleTransportOperation || isAbortError(error) || !this.isCurrent(generation)) {
          return null;
        }
        const retryable = error instanceof SegmentFailure
          ? error.retryable && attempt < 2
          : false;
        const message = failureMessage(error);
        this.manifestAttempts = attempt;
        this.manifestFailure = { message, retryable };
        this.warn(message);
        return null;
      }
    })();
    this.manifestPromise = promise;
    void promise.finally(() => {
      if (this.manifestPromise === promise) this.manifestPromise = null;
    }).catch(() => {});
    return promise;
  }

  private loadAndRetainPhrase(sequence: number, generation: number): Promise<PhraseSet | null> {
    const cached = this.phraseCache.get(sequence);
    if (cached) return Promise.resolve(cached);
    const existing = this.phraseLoads.get(sequence);
    if (existing) return existing;
    const load = this.loadPhrase(sequence, generation).then(phrase => {
      if (phrase && this.isCurrent(generation)) this.phraseCache.set(sequence, phrase);
      return phrase;
    });
    this.phraseLoads.set(sequence, load);
    void load.finally(() => {
      if (this.phraseLoads.get(sequence) === load) this.phraseLoads.delete(sequence);
    }).catch(() => {});
    return load;
  }

  private async loadPhrase(sequence: number, generation: number): Promise<PhraseSet | null> {
    const manifest = this.manifest;
    if (!manifest) return null;
    const segmentIndex = sequenceSegmentIndex(sequence);
    const stems = this.adaptive ? manifest.stems : manifest.stems.slice(0, 1);
    const results = await Promise.all(stems.map(async stem => {
      const segment = stem.segments[segmentIndex];
      if (!segment) return { stem, error: new SegmentFailure(`Missing ${stem.id} segment ${segmentIndex}`, false) };
      try {
        return { stem, buffer: await this.loadSegment(stem.id, segment, generation) };
      } catch (error) {
        return { stem, error };
      }
    }));
    if (!this.isCurrent(generation)) return null;
    const foundationResult = results[0];
    if (!foundationResult || !('buffer' in foundationResult) || !foundationResult.buffer) {
      const error = foundationResult?.error;
      const failure = error instanceof SegmentFailure
        ? { message: error.message, retryable: error.retryable }
        : { message: failureMessage(error), retryable: false };
      this.failure = failure;
      return null;
    }
    const foundation: AudioBuffer = foundationResult.buffer;
    const optionalFailure = results.slice(1).find(result => !('buffer' in result));
    if (optionalFailure) {
      const error = optionalFailure.error;
      this.adaptive = false;
      this.warn(`Optional gameplay stem ${optionalFailure.stem.id} unavailable; using Foundation only. ${failureMessage(error)}`);
      return { sequence, segmentIndex, buffers: [foundation] };
    }
    const buffers = results.map(result => result.buffer) as AudioBuffer[];
    const issue = this.phraseCompatibilityIssue(manifest, segmentIndex, buffers);
    if (issue) {
      if (issue.stemId === 'foundation') {
        this.failure = { message: issue.message, retryable: false };
        return null;
      }
      this.adaptive = false;
      this.markPermanentSegment(issue.stemId, segmentIndex);
      this.warn(`${issue.message} Using Foundation only.`);
      return { sequence, segmentIndex, buffers: [foundation] };
    }
    return { sequence, segmentIndex, buffers };
  }

  private async loadSegment(
    stemId: MusicStemId,
    segment: GameplayMusicSegment,
    generation: number,
  ): Promise<AudioBuffer> {
    const key = `${stemId}:${segment.index}`;
    if (this.permanentSegments.has(key)) {
      throw new SegmentFailure(`${stemId} segment ${segment.index} is permanently unavailable`, false);
    }
    const attempt = (this.segmentAttempts.get(key) ?? 0) + 1;
    if (attempt > 2) {
      this.permanentSegments.add(key);
      throw new SegmentFailure(`${stemId} segment ${segment.index} exhausted retries`, false);
    }
    let response: Response;
    try {
      response = await this.fetcher(resolveSegmentUrl(segment.file), {
        signal: this.abortController?.signal,
      });
    } catch (error) {
      if (error instanceof StaleTransportOperation || isAbortError(error) || !this.isCurrent(generation)) {
        throw new StaleTransportOperation();
      }
      const transient = new SegmentFailure(
        `Could not load ${stemId} segment ${segment.index}: ${failureMessage(error)}`,
        true,
      );
      this.segmentAttempts.set(key, attempt);
      if (attempt >= 2) this.permanentSegments.add(key);
      this.warn(transient.message);
      throw transient;
    }
    try {
      if (!response.ok) {
        throw new SegmentFailure(
          `Could not load ${stemId} segment ${segment.index}: HTTP ${response.status}`,
          response.status >= 500,
        );
      }
      let data: ArrayBuffer;
      try {
        data = await response.arrayBuffer();
      } catch (error) {
        throw new SegmentFailure(
          `Could not read ${stemId} segment ${segment.index}: ${failureMessage(error)}`,
          true,
        );
      }
      if (!this.isCurrent(generation)) throw new StaleTransportOperation();
      let buffer: AudioBuffer;
      try {
        buffer = await this.context.decodeAudioData(data);
      } catch (error) {
        throw new SegmentFailure(
          `Could not decode ${stemId} segment ${segment.index}: ${failureMessage(error)}`,
          false,
        );
      }
      if (!this.isCurrent(generation)) throw new StaleTransportOperation();
      const expectedDuration = segment.frameCount / (this.manifest?.track.sampleRate ?? MUSIC_SAMPLE_RATE);
      if (buffer.numberOfChannels !== 2) {
        throw new SegmentFailure(`${stemId} segment ${segment.index} is not stereo`, false);
      }
      if (Math.abs(buffer.duration - expectedDuration) > MUSIC_BUFFER_DURATION_TOLERANCE_SECONDS) {
        throw new SegmentFailure(`${stemId} segment ${segment.index} has an invalid duration`, false);
      }
      this.segmentAttempts.delete(key);
      return buffer;
    } catch (error) {
      if (error instanceof StaleTransportOperation || isAbortError(error) || !this.isCurrent(generation)) {
        throw new StaleTransportOperation();
      }
      const segmentError = error instanceof SegmentFailure
        ? error
        : new SegmentFailure(`${stemId} segment ${segment.index}: ${failureMessage(error)}`, false);
      this.segmentAttempts.set(key, attempt);
      if (!segmentError.retryable || attempt >= 2) this.permanentSegments.add(key);
      this.warn(segmentError.message);
      throw segmentError;
    }
  }

  private phraseCompatibilityIssue(
    manifest: GameplayMusicManifest,
    segmentIndex: number,
    buffers: readonly AudioBuffer[],
  ): { message: string; stemId: MusicStemId } | null {
    const foundation = buffers[0];
    if (!foundation) return { message: 'Foundation did not decode.', stemId: 'foundation' };
    for (let index = 0; index < buffers.length; index += 1) {
      const buffer = buffers[index];
      const stemId: MusicStemId = MUSIC_STEM_IDS[index] ?? 'foundation';
      if (!buffer || buffer.numberOfChannels !== 2) {
        return { message: `Stem ${stemId} is not stereo.`, stemId };
      }
      if (buffer.sampleRate !== foundation.sampleRate || buffer.length !== foundation.length
      || Math.abs(buffer.duration - foundation.duration) > MUSIC_BUFFER_DURATION_TOLERANCE_SECONDS) {
        return {
          message: `Stem ${stemId} segment ${segmentIndex} does not share Foundation's decoded timeline.`,
          stemId,
        };
      }
    }
    const expected = manifest.stems[0]?.segments[segmentIndex];
    if (!expected || Math.abs(foundation.duration - expected.frameCount / manifest.track.sampleRate)
      > MUSIC_BUFFER_DURATION_TOLERANCE_SECONDS) {
      return {
        message: `Foundation segment ${segmentIndex} does not match the manifest timeline.`,
        stemId: 'foundation',
      };
    }
    return null;
  }

  private schedulePhrase(phrase: PhraseSet): boolean {
    const manifest = this.manifest;
    if (!manifest || this.phraseGroups.has(phrase.sequence)) return true;
    const startAt = getMusicSequenceStartTime(manifest, phrase.sequence, this.anchorTime);
    if (startAt < this.context.currentTime) return false;
    const previous = this.previousPhraseGroup(phrase.sequence);
    const targetLevels = levelsFor(this.desiredIntensity);
    const initialLevels = previous ? [...previous.targetLevels] : [...targetLevels];
    const group: PhraseGroup = {
      phrase,
      startAt,
      sources: [],
      stemGains: [],
      initialLevels,
      targetLevels,
      transitionEndAt: startAt,
    };
    this.phraseGroups.set(phrase.sequence, group);
    try {
      phrase.buffers.forEach((buffer, index) => {
        const source = this.context.createBufferSource();
        const stemGain = this.context.createGain();
        source.buffer = buffer;
        source.loop = false;
        stemGain.gain.setValueAtTime(initialLevels[index] ?? 0, startAt);
        source.connect(stemGain);
        stemGain.connect(this.transportGainNode);
        group.sources.push(source);
        group.stemGains.push(stemGain);
      });
      if (previous && previous.targetLevels.some((level, index) => level !== targetLevels[index])) {
        this.configureGroupIntensity(group, initialLevels, targetLevels);
      }
      group.sources.forEach(source => {
        source.onended = () => this.handleGroupEnded(group);
        source.start(startAt);
      });
      return true;
    } catch (error) {
      this.phraseGroups.delete(phrase.sequence);
      this.teardownGroups([group]);
      this.warn(`Could not schedule gameplay music phrase: ${failureMessage(error)}`);
      return false;
    }
  }

  private previousPhraseGroup(sequence: number): PhraseGroup | null {
    let previous: PhraseGroup | null = null;
    this.phraseGroups.forEach(group => {
      if (group.phrase.sequence < sequence && (!previous || group.phrase.sequence > previous.phrase.sequence)) {
        previous = group;
      }
    });
    return previous;
  }

  private handleGroupEnded(group: PhraseGroup): void {
    if (this.disposed || !this.phraseGroups.has(group.phrase.sequence)) return;
    this.phraseGroups.delete(group.phrase.sequence);
    this.phraseCache.delete(group.phrase.sequence);
    this.teardownGroups([group]);
    if (this.status !== 'playing') return;
    const generation = this.generation;
    const nextSequence = group.phrase.sequence + 2;
    void this.loadAndRetainPhrase(nextSequence, generation).then(phrase => {
      if (!phrase || !this.isCurrent(generation) || this.status !== 'playing') {
        if (this.isCurrent(generation)) this.failFoundation(this.failure ?? {
          message: `Foundation phrase ${nextSequence} unavailable.`,
          retryable: false,
        });
        return;
      }
      if (!this.schedulePhrase(phrase)) {
        this.failFoundation({ message: `Could not schedule Foundation phrase ${nextSequence}.`, retryable: false });
      }
    }).catch(error => {
      if (this.isCurrent(generation)) {
        this.failFoundation({ message: failureMessage(error), retryable: false });
      }
    });
  }

  private scheduleIntensityTransition(): void {
    const now = this.context.currentTime;
    const future = [...this.phraseGroups.values()]
      .filter(group => group.startAt > now)
      .sort((left, right) => left.startAt - right.startAt)[0];
    if (!future) return;
    const current = [...this.phraseGroups.values()]
      .filter(group => group.startAt <= now)
      .sort((left, right) => right.startAt - left.startAt)[0];
    const from = current ? this.effectiveLevels(current, now) : future.initialLevels;
    this.configureGroupIntensity(future, from, levelsFor(this.desiredIntensity));
  }

  private effectiveLevels(group: PhraseGroup, atTime: number): number[] {
    if (atTime >= group.transitionEndAt || group.transitionEndAt <= group.startAt) {
      return [...group.targetLevels];
    }
    const progress = Math.max(0, Math.min(1,
      (atTime - group.startAt) / (group.transitionEndAt - group.startAt)));
    return group.targetLevels.map((target, index) => (
      (group.initialLevels[index] ?? 0) + (target - (group.initialLevels[index] ?? 0)) * progress
    ));
  }

  private configureGroupIntensity(group: PhraseGroup, from: number[], target: number[]): void {
    const transitionEndAt = group.startAt + 2 * 60 / MUSIC_BPM;
    group.initialLevels = [...from];
    group.targetLevels = [...target];
    group.transitionEndAt = transitionEndAt;
    group.stemGains.forEach((gain, index) => {
      const param = gain.gain;
      param.cancelScheduledValues(this.context.currentTime);
      param.setValueAtTime(from[index] ?? 0, group.startAt);
      const targetValue = target[index] ?? 0;
      if (targetValue !== (from[index] ?? 0)) param.linearRampToValueAtTime(targetValue, transitionEndAt);
    });
  }

  private failFoundation(failure: TransportFailure): void {
    if (this.disposed) return;
    this.failure = failure;
    ++this.generation;
    this.abortController?.abort();
    this.abortController = null;
    this.startPromise = null;
    this.phraseLoads.clear();
    this.phraseCache.clear();
    const groups = [...this.phraseGroups.values()];
    this.phraseGroups.clear();
    this.status = 'failed';
    this.warn(`Rendered gameplay music Foundation unavailable. ${failure.message}`);
    if (groups.length === 0) {
      this.setTransportGain(0);
      return;
    }
    this.rampTransport(0);
    this.scheduleGroupTeardown(groups);
  }

  private markPermanentSegment(stemId: string, segmentIndex: number): void {
    if (MUSIC_STEM_IDS.includes(stemId as MusicStemId)) this.permanentSegments.add(`${stemId}:${segmentIndex}`);
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation && this.context.state !== 'closed';
  }

  private rampTransport(target: 0 | 1): void {
    const startAt = this.context.currentTime;
    const endAt = startAt + MUSIC_FADE_MS / 1_000;
    const gain = this.transportGainNode.gain;
    gain.cancelScheduledValues(startAt);
    gain.setValueAtTime(this.transportLevel > 0 ? 1 : 0.0001, startAt);
    if (target === 1) {
      gain.exponentialRampToValueAtTime(1, endAt);
    } else {
      gain.exponentialRampToValueAtTime(0.0001, endAt);
      gain.setValueAtTime(0, endAt);
    }
    this.transportLevel = target;
  }

  private setTransportGain(value: 0 | 1): void {
    const gain = this.transportGainNode.gain;
    gain.cancelScheduledValues(this.context.currentTime);
    gain.setValueAtTime(value, this.context.currentTime);
    this.transportLevel = value;
  }

  private scheduleGroupTeardown(groups: readonly PhraseGroup[]): void {
    this.cancelCleanupTimer();
    this.pendingCleanupGroups = [...groups];
    this.cleanupTimer = setTimeout(() => {
      this.cleanupTimer = null;
      const pending = this.pendingCleanupGroups;
      this.pendingCleanupGroups = [];
      this.teardownGroups(pending);
    }, MUSIC_FADE_MS + 25);
  }

  private teardownGroups(groups: readonly PhraseGroup[]): void {
    groups.forEach(group => {
      group.sources.forEach(source => {
        source.onended = null;
        try {
          source.stop();
        } catch {
          // The source may have ended during cleanup.
        }
        source.disconnect();
        source.buffer = null;
      });
      group.stemGains.forEach(gain => gain.disconnect());
      group.sources.length = 0;
      group.stemGains.length = 0;
    });
  }

  private cancelCleanupTimer(): void {
    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.pendingCleanupGroups.length === 0) return;
    const pending = this.pendingCleanupGroups;
    this.pendingCleanupGroups = [];
    this.teardownGroups(pending);
  }
}
