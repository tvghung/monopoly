import { AUDIO_REGISTRY, type ProceduralAudioLayer } from './audioRegistry';
import { SegmentedMusicTransport, type SegmentedMusicTransportSnapshot } from './SegmentedMusicTransport';
import type {
  AudioCueId,
  AudioMix,
  AudioPlayOptions,
  AudioPort,
  AudioVoiceScope,
  MusicIntensity,
} from './types';

export {
  calculateMusicIntensityScore,
  deriveMusicIntensity,
  GAMEPLAY_MUSIC_STEMS,
  MUSIC_ASSET_ROOT,
  MUSIC_BEATS_PER_BAR,
  MUSIC_BARS,
  MUSIC_BEATS,
  MUSIC_BPM,
  MUSIC_MANIFEST_URL,
  MUSIC_LOOP_DURATION_SECONDS,
  MUSIC_PHRASE_BEATS,
  MUSIC_SAMPLE_RATE,
  MUSIC_SECTIONS,
  MUSIC_SEGMENT_BARS,
  MUSIC_SEGMENT_COUNT,
  MUSIC_STEM_IDS,
  MUSIC_STEM_LEVELS,
  MUSIC_TOTAL_SOURCE_FRAMES,
  MUSIC_TRACK_METADATA,
  calculateMusicSegmentBoundaries,
  isSafeGameplayMusicSegmentPath,
  musicBoundaryFrame,
  parseGameplayMusicManifest,
} from './music';
export type {
  GameplayMusicManifest,
  GameplayMusicSegment,
  GameplayMusicStem,
  GameplayMusicTrack,
  MusicSegmentBoundary,
  MusicStemId,
} from './music';

export interface AudioEngineOptions {
  contextFactory?: () => AudioContext | null;
  fetcher?: typeof fetch;
}

interface ActiveVoice {
  cueId: AudioCueId;
  gainNode: GainNode;
  sources: Map<AudioScheduledSourceNode, GainNode>;
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

function warnMusic(message: string): void {
  if (import.meta.env.DEV) console.warn(`[AudioEngine] ${message}`);
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
  private musicTransport: SegmentedMusicTransport | null = null;
  private musicIntensity: MusicIntensity = 0;
  private roomActive = false;
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

  public setRoomActive(active: boolean): void {
    if (this.disposed) return;
    const changed = active !== this.roomActive;
    this.roomActive = active;
    if (!active) {
      this.musicTransport?.stop({ roomLeave: true });
      return;
    }
    this.syncMusicLifecycle(changed);
  }

  public setDocumentHidden(hidden: boolean): void {
    if (this.disposed) return;
    if (hidden === this.documentHidden) return;
    this.documentHidden = hidden;
    if (hidden) {
      this.musicTransport?.stop();
      return;
    }
    this.syncMusicLifecycle(true);
  }

  public setMusicIntensity(intensity: MusicIntensity): void {
    if (this.disposed || intensity === this.musicIntensity) return;
    this.musicIntensity = intensity;
    this.musicTransport?.setIntensity(intensity);
  }

  public getMusicTransportSnapshot(): SegmentedMusicTransportSnapshot | null {
    return this.musicTransport?.getDebugSnapshot() ?? null;
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
    // Web Audio queues resume promises. A fresh trusted activation must not be
    // blocked by an older attempt that never settled outside valid activation.
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
    this.musicTransport?.dispose();
    this.musicTransport = null;
    this.activeVoices.forEach(voices => {
      [...voices].forEach(voice => this.stopVoice(voice));
    });
    this.activeVoices.clear();
    this.presentationVoices.clear();
    this.lastStartedAt.clear();
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
      this.musicTransport?.dispose();
      this.musicTransport = null;
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
      this.musicTransport = new SegmentedMusicTransport({
        context,
        output: musicGainNode,
        fetcher: this.fetcher,
        warn: warnMusic,
      });
      this.musicTransport.setIntensity(this.musicIntensity);
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
    this.syncMusicLifecycle(true);
  }

  private syncMusicLifecycle(allowRetry = false): void {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.roomActive || this.documentHidden) return;
    this.musicTransport?.activate(allowRetry);
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
      definition.source.layers.forEach((layer, layerIndex) => {
        const { source, envelope } = this.createLayer(
          context,
          voiceGain,
          cueId,
          layer,
          layerIndex,
        );
        voice.sources.set(source, envelope);
      });
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
      envelope.disconnect();
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
