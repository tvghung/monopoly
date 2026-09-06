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
// Decoding needs no autoplay exemption; audible playback is a separate listening gate.
async function inspectGameplayMusicAssets() {
  const context = new AudioContext();
  const stems = [];
  try {
    for (const id of ['foundation', 'city', 'wealth', 'competition']) {
      const url = new URL(`/audio/music/gameplay/gameplay-${id}.ogg`, location.href).href;
      const response = await fetch(url);
      const contentType = response.headers.get('content-type');
      if (response.status !== 200 || contentType?.split(';')[0] !== 'audio/ogg') {
        throw new Error(`${url}: HTTP ${String(response.status)}, Content-Type ${String(contentType)}`);
      }
      const payload = await response.arrayBuffer();
      if (payload.byteLength === 0) throw new Error(`${url}: empty audio payload`);
      const buffer = await context.decodeAudioData(payload.slice(0));
      if (buffer.numberOfChannels !== 2 || Math.abs(buffer.duration - 256 * 60 / 110) > 0.01) {
        throw new Error(`${url}: invalid stereo 64-bar timeline`);
      }
      const foundation = stems[0];
      if (foundation && (foundation.sampleRate !== buffer.sampleRate || foundation.frames !== buffer.length)) {
        throw new Error(`${url}: decoded timeline differs from Foundation`);
      }
      if (![0, 1].some(channel => buffer.getChannelData(channel).some(sample => sample !== 0))) {
        throw new Error(`${url}: decoded audio is silent`);
      }
      stems.push({
        url,
        contentType,
        bytes: payload.byteLength,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        frames: buffer.length,
        durationSeconds: buffer.duration,
        decodedPcmBytes: buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT,
      });
    }
    return {
      pass: true,
      checks: { 'packaged-app-asset-paths': true, 'ogg-mime-nonempty': true, 'web-audio-decode-timeline': true },
      audiblePlayback: 'PENDING HUMAN ACCEPTANCE',
      stems,
    };
  } finally {
    await context.close();
  }
}
