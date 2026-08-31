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

export const MUSIC_BPM = 112;
export const MUSIC_BEATS = 96;
export const MUSIC_SECTION_COUNT = 3;
export const MUSIC_LOOP_DURATION_SECONDS = MUSIC_BEATS * 60 / MUSIC_BPM;
const MUSIC_FADE_MS = 220;

const melodySections = [
  [
    [0, 3, 7, -1, 10, 7, 3, 5, 0, 3, 8, 10, 7, 5, 3, -1],
    [0, -1, 5, 7, 10, 7, 5, 3, 0, 3, -1, 8, 10, 8, 5, 3],
    [7, 5, 3, 0, 3, 5, 7, -1, 10, 8, 7, 5, 3, 5, 7, 10],
    [0, 3, 5, 7, 8, 7, 5, 3, -1, 3, 7, 10, 8, 7, 5, -1],
  ],
  [
    [7, 10, 12, 10, 7, 5, 3, 5, 7, 10, 14, 12, 10, 7, 5, 3],
    [7, 10, -1, 12, 14, 12, 10, 7, 5, 7, 10, 12, 14, 12, 10, -1],
    [12, 10, 7, 5, 7, 10, 12, -1, 14, 12, 10, 7, 5, 3, 5, 7],
    [7, 5, 3, 5, 7, -1, 10, 12, 14, 12, 10, 7, 5, 3, -1, 5],
  ],
  [
    [12, 10, 7, 5, 3, 5, 7, 10, 12, 14, 15, 14, 12, 10, 7, 5],
    [12, 14, 15, 14, 12, -1, 10, 12, 14, 15, 14, 12, 10, 7, 5, -1],
    [15, 14, 12, 10, 12, 14, 15, -1, 12, 10, 7, 5, 7, 10, 12, 14],
    [12, 10, 7, -1, 5, 7, 10, 12, 14, 12, 10, 7, 5, 3, 5, -1],
  ],
] as const;

export const MUSIC_MELODY_STRUCTURE = melodySections.map(section => ({
  phraseCount: section.length,
  phraseLengths: section.map(phrase => phrase.length),
  phraseSignatures: section.map(phrase => phrase.join(',')),
  restCounts: section.map(phrase => phrase.filter(note => note < 0).length),
}));

export const MUSIC_TRACK_METADATA = {
  bpm: MUSIC_BPM,
  beats: MUSIC_BEATS,
  durationSeconds: MUSIC_LOOP_DURATION_SECONDS,
  sectionCount: MUSIC_SECTION_COUNT,
  sections: ['A', 'B', 'C'] as const,
  phrasesPerSection: 4,
  eighthNotesPerPhrase: 16,
  eighthNotesPerSection: 64,
};

function deterministicNoise(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

export function createProceduralMusicSamples(sampleRate: number): Float32Array {
  const sampleCount = Math.max(1, Math.floor(sampleRate * MUSIC_LOOP_DURATION_SECONDS));
  // Synthesize at a modest control rate and linearly upsample into the
  // AudioBuffer. This keeps unlock/start cheap on the main thread while the
  // long loop still has a full-rate buffer at the output boundary.
  const renderSampleRate = Math.min(sampleRate, 8_000);
  const renderCount = Math.max(1, Math.floor(renderSampleRate * MUSIC_LOOP_DURATION_SECONDS));
  const rendered = new Float32Array(renderCount);
  const secondsPerBeat = 60 / MUSIC_BPM;
  const eighthNote = secondsPerBeat / 2;
  const rootNotes = [0, 5, 3, 7] as const;

  for (let index = 0; index < renderCount; index += 1) {
    const time = index / renderSampleRate;
    const beat = time / secondsPerBeat;
    const beatIndex = Math.floor(beat);
    const beatPhase = beat - beatIndex;
    const section = Math.min(MUSIC_SECTION_COUNT - 1, Math.floor(beatIndex / 32));
    const barBeat = beatIndex % 32;
    const chord = rootNotes[Math.floor(barBeat / 8) % rootNotes.length];
    const stepIndex = Math.floor(time / eighthNote);
    const stepPhase = (time - stepIndex * eighthNote) / eighthNote;
    const sectionStepIndex = stepIndex % MUSIC_TRACK_METADATA.eighthNotesPerSection;
    const phrase = melodySections[section][
      Math.floor(sectionStepIndex / MUSIC_TRACK_METADATA.eighthNotesPerPhrase)
    ];
    const note = phrase[sectionStepIndex % MUSIC_TRACK_METADATA.eighthNotesPerPhrase];
    const leadEnvelope = note < 0 ? 0 : Math.exp(-stepPhase * 7.5) * Math.min(1, stepPhase * 18);
    const leadFrequency = note < 0 ? 0 : 440 * 2 ** ((note + chord - 9) / 12);
    const lead = leadFrequency === 0
      ? 0
      : (Math.sin(Math.PI * 2 * leadFrequency * time)
        + 0.22 * Math.sin(Math.PI * 4 * leadFrequency * time)) * leadEnvelope * 0.075;

    const bassFrequency = 110 * 2 ** ((chord - 5 + (section === 1 && beatIndex % 8 >= 6 ? 7 : 0)) / 12);
    const bassEnvelope = Math.exp(-beatPhase * 4.5);
    const bass = Math.sin(Math.PI * 2 * bassFrequency * time) * bassEnvelope * 0.09;

    const kick = (beatIndex % 4 === 0 || (section > 0 && beatIndex % 8 === 3))
      ? Math.sin(Math.PI * 2 * (78 - beatPhase * 38) * time) * Math.exp(-beatPhase * 15) * 0.08
      : 0;
    const snarePhase = beatIndex % 4 === 1 || beatIndex % 4 === 3 ? beatPhase : 1;
    const snare = snarePhase < 0.32
      ? deterministicNoise(index) * Math.exp(-snarePhase * 18) * (section === 0 ? 0.018 : 0.027)
      : 0;
    const hatPhase = (time / eighthNote) % 1;
    const hat = hatPhase < 0.12
      ? deterministicNoise(index + 17) * Math.exp(-hatPhase * 28) * (section === 2 ? 0.013 : 0.009)
      : 0;
    const padFrequency = 220 * 2 ** ((chord - 9) / 12);
    const pad = (
      Math.sin(Math.PI * 2 * padFrequency * time)
      + 0.5 * Math.sin(Math.PI * 2 * padFrequency * 1.5 * time)
    ) * 0.018;
    const counter = section === 2
      ? Math.sin(Math.PI * 2 * 659.25 * time) * Math.exp(-((beatPhase - 0.5) ** 2) * 18) * 0.018
      : 0;
    const edgeFade = Math.min(1, time / 0.08, (MUSIC_LOOP_DURATION_SECONDS - time) / 0.08);
    rendered[index] = edgeFade * (lead + bass + kick + snare + hat + pad + counter);
  }
  if (renderSampleRate === sampleRate) return rendered;
  const samples = new Float32Array(sampleCount);
  const scale = renderSampleRate / sampleRate;
  for (let index = 0; index < sampleCount; index += 1) {
    const position = index * scale;
    const left = Math.min(renderCount - 1, Math.floor(position));
    const right = Math.min(renderCount - 1, left + 1);
    const fraction = position - left;
    samples[index] = rendered[left] * (1 - fraction) + rendered[right] * fraction;
  }
  return samples;
}

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
  private resumePromise: Promise<void> | null = null;
  private resumeContext: AudioContext | null = null;
  private pendingInteractionCue: AudioCueId | undefined;
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
    if (cueId) this.pendingInteractionCue = cueId;
    if (this.resumePromise && this.resumeContext === context) return;
    if (context.state === 'running') {
      const pendingCue = this.pendingInteractionCue;
      this.pendingInteractionCue = undefined;
      this.syncMusicLifecycle();
      if (pendingCue) this.startCue(context, pendingCue, {});
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
    this.resumeContext = context;
    void resumePromise.then(() => {
      if (this.disposed || context !== this.context || context.state !== 'running') return;
      const pendingCue = this.pendingInteractionCue;
      this.pendingInteractionCue = undefined;
      this.syncMusicLifecycle();
      if (pendingCue) this.startCue(context, pendingCue, {});
    }).catch(() => {}).finally(() => {
      if (this.resumePromise !== resumePromise) return;
      this.resumePromise = null;
      this.resumeContext = null;
      this.pendingInteractionCue = undefined;
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
    this.resumeContext = null;
    this.pendingInteractionCue = undefined;
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
    buffer.getChannelData(0).set(createProceduralMusicSamples(context.sampleRate));
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
