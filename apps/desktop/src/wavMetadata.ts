export interface WavMetadata {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
}

export function parseWavMetadata(
  payload: ArrayBuffer,
  requirements: { channels?: number; sampleRate?: number } = {},
): WavMetadata {
  const bytes = new Uint8Array(payload);
  const view = new DataView(payload);
  const hasTag = (offset: number, tag: string) => (
    offset + 4 <= bytes.length
    && tag.split('').every((character, index) => bytes[offset + index] === character.charCodeAt(0))
  );

  if (payload.byteLength < 12 || !hasTag(0, 'RIFF') || !hasTag(8, 'WAVE')) {
    throw new Error('Invalid RIFF/WAVE header');
  }

  const riffSize = view.getUint32(4, true);
  const riffEnd = 8 + riffSize;
  if (riffSize < 4 || riffEnd > payload.byteLength || riffEnd < 12) {
    throw new Error('Invalid RIFF/WAVE bounds');
  }

  let format: Omit<WavMetadata, 'dataOffset' | 'dataSize'> | null = null;
  let dataOffset: number | null = null;
  let dataSize: number | null = null;

  for (let offset = 12; offset < riffEnd;) {
    if (riffEnd - offset < 8) throw new Error('Truncated RIFF chunk header');
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    const paddedChunkSize = chunkSize + (chunkSize % 2);
    if (paddedChunkSize > riffEnd - chunkDataOffset) {
      throw new Error('Truncated RIFF chunk data');
    }

    if (hasTag(offset, 'fmt ')) {
      if (chunkSize < 16) throw new Error('Invalid WAV fmt chunk');
      const audioFormat = view.getUint16(chunkDataOffset, true);
      const channels = view.getUint16(chunkDataOffset + 2, true);
      const sampleRate = view.getUint32(chunkDataOffset + 4, true);
      const byteRate = view.getUint32(chunkDataOffset + 8, true);
      const blockAlign = view.getUint16(chunkDataOffset + 12, true);
      const bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
      if (!audioFormat || !channels || !sampleRate || !byteRate || !blockAlign || !bitsPerSample) {
        throw new Error('Invalid WAV fmt chunk');
      }
      format = {
        audioFormat,
        channels,
        sampleRate,
        byteRate,
        blockAlign,
        bitsPerSample,
      };
    }

    if (hasTag(offset, 'data')) {
      if (chunkSize === 0) throw new Error('Empty WAV data chunk');
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
    }

    offset = chunkDataOffset + paddedChunkSize;
  }

  if (!format) throw new Error('Missing WAV fmt chunk');
  if (dataOffset === null || dataSize === null) throw new Error('Missing WAV data chunk');
  if (requirements.channels !== undefined && format.channels !== requirements.channels) {
    throw new Error(`Expected ${requirements.channels} WAV channels, got ${format.channels}`);
  }
  if (requirements.sampleRate !== undefined && format.sampleRate !== requirements.sampleRate) {
    throw new Error(`Expected ${requirements.sampleRate} Hz WAV, got ${format.sampleRate} Hz`);
  }

  return { ...format, dataOffset, dataSize };
}
