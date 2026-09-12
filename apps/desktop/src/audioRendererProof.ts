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
        const result: unknown = await window.webContents.executeJavaScript(
          `(${inspectGameplayAudioAssets.toString()})()`,
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
async function inspectGameplayAudioAssets() {
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
    '/audio/sfx/card/card-reveal-01.ogg',
    '/audio/sfx/card/card-reveal-02.ogg',
    '/audio/sfx/jail/jail-enter-01.ogg',
    '/audio/sfx/jail/jail-release-01.ogg',
    '/audio/sfx/bankruptcy/bankruptcy-01.ogg',
  ];
  const context = new AudioContext();
  try {
    const getAudio = async (path: string, contentType: string) => {
      const url = new URL(path, location.href).href;
      const response = await fetch(url);
      const actualContentType = response.headers.get('content-type')?.split(';')[0];
      if (response.status !== 200 || actualContentType !== contentType) {
        throw new Error(`${url}: HTTP ${String(response.status)}, Content-Type ${String(actualContentType)}`);
      }
      const payload = await response.arrayBuffer();
      if (payload.byteLength === 0) throw new Error(`${url}: empty audio payload`);
      const buffer = await context.decodeAudioData(payload.slice(0));
      if (buffer.numberOfChannels < 1 || buffer.length === 0) throw new Error(`${url}: invalid decoded audio`);
      return buffer;
    };

    const music = await getAudio(musicPath, 'audio/wav');
    if (music.numberOfChannels !== 2 || music.sampleRate !== 48000 || music.duration <= 0) {
      throw new Error(`${musicPath}: expected non-empty stereo 48 kHz music`);
    }
    const source = context.createBufferSource();
    source.buffer = music;
    source.loop = true;
    source.connect(context.destination);
    source.start();
    source.stop(context.currentTime + 0.01);

    for (const path of sfxPaths) await getAudio(path, 'audio/ogg');
    return {
      pass: true,
      status: 'PASS AUDIO ASSETS PRESENT',
      checks: {
        'music-wav-mime': true,
        'music-web-audio-decode': true,
        'music-loop-source': source.loop,
        'sfx-ogg-mime-and-decode': true,
        'expected-sfx-count': sfxPaths.length,
      },
      audiblePlayback: 'PENDING HUMAN ACCEPTANCE',
      musicDurationSeconds: music.duration,
      sfxCount: sfxPaths.length,
    };
  } finally {
    await context.close();
  }
}
