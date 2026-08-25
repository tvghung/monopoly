import { AUDIO_REGISTRY, type ProceduralAudioLayer } from './audioRegistry';
import type {
  AudioCueId,
  AudioMix,
  AudioPlayOptions,
  AudioPort,
  AudioVoiceScope,
} from './types';

interface AudioEngineOptions {
  contextFactory?: () => AudioContext | null;
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

const MUSIC_BPM = 100;
const MUSIC_BEATS = 40;
const MUSIC_LOOP_DURATION_SECONDS = MUSIC_BEATS * 60 / MUSIC_BPM;
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

export class AudioEngine implements AudioPort {
  private readonly contextFactory: () => AudioContext | null;
  private context: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private musicGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private mix: AudioMix = { ...DEFAULT_MIX };
  private readonly activeVoices = new Map<AudioCueId, Set<ActiveVoice>>();
  private readonly presentationVoices = new Set<ActiveVoice>();
  private readonly lastStartedAt = new Map<AudioCueId, number>();
  private musicSource: AudioBufferSourceNode | null = null;
  private musicVoiceGainNode: GainNode | null = null;
  private musicStopTimer: ReturnType<typeof setTimeout> | null = null;
  private musicVoiceLevel = 0;
  private roomActive = false;
  private documentHidden = false;
  private interactionGeneration = 0;
  private retainCount = 0;
  private disposalGeneration = 0;
  private disposed = false;

  public constructor(options: AudioEngineOptions = {}) {
    this.contextFactory = options.contextFactory ?? defaultContextFactory;
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
    this.roomActive = active;
    if (!active) {
      this.fadeMusicToZero(true);
      return;
    }
    this.syncMusicLifecycle();
  }

  public setDocumentHidden(hidden: boolean): void {
    if (this.disposed) return;
    this.documentHidden = hidden;
    if (hidden) {
      this.fadeMusicToZero(false);
      return;
    }
    this.syncMusicLifecycle();
  }

  public stopPresentationVoices(): void {
    [...this.presentationVoices].forEach(voice => this.stopVoice(voice));
  }

  public handleUserInteraction(cueId?: AudioCueId): void {
    if (this.disposed) return;
    const context = this.ensureContext();
    if (!context) return;
    const generation = ++this.interactionGeneration;
    const playCurrentCue = () => {
      if (this.disposed
        || generation !== this.interactionGeneration
        || context !== this.context
        || context.state !== 'running'
        ) return;
      this.syncMusicLifecycle();
      if (cueId) this.startCue(context, cueId, {});
    };
    if (context.state === 'running') {
      playCurrentCue();
      return;
    }
    if (context.state !== 'suspended') return;
    void context.resume().then(playCurrentCue).catch(() => {});
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
    this.interactionGeneration += 1;
    this.stopMusicImmediately();
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

  private syncMusicLifecycle(): void {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.roomActive || this.documentHidden) return;
    this.startOrResumeMusic(context);
  }

  private startOrResumeMusic(context: AudioContext): void {
    this.clearMusicStopTimer();
    if (this.musicSource) {
      this.rampMusicGain(1, context);
      return;
    }
    if (!this.musicGainNode) return;

    let createdSource: AudioBufferSourceNode | null = null;
    let createdVoiceGain: GainNode | null = null;
    try {
      const source = context.createBufferSource();
      const voiceGain = context.createGain();
      createdSource = source;
      createdVoiceGain = voiceGain;
      source.buffer = this.createMusicBuffer(context);
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = MUSIC_LOOP_DURATION_SECONDS;
      voiceGain.gain.setValueAtTime(0, context.currentTime);
      source.connect(voiceGain);
      voiceGain.connect(this.musicGainNode);
      source.onended = () => this.finishMusicSource(source);
      source.start(context.currentTime);
      this.musicSource = source;
      this.musicVoiceGainNode = voiceGain;
      this.musicVoiceLevel = 0;
      this.rampMusicGain(1, context);
    } catch {
      if (this.musicSource === createdSource) {
        this.musicSource = null;
        this.musicVoiceGainNode = null;
        this.musicVoiceLevel = 0;
      }
      if (createdSource) {
        createdSource.onended = null;
        try {
          createdSource.stop();
        } catch {
          // The source may not have started yet.
        }
        createdSource.disconnect();
      }
      createdVoiceGain?.disconnect();
    }
  }

  private rampMusicGain(target: 0 | 1, context: AudioContext): void {
    const gainNode = this.musicVoiceGainNode;
    if (!gainNode) return;
    const startAt = context.currentTime;
    const endAt = startAt + MUSIC_FADE_MS / 1_000;
    gainNode.gain.cancelScheduledValues(startAt);
    gainNode.gain.setValueAtTime(this.musicVoiceLevel > 0 ? 1 : 0.0001, startAt);
    if (target === 1) {
      gainNode.gain.exponentialRampToValueAtTime(1, endAt);
    } else {
      gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);
      gainNode.gain.setValueAtTime(0, endAt);
    }
    this.musicVoiceLevel = target;
  }

  private fadeMusicToZero(stopWhenDone: boolean): void {
    const source = this.musicSource;
    const context = this.context;
    if (!source || !context || !this.musicVoiceGainNode) return;
    this.clearMusicStopTimer();
    this.rampMusicGain(0, context);
    if (!stopWhenDone) return;
    this.musicStopTimer = setTimeout(() => {
      this.musicStopTimer = null;
      if (!this.roomActive && this.musicSource === source) this.stopMusicSource(source);
    }, MUSIC_FADE_MS + 25);
  }

  private clearMusicStopTimer(): void {
    if (this.musicStopTimer === null) return;
    clearTimeout(this.musicStopTimer);
    this.musicStopTimer = null;
  }

  private stopMusicImmediately(): void {
    this.clearMusicStopTimer();
    if (this.musicSource) this.stopMusicSource(this.musicSource);
    else {
      this.musicVoiceGainNode?.disconnect();
      this.musicVoiceGainNode = null;
      this.musicVoiceLevel = 0;
    }
  }

  private stopMusicSource(source: AudioBufferSourceNode): void {
    if (this.musicSource !== source) return;
    this.clearMusicStopTimer();
    this.musicSource = null;
    const voiceGain = this.musicVoiceGainNode;
    this.musicVoiceGainNode = null;
    this.musicVoiceLevel = 0;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // The source may already have stopped during teardown.
    }
    source.disconnect();
    voiceGain?.disconnect();
  }

  private finishMusicSource(source: AudioBufferSourceNode): void {
    if (this.musicSource !== source) return;
    this.clearMusicStopTimer();
    this.musicSource = null;
    this.musicVoiceGainNode?.disconnect();
    this.musicVoiceGainNode = null;
    this.musicVoiceLevel = 0;
    source.onended = null;
    source.disconnect();
  }

  private createMusicBuffer(context: AudioContext): AudioBuffer {
    const sampleCount = Math.max(
      1,
      Math.floor(context.sampleRate * MUSIC_LOOP_DURATION_SECONDS),
    );
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    const secondsPerBeat = 60 / MUSIC_BPM;
    const pattern = [0, 3, 7, 5, 10, 7, 3, 5] as const;
    const bassPattern = [0, -2, -5, -3, 0, -2, -7, -5] as const;
    const rootFrequency = 220;
    for (let index = 0; index < samples.length; index += 1) {
      const time = index / context.sampleRate;
      const beatIndex = Math.floor(time / secondsPerBeat);
      const beatTime = time - beatIndex * secondsPerBeat;
      const patternIndex = beatIndex % pattern.length;
      const noteFrequency = rootFrequency * 2 ** (pattern[patternIndex] / 12);
      const pluckEnvelope = Math.exp(-beatTime * 8.5);
      const pluck = Math.sin(Math.PI * 2 * noteFrequency * time)
        + 0.32 * Math.sin(Math.PI * 4 * noteFrequency * time);
      const bassFrequency = 110 * 2 ** (bassPattern[Math.floor(beatIndex / 4) % bassPattern.length] / 12);
      const barTime = time - Math.floor(time / (secondsPerBeat * 4)) * secondsPerBeat * 4;
      const bassEnvelope = Math.exp(-barTime * 2.4);
      const pad = Math.sin(Math.PI * 2 * 220 * time)
        + 0.65 * Math.sin(Math.PI * 2 * 277.18 * time);
      const edgeFade = Math.min(1, time / 0.04, (MUSIC_LOOP_DURATION_SECONDS - time) / 0.04);
      samples[index] = edgeFade * (
        pluck * pluckEnvelope * 0.075
        + Math.sin(Math.PI * 2 * bassFrequency * time) * bassEnvelope * 0.08
        + pad * 0.025
      );
    }
    return buffer;
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
