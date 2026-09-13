import { app, BrowserWindow } from 'electron';
import { parseWavMetadata, type WavMetadata } from './wavMetadata';

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
        const result: unknown = await window.webContents.executeJavaScript(
          `(${inspectGameplayAudioAssets.toString()})(${parseWavMetadata.toString()})`,
        );
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

// Runs inside the packaged renderer through its registered app:// handler.
// It proves shipped MIME types and Web Audio decoding; it does not replace listening acceptance.
async function inspectGameplayAudioAssets(
  parseWavMetadata: (payload: ArrayBuffer, requirements?: { channels?: number; sampleRate?: number }) => WavMetadata,
) {
  const musicPath = '/audio/music/own-the-block-main-theme-loop.wav';
  const sfxPaths = [
    '/audio/sfx/dice/dice-shake-01.ogg',
    '/audio/sfx/dice/dice-shake-02.ogg',
    '/audio/sfx/dice/dice-shake-03.ogg',
    '/audio/sfx/dice/dice-impact-01.ogg',
    '/audio/sfx/dice/dice-impact-02.ogg',
    '/audio/sfx/dice/dice-impact-03.ogg',
    '/audio/sfx/movement/movement-land-01.ogg',
    '/audio/sfx/movement/movement-land-02.ogg',
    '/audio/sfx/movement/movement-land-03.ogg',
    '/audio/sfx/money/money-receive-01.ogg',
    '/audio/sfx/money/money-receive-02.ogg',
    '/audio/sfx/money/money-receive-03.ogg',
    '/audio/sfx/money/money-pay-01.ogg',
    '/audio/sfx/property/property-purchase-01.ogg',
    '/audio/sfx/property/property-purchase-02.ogg',
    '/audio/sfx/build/build-house-01.ogg',
    '/audio/sfx/build/build-house-02.ogg',
    '/audio/sfx/build/build-hotel-01.ogg',
    '/audio/sfx/build/build-hotel-02.ogg',
    '/audio/sfx/card/card-draw-01.ogg',
    '/audio/sfx/card/card-draw-02.ogg',
    '/audio/sfx/card/card-draw-03.ogg',
    '/audio/sfx/jail/jail-enter-01.ogg',
    '/audio/sfx/jail/jail-release-01.ogg',
    '/audio/sfx/bankruptcy/bankruptcy-01.ogg',
  ];
  const context = new AudioContext();
  try {
    const getAudio = async (
      path: string,
      contentType: string,
      sourceValidator?: (payload: ArrayBuffer) => WavMetadata,
    ) => {
      const url = new URL(path, location.href).href;
      const response = await fetch(url);
      const actualContentType = response.headers.get('content-type')?.split(';')[0];
      if (response.status !== 200 || actualContentType !== contentType) {
        throw new Error(`${url}: HTTP ${String(response.status)}, Content-Type ${String(actualContentType)}`);
      }
      const payload = await response.arrayBuffer();
      if (payload.byteLength === 0) throw new Error(`${url}: empty audio payload`);
      const sourceMetadata = sourceValidator?.(payload);
      const buffer = await context.decodeAudioData(payload.slice(0));
      if (buffer.numberOfChannels < 1 || buffer.length === 0) throw new Error(`${url}: invalid decoded audio`);
      return { buffer, sourceMetadata };
    };

    const music = await getAudio(
      musicPath,
      'audio/wav',
      payload => parseWavMetadata(payload, { channels: 2, sampleRate: 48_000 }),
    );
    if (!music.sourceMetadata || music.buffer.duration <= 0) {
      throw new Error(`${musicPath}: expected valid source WAV and decoded audio`);
    }
    const source = context.createBufferSource();
    source.buffer = music.buffer;
    source.loop = true;
    source.connect(context.destination);
    try {
      source.start();
      source.stop(context.currentTime + 0.01);
    } catch (error) {
      throw new Error(`${musicPath}: loop source start/stop failed`, { cause: error });
    }

    for (const path of sfxPaths) await getAudio(path, 'audio/ogg');
    return {
      pass: true,
      status: 'PASS AUDIO ASSETS PRESENT',
      checks: {
        'source-wav-format': {
          validRiffWave: true,
          channels: music.sourceMetadata.channels,
          sampleRate: music.sourceMetadata.sampleRate,
          dataBytes: music.sourceMetadata.dataSize,
        },
        'web-audio-decoding': {
          httpStatus: 200,
          contentType: 'audio/wav',
          nonEmptyPayload: true,
          decoded: true,
          channels: music.buffer.numberOfChannels,
          frames: music.buffer.length,
        },
        'loop-source-creation': {
          created: true,
          loop: source.loop,
          startedStopped: true,
        },
        'sfx-ogg-mime-and-decode': true,
        'expected-sfx-count': sfxPaths.length,
      },
      audiblePlayback: 'PENDING HUMAN ACCEPTANCE',
      musicDurationSeconds: music.buffer.duration,
      sfxCount: sfxPaths.length,
    };
  } finally {
    await context.close();
  }
}
