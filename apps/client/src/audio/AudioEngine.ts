import {
  AUDIO_REGISTRY,
  GAMEPLAY_MUSIC_URL,
  type ProceduralAudioLayer,
  type ProceduralAudioSource,
  type SampleAudioSource,
} from './audioRegistry';
import type {
  AudioCueId,
  AudioMix,
  AudioPlayOptions,
  AudioPort,
  AudioVoiceScope,
} from './types';

export { AUDIO_REGISTRY, GAMEPLAY_MUSIC_URL } from './audioRegistry';

export interface AudioEngineOptions {
  contextFactory?: () => AudioContext | null;
  fetcher?: typeof fetch;
}

interface ActiveVoice {
  cueId: AudioCueId;
  gainNode: GainNode;
  sources: Map<AudioScheduledSourceNode, GainNode | null>;
  scope?: AudioVoiceScope;
  signal?: AbortSignal;
  abortListener?: () => void;
  stopped: boolean;
}

const DEFAULT_MIX: AudioMix = {
  masterGain: 1,
  musicGain: 0.7,
  sfxGain: 0.8,
};
const MUSIC_FADE_MS = 220;

function clampGain(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function defaultContextFactory(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  try {
    const audioSession = typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (audioSession) audioSession.type = 'playback';
  } catch {
    // Optional WebKit API; context creation remains the primary audio path.
  }
  try {
    return new AudioContextConstructor();
  } catch {
    return null;
  }
}

function setAudioParam(param: AudioParam, value: number, atTime: number): void {
  param.cancelScheduledValues(atTime);
  param.setValueAtTime(value, atTime);
}

function cueSeed(cueId: AudioCueId, layerIndex: number): number {
  let seed = 2166136261 ^ layerIndex;
  for (let index = 0; index < cueId.length; index += 1) {
    seed = Math.imul(seed ^ cueId.charCodeAt(index), 16777619);
  }
  return seed >>> 0;
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return typeof DOMException !== 'undefined'
    && error instanceof DOMException
    && error.name === 'AbortError';
}

function isContextClosed(context: AudioContext): boolean {
  return (context.state as string) === 'closed';
}

function warnAudio(message: string): void {
  console.warn(`[AudioEngine] ${message}`);
}

export class AudioEngine implements AudioPort {
  private readonly contextFactory: () => AudioContext | null;
  private readonly fetcher: typeof fetch;
  private context: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private musicGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private mix: AudioMix = { ...DEFAULT_MIX };
  private readonly activeVoices = new Map<AudioCueId, Set<ActiveVoice>>();
  private readonly presentationVoices = new Set<ActiveVoice>();
  private readonly lastStartedAt = new Map<AudioCueId, number>();
  private readonly sampleBuffers = new Map<string, AudioBuffer>();
  private readonly sampleLoads = new Map<string, Promise<AudioBuffer | null>>();
  private readonly failedSamples = new Set<string>();
  private readonly variationIndexes = new Map<AudioCueId, number>();
  private sampleAbortController: AbortController | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicVoiceGainNode: GainNode | null = null;
  private musicStopTimer: ReturnType<typeof setTimeout> | null = null;
  private musicAbortController: AbortController | null = null;
  private musicLoadPromise: Promise<AudioBuffer | null> | null = null;
  private musicGeneration = 0;
  private musicAttempted = false;
  private musicFailureLogged = false;
  private gameActive = false;
  private documentHidden = false;
  private resumePromise: Promise<void> | null = null;
  private pendingInteractionCue: AudioCueId | undefined;
  private retainCount = 0;
  private disposalGeneration = 0;
  private disposed = false;

  public constructor(options: AudioEngineOptions = {}) {
    this.contextFactory = options.contextFactory ?? defaultContextFactory;
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  }

  public setMix(mix: AudioMix): void {
    this.mix = {
      masterGain: clampGain(mix.masterGain),
      musicGain: clampGain(mix.musicGain),
      sfxGain: clampGain(mix.sfxGain),
    };
    this.applyMix();
  }

  public play(cueId: AudioCueId, options: AudioPlayOptions = {}): void {
    if (this.disposed || options.signal?.aborted) return;
    const context = this.context;
    if (!context || context.state !== 'running') return;
    this.startCue(context, cueId, options);
  }

  public setGameActive(active: boolean): void {
    if (this.disposed) return;
    if (active === this.gameActive) {
      if (active) this.syncMusicLifecycle();
      return;
    }
    this.gameActive = active;
    if (!active) {
      this.invalidateMusicLoad();
      this.musicAttempted = false;
      this.stopMusic();
      return;
    }
    this.musicAttempted = false;
    this.syncMusicLifecycle();
  }

  public setDocumentHidden(hidden: boolean): void {
    if (this.disposed || hidden === this.documentHidden) return;
    this.documentHidden = hidden;
    if (hidden) {
      this.invalidateMusicLoad();
      this.musicAttempted = false;
      this.stopMusic();
      return;
    }
    this.musicAttempted = false;
    this.syncMusicLifecycle();
  }

  public stopPresentationVoices(): void {
    [...this.presentationVoices].forEach(voice => this.stopVoice(voice));
  }

  public handleUserInteraction(cueId?: AudioCueId): void {
    if (this.disposed) return;
    const context = this.ensureContext();
    if (!context) return;
    if (cueId) this.pendingInteractionCue = cueId;
    if (context.state === 'running') {
      this.completeInteraction(context);
      return;
    }
    if (context.state === 'closed') {
      this.pendingInteractionCue = undefined;
      return;
    }
    let resumePromise: Promise<void>;
    try {
      resumePromise = context.resume();
    } catch {
      this.pendingInteractionCue = undefined;
      return;
    }
    this.resumePromise = resumePromise;
    void resumePromise.then(() => {
      if (this.disposed || context !== this.context || context.state !== 'running') return;
      this.completeInteraction(context);
    }).catch(() => {}).finally(() => {
      if (this.resumePromise !== resumePromise) return;
      this.resumePromise = null;
      if (context.state !== 'running') this.pendingInteractionCue = undefined;
    });
  }

  public retain(): void {
    if (this.disposed) return;
    this.retainCount += 1;
    this.disposalGeneration += 1;
  }

  public release(): void {
    if (this.retainCount === 0) return;
    this.retainCount -= 1;
    if (this.retainCount !== 0) return;
    const generation = ++this.disposalGeneration;
    queueMicrotask(() => {
      if (this.retainCount === 0 && generation === this.disposalGeneration) this.dispose();
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resumePromise = null;
    this.pendingInteractionCue = undefined;
    this.invalidateMusicLoad();
    this.sampleAbortController?.abort();
    this.sampleAbortController = null;
    this.stopMusic(true);
    this.activeVoices.forEach(voices => {
      [...voices].forEach(voice => this.stopVoice(voice));
    });
    this.activeVoices.clear();
    this.presentationVoices.clear();
    this.lastStartedAt.clear();
    this.sampleBuffers.clear();
    this.sampleLoads.clear();
    this.failedSamples.clear();
    this.musicBuffer = null;
    this.sfxGainNode?.disconnect();
    this.musicGainNode?.disconnect();
    this.masterGainNode?.disconnect();
    const context = this.context;
    this.context = null;
    this.sfxGainNode = null;
    this.musicGainNode = null;
    this.masterGainNode = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => {});
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context?.state === 'closed') {
      this.invalidateMusicLoad();
      this.sampleAbortController?.abort();
      this.sampleAbortController = null;
      this.musicBuffer = null;
      this.sampleBuffers.clear();
      this.sampleLoads.clear();
      this.musicSource = null;
      this.musicVoiceGainNode = null;
      this.clearMusicStopTimer();
      this.context = null;
      this.masterGainNode = null;
      this.musicGainNode = null;
      this.sfxGainNode = null;
    }
    if (this.context) return this.context;
    const context = this.contextFactory();
    if (!context) return null;
    try {
      const masterGainNode = context.createGain();
      const sfxGainNode = context.createGain();
      const musicGainNode = context.createGain();
      sfxGainNode.connect(masterGainNode);
      musicGainNode.connect(masterGainNode);
      masterGainNode.connect(context.destination);
      this.context = context;
      this.masterGainNode = masterGainNode;
      this.sfxGainNode = sfxGainNode;
      this.musicGainNode = musicGainNode;
      this.sampleAbortController = new AbortController();
      this.applyMix();
      return context;
    } catch {
      if (context.state !== 'closed') void context.close().catch(() => {});
      return null;
    }
  }

  private applyMix(): void {
    const context = this.context;
    if (!context) return;
    if (this.masterGainNode) setAudioParam(this.masterGainNode.gain, this.mix.masterGain, context.currentTime);
    if (this.musicGainNode) setAudioParam(this.musicGainNode.gain, this.mix.musicGain, context.currentTime);
    if (this.sfxGainNode) setAudioParam(this.sfxGainNode.gain, this.mix.sfxGain, context.currentTime);
  }

  private completeInteraction(context: AudioContext): void {
    const pendingCue = this.pendingInteractionCue;
    this.pendingInteractionCue = undefined;
    if (pendingCue) this.startCue(context, pendingCue, {});
    this.preloadSamples(context);
    this.syncMusicLifecycle();
  }

  private syncMusicLifecycle(): void {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.gameActive || this.documentHidden) return;
    if (this.musicSource || this.musicStopTimer !== null) return;
    if (this.musicBuffer) {
      this.startMusic(context, this.musicBuffer);
      return;
    }
    if (this.musicLoadPromise || this.musicAttempted) return;
    this.musicAttempted = true;
    this.loadMusic(context);
  }

  private invalidateMusicLoad(): void {
    this.musicGeneration += 1;
    this.musicAbortController?.abort();
    this.musicAbortController = null;
    this.musicLoadPromise = null;
  }

  private loadMusic(context: AudioContext): void {
    const generation = this.musicGeneration;
    const controller = new AbortController();
    this.musicAbortController = controller;
    const load = (async (): Promise<AudioBuffer | null> => {
      try {
        const response = await this.fetcher(GAMEPLAY_MUSIC_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        if (this.context !== context || isContextClosed(context) || this.disposed) return null;
        const buffer = await context.decodeAudioData(data);
        if (this.context !== context || isContextClosed(context) || this.disposed) return null;
        this.musicBuffer = buffer;
        return buffer;
      } catch (error) {
        if (isAbortError(error) || this.musicGeneration !== generation
          || this.context !== context || this.disposed) return null;
        if (!this.musicFailureLogged) {
          this.musicFailureLogged = true;
          warnAudio(`Gameplay music unavailable: ${failureMessage(error)}`);
        }
        return null;
      }
    })();
    this.musicLoadPromise = load;
    void load.then(buffer => {
      if (!buffer || this.musicGeneration !== generation || this.context !== context
        || !this.gameActive || this.documentHidden || context.state !== 'running') return;
      this.startMusic(context, buffer);
    }).catch(() => {}).finally(() => {
      if (this.musicLoadPromise === load) this.musicLoadPromise = null;
      if (this.musicAbortController?.signal === controller.signal) this.musicAbortController = null;
    });
  }

  private startMusic(context: AudioContext, buffer: AudioBuffer): void {
    if (this.disposed || this.musicSource || this.musicStopTimer !== null || !this.musicGainNode) return;
    const voiceGain = context.createGain();
    const source = context.createBufferSource();
    const startAt = context.currentTime;
    const fadeEnd = startAt + MUSIC_FADE_MS / 1_000;
    try {
      voiceGain.gain.setValueAtTime(0.0001, startAt);
      voiceGain.gain.exponentialRampToValueAtTime(1, fadeEnd);
      voiceGain.connect(this.musicGainNode);
      source.buffer = buffer;
      source.loop = true;
      source.connect(voiceGain);
      source.onended = () => this.finishMusicSource(source);
      source.start(startAt);
      this.musicVoiceGainNode = voiceGain;
      this.musicSource = source;
    } catch (error) {
      source.onended = null;
      source.disconnect();
      voiceGain.disconnect();
      warnAudio(`Could not start gameplay music: ${failureMessage(error)}`);
    }
  }

  private stopMusic(immediate = false): void {
    const source = this.musicSource;
    const voiceGain = this.musicVoiceGainNode;
    if (!source || !voiceGain || !this.context) {
      if (immediate) this.clearMusicStopTimer();
      return;
    }
    if (this.musicStopTimer !== null) return;
    if (immediate) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
      source.disconnect();
      voiceGain.disconnect();
      this.musicSource = null;
      this.musicVoiceGainNode = null;
      this.clearMusicStopTimer();
      return;
    }
    const now = this.context.currentTime;
    const endAt = now + MUSIC_FADE_MS / 1_000;
    voiceGain.gain.cancelScheduledValues(now);
    voiceGain.gain.setValueAtTime(Math.max(0.0001, voiceGain.gain.value), now);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    voiceGain.gain.setValueAtTime(0, endAt);
    try {
      source.stop(endAt);
    } catch {
      this.finishMusicSource(source);
      return;
    }
    this.musicStopTimer = setTimeout(() => {
      if (this.musicSource === source) this.finishMusicSource(source);
    }, MUSIC_FADE_MS + 40);
  }

  private finishMusicSource(source: AudioBufferSourceNode): void {
    if (this.musicSource !== source) return;
    source.onended = null;
    source.disconnect();
    this.musicVoiceGainNode?.disconnect();
    this.musicSource = null;
    this.musicVoiceGainNode = null;
    this.clearMusicStopTimer();
    this.syncMusicLifecycle();
  }

  private clearMusicStopTimer(): void {
    if (this.musicStopTimer === null) return;
    clearTimeout(this.musicStopTimer);
    this.musicStopTimer = null;
  }

  private preloadSamples(context: AudioContext): void {
    const urls = new Set<string>();
    Object.values(AUDIO_REGISTRY).forEach(definition => {
      if (definition.source.kind === 'sample') {
        definition.source.files.forEach(file => urls.add(file));
      }
    });
    urls.forEach(url => { void this.loadSample(context, url); });
  }

  private loadSample(context: AudioContext, url: string): Promise<AudioBuffer | null> {
    const cached = this.sampleBuffers.get(url);
    if (cached) return Promise.resolve(cached);
    if (this.failedSamples.has(url)) return Promise.resolve(null);
    const existing = this.sampleLoads.get(url);
    if (existing) return existing;
    const signal = this.sampleAbortController?.signal;
    const load = (async (): Promise<AudioBuffer | null> => {
      try {
        const response = await this.fetcher(url, signal ? { signal } : undefined);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        if (this.context !== context || isContextClosed(context) || this.disposed) return null;
        const buffer = await context.decodeAudioData(data);
        if (this.context !== context || isContextClosed(context) || this.disposed) return null;
        this.sampleBuffers.set(url, buffer);
        return buffer;
      } catch (error) {
        if (isAbortError(error) || this.context !== context || isContextClosed(context) || this.disposed) {
          return null;
        }
        this.failedSamples.add(url);
        warnAudio(`SFX sample unavailable (${url}): ${failureMessage(error)}`);
        return null;
      }
    })();
    this.sampleLoads.set(url, load);
    void load.finally(() => {
      if (this.sampleLoads.get(url) === load) this.sampleLoads.delete(url);
    }).catch(() => {});
    return load;
  }

  private selectSampleFile(cueId: AudioCueId, source: SampleAudioSource): string {
    const previous = this.variationIndexes.get(cueId) ?? -1;
    const index = source.files.length === 0 ? 0 : (previous + 1) % source.files.length;
    this.variationIndexes.set(cueId, index);
    return source.files[index] ?? source.files[0] ?? '';
  }

  private startCue(context: AudioContext, cueId: AudioCueId, options: AudioPlayOptions): void {
    const definition = AUDIO_REGISTRY[cueId];
    const active = this.activeVoices.get(cueId) ?? new Set<ActiveVoice>();
    const previousStart = this.lastStartedAt.get(cueId);
    if (previousStart !== undefined
      && (context.currentTime - previousStart) * 1_000 < definition.cooldownMs) return;
    if (active.size >= definition.maxVoices) return;
    const bus = definition.bus === 'sfx' ? this.sfxGainNode : null;
    if (!bus) return;

    const voiceGain = context.createGain();
    const optionGain = options.gain === undefined ? 1 : clampGain(options.gain);
    setAudioParam(voiceGain.gain, definition.gain * optionGain, context.currentTime);
    voiceGain.connect(bus);
    const voice: ActiveVoice = {
      cueId,
      gainNode: voiceGain,
      sources: new Map(),
      ...(options.scope ? { scope: options.scope } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      stopped: false,
    };

    try {
      if (definition.source.kind === 'sample') {
        const url = this.selectSampleFile(cueId, definition.source);
        const buffer = url ? this.sampleBuffers.get(url) : undefined;
        if (buffer) {
          const source = this.createSampleSource(context, voiceGain, buffer);
          voice.sources.set(source, null);
        } else {
          if (url) void this.loadSample(context, url);
          this.createProceduralSources(
            context,
            voiceGain,
            cueId,
            definition.source.proceduralFallback,
            voice,
          );
        }
      } else {
        this.createProceduralSources(context, voiceGain, cueId, definition.source, voice);
      }
    } catch {
      this.stopVoice(voice);
      return;
    }
    if (voice.sources.size === 0) {
      voiceGain.disconnect();
      return;
    }
    active.add(voice);
    this.activeVoices.set(cueId, active);
    if (voice.scope === 'presentation') this.presentationVoices.add(voice);
    this.lastStartedAt.set(cueId, context.currentTime);
    voice.sources.forEach((_envelope, source) => {
      source.onended = () => this.finishSource(voice, source);
    });
    if (options.signal) {
      const abortListener = () => this.stopVoice(voice);
      voice.abortListener = abortListener;
      options.signal.addEventListener('abort', abortListener, { once: true });
    }
  }

  private createProceduralSources(
    context: AudioContext,
    output: GainNode,
    cueId: AudioCueId,
    source: ProceduralAudioSource,
    voice: ActiveVoice,
  ): void {
    source.layers.forEach((layer, layerIndex) => {
      const { source: scheduledSource, envelope } = this.createLayer(
        context,
        output,
        cueId,
        layer,
        layerIndex,
      );
      voice.sources.set(scheduledSource, envelope);
    });
  }

  private createSampleSource(
    context: AudioContext,
    output: GainNode,
    buffer: AudioBuffer,
  ): AudioBufferSourceNode {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    source.connect(output);
    source.start(context.currentTime);
    return source;
  }

  private createLayer(
    context: AudioContext,
    output: GainNode,
    cueId: AudioCueId,
    layer: ProceduralAudioLayer,
    layerIndex: number,
  ): { source: AudioScheduledSourceNode; envelope: GainNode } {
    const startAt = context.currentTime + (layer.offsetMs ?? 0) / 1_000;
    const endAt = startAt + layer.durationMs / 1_000;
    const attackAt = Math.min(endAt, startAt + (layer.attackMs ?? 3) / 1_000);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, layer.level), attackAt);
    envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
    envelope.connect(output);

    if (layer.kind === 'tone') {
      const oscillator = context.createOscillator();
      oscillator.type = layer.waveform;
      oscillator.frequency.setValueAtTime(layer.frequency, startAt);
      if (layer.endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(layer.endFrequency, endAt);
      }
      oscillator.connect(envelope);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.01);
      return { source: oscillator, envelope };
    }

    const sampleCount = Math.max(1, Math.ceil(context.sampleRate * layer.durationMs / 1_000));
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let seed = cueSeed(cueId, layerIndex);
    for (let index = 0; index < samples.length; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[index] = (seed / 0xffffffff) * 2 - 1;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(envelope);
    source.start(startAt);
    source.stop(endAt + 0.01);
    return { source, envelope };
  }

  private finishSource(voice: ActiveVoice, source: AudioScheduledSourceNode): void {
    const envelope = voice.sources.get(source);
    source.onended = null;
    source.disconnect();
    envelope?.disconnect();
    voice.sources.delete(source);
    if (voice.sources.size === 0) this.cleanupVoice(voice);
  }

  private stopVoice(voice: ActiveVoice): void {
    if (voice.stopped) return;
    voice.stopped = true;
    voice.sources.forEach((envelope, source) => {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // The source may already have ended; cleanup below is still required.
      }
      source.disconnect();
      envelope?.disconnect();
    });
    voice.sources.clear();
    this.cleanupVoice(voice);
  }

  private cleanupVoice(voice: ActiveVoice): void {
    if (voice.abortListener && voice.signal) {
      voice.signal.removeEventListener('abort', voice.abortListener);
    }
    voice.gainNode.disconnect();
    const active = this.activeVoices.get(voice.cueId);
    active?.delete(voice);
    if (active?.size === 0) this.activeVoices.delete(voice.cueId);
    if (voice.scope === 'presentation') this.presentationVoices.delete(voice);
  }
}
