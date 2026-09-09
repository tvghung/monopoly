import { app, BrowserWindow } from 'electron';

export async function runAudioRendererProof(): Promise<unknown> {
  if (!app.isPackaged || !process.argv.includes('--audio-renderer-proof')) {
    throw new Error('Audio renderer proof requires a packaged app and --audio-renderer-proof');
  }
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: false,
    },
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        await window.loadURL('app://own-the-block/index.html');
        const result: unknown = await window.webContents.executeJavaScript(`(${inspectGameplayMusicAssets.toString()})()`);
        return result;
      })(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Audio renderer proof timed out')), 60_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    window.destroy();
  }
}

// Runs inside the real packaged renderer, through its registered app:// handler.
// It proves the shipped manifest, hashes, MIME types, and Web Audio timelines;
// it does not replace human listening or physical-device acceptance.
async function inspectGameplayMusicAssets() {
  const context = new AudioContext();
  try {
    const manifestUrl = new URL('/audio/music/gameplay/gameplay-music.manifest.json', location.href).href;
    const manifestResponse = await fetch(manifestUrl);
    if (manifestResponse.status === 404 || manifestResponse.status === 410) {
      return {
        pass: false,
        status: 'PENDING PRODUCTION ASSETS — PASS C',
        checks: { 'manifest-json': false, 'segment-ogg-mime': false, 'web-audio-decode-timeline': false },
        audiblePlayback: 'PENDING HUMAN ACCEPTANCE',
      };
    }
    const manifestContentType = manifestResponse.headers.get('content-type')?.split(';')[0];
    if (manifestResponse.status !== 200 || manifestContentType !== 'application/json') {
      throw new Error(`${manifestUrl}: HTTP ${String(manifestResponse.status)}, Content-Type ${String(manifestContentType)}`);
    }
    type RendererMusicManifest = {
      schemaVersion: number;
      track: {
        bpm: number;
        beatsPerBar: number;
        bars: number;
        segmentBars: number;
        segmentCount: number;
        sampleRate: number;
        totalFrames: number;
      };
      stems: Array<{
        id: string;
        segments: Array<{
          index: number;
          file: string;
          startFrame: number;
          frameCount: number;
          sha256: string;
        }>;
      }>;
    };
    const isRecord = (value: unknown): value is Record<string, unknown> => (
      typeof value === 'object' && value !== null && !Array.isArray(value)
    );
    const isManifest = (value: unknown): value is RendererMusicManifest => {
      if (!isRecord(value) || typeof value.schemaVersion !== 'number' || !isRecord(value.track)
        || typeof value.track.bpm !== 'number'
        || typeof value.track.beatsPerBar !== 'number'
        || typeof value.track.bars !== 'number'
        || typeof value.track.segmentBars !== 'number'
        || typeof value.track.segmentCount !== 'number'
        || typeof value.track.sampleRate !== 'number'
        || typeof value.track.totalFrames !== 'number'
        || !Array.isArray(value.stems)) return false;
      return value.stems.every(stem => {
        if (!isRecord(stem) || typeof stem.id !== 'string' || !Array.isArray(stem.segments)) return false;
        return stem.segments.every(segment => isRecord(segment)
          && typeof segment.index === 'number'
          && typeof segment.file === 'string'
          && typeof segment.startFrame === 'number'
          && typeof segment.frameCount === 'number'
          && typeof segment.sha256 === 'string');
      });
    };
    const manifestPayload: unknown = await manifestResponse.json();
    if (!isManifest(manifestPayload) || manifestPayload.schemaVersion !== 1
      || manifestPayload.stems.length !== 4
      || manifestPayload.track.bpm !== 110
      || manifestPayload.track.beatsPerBar !== 4
      || manifestPayload.track.bars !== 64
      || manifestPayload.track.segmentBars !== 4
      || manifestPayload.track.segmentCount !== 16
      || manifestPayload.track.sampleRate !== 48000
      || manifestPayload.track.totalFrames !== 6702545
      || manifestPayload.stems.some(stem => stem.segments.length !== 16)) {
      throw new Error(`${manifestUrl}: expected four stems`);
    }
    const manifest = manifestPayload;
    const stemIds = ['foundation', 'city', 'wealth', 'competition'];
    if (manifest.stems.some((stem, index) => stem.id !== stemIds[index])
      || new Set(manifest.stems.map(stem => stem.id)).size !== stemIds.length) {
      throw new Error(`${manifestUrl}: invalid stem identities`);
    }
    const phraseFrames = (index: number) => Math.round(index * 16 * 60 / 110 * 48000);
    const sha256Hex = async (payload: ArrayBuffer) => {
      const digest = await crypto.subtle.digest('SHA-256', payload);
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    };
    const timelines = new Map<number, {
      sampleRate: number;
      frames: number;
      durationSeconds: number;
    }>();
    let segmentCount = 0;
    for (const stem of manifest.stems) {
      for (const [segmentPosition, segment] of stem.segments.entries()) {
        const prefix = `segments/${stem.id}/`;
        const expectedStartFrame = phraseFrames(segmentPosition);
        const expectedEndFrame = phraseFrames(segmentPosition + 1);
        if (segment.index !== segmentPosition
          || segment.startFrame !== expectedStartFrame
          || segment.frameCount !== expectedEndFrame - expectedStartFrame
          || segment.file !== `${prefix}${String(segmentPosition).padStart(2, '0')}.ogg`
          || !/^[a-f0-9]{64}$/.test(segment.sha256)) {
          throw new Error(`${manifestUrl}: unsafe segment path ${segment.file}`);
        }
        const url = new URL(`/audio/music/gameplay/${segment.file}`, location.href).href;
        const response = await fetch(url);
        const contentType = response.headers.get('content-type')?.split(';')[0];
        if (response.status !== 200 || contentType !== 'audio/ogg') {
          throw new Error(`${url}: HTTP ${String(response.status)}, Content-Type ${String(contentType)}`);
        }
        const payload = await response.arrayBuffer();
        if (payload.byteLength === 0) throw new Error(`${url}: empty audio payload`);
        if (await sha256Hex(payload) !== segment.sha256) throw new Error(`${url}: SHA-256 mismatch`);
        const buffer = await context.decodeAudioData(payload.slice(0));
        const expectedDecodedFrames = Math.round(
          (segment.frameCount / manifest.track.sampleRate) * buffer.sampleRate,
        );
        if (buffer.numberOfChannels !== 2 || Math.abs(buffer.length - expectedDecodedFrames) > 1) {
          throw new Error(`${url}: invalid decoded segment frame count`);
        }
        const prior = timelines.get(segment.index);
        if (prior && (prior.sampleRate !== buffer.sampleRate || prior.frames !== buffer.length)) {
          throw new Error(`${url}: decoded timeline differs from its phrase peers`);
        }
        timelines.set(segment.index, {
          sampleRate: buffer.sampleRate,
          frames: buffer.length,
          durationSeconds: buffer.duration,
        });
        segmentCount += 1;
      }
    }
    if (segmentCount !== 64) throw new Error(`${manifestUrl}: expected 64 segments, got ${segmentCount}`);
    return {
      pass: true,
      status: 'PASS C ASSETS PRESENT',
      checks: {
        'manifest-json': true,
        'segment-ogg-mime': true,
        'web-audio-decode-timeline': true,
        'expected-segment-count': segmentCount === 64,
      },
      audiblePlayback: 'PENDING HUMAN ACCEPTANCE',
      segmentCount,
    };
  } finally {
    await context.close();
  }
}
