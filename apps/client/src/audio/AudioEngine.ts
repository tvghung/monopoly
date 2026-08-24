import { AUDIO_REGISTRY, type ProceduralAudioLayer } from './audioRegistry';
import type { AudioCueId, AudioMix, AudioPlayOptions, AudioPort } from './types';

interface AudioEngineOptions {
  contextFactory?: () => AudioContext | null;
}

interface ActiveVoice {
  cueId: AudioCueId;
  gainNode: GainNode;
  sources: Map<AudioScheduledSourceNode, GainNode>;
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
  private readonly lastStartedAt = new Map<AudioCueId, number>();
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
        || !cueId) return;
      this.startCue(context, cueId, {});
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
    this.activeVoices.forEach(voices => {
      [...voices].forEach(voice => this.stopVoice(voice));
    });
    this.activeVoices.clear();
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
  }
}
