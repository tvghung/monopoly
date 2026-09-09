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
// Pass B can only report a pending result until Pass C supplies the manifest and chunks.
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
      track: { sampleRate: number };
      stems: Array<{
        id: string;
        segments: Array<{ index: number; file: string; frameCount: number }>;
      }>;
    };
    const isRecord = (value: unknown): value is Record<string, unknown> => (
      typeof value === 'object' && value !== null && !Array.isArray(value)
    );
    const isManifest = (value: unknown): value is RendererMusicManifest => {
      if (!isRecord(value) || !isRecord(value.track) || typeof value.track.sampleRate !== 'number'
        || !Array.isArray(value.stems)) return false;
      return value.stems.every(stem => {
        if (!isRecord(stem) || typeof stem.id !== 'string' || !Array.isArray(stem.segments)) return false;
        return stem.segments.every(segment => isRecord(segment)
          && typeof segment.index === 'number'
          && typeof segment.file === 'string'
          && typeof segment.frameCount === 'number');
      });
    };
    const manifestPayload: unknown = await manifestResponse.json();
    if (!isManifest(manifestPayload) || manifestPayload.stems.length !== 4
      || manifestPayload.track.sampleRate <= 0
      || manifestPayload.stems.some(stem => stem.segments.length !== 16)) {
      throw new Error(`${manifestUrl}: expected four stems`);
    }
    const manifest = manifestPayload;
    const stemIds = new Set(['foundation', 'city', 'wealth', 'competition']);
    if (manifest.stems.some(stem => !stemIds.has(stem.id))
      || new Set(manifest.stems.map(stem => stem.id)).size !== 4) {
      throw new Error(`${manifestUrl}: invalid stem identities`);
    }
    const timelines = new Map<number, {
      sampleRate: number;
      frames: number;
      durationSeconds: number;
    }>();
    let segmentCount = 0;
    for (const stem of manifest.stems) {
      for (const [segmentPosition, segment] of stem.segments.entries()) {
        const prefix = `segments/${stem.id}/`;
        if (segment.index !== segmentPosition
          || !segment.file.startsWith(prefix)
          || !/^[A-Za-z0-9_-]+\.ogg$/.test(segment.file.slice(prefix.length))) {
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
