import { describe, expect, it } from 'vitest';
import { parseWavMetadata } from '../src/wavMetadata';

interface WavOptions {
  channels?: number;
  sampleRate?: number;
  dataSize?: number;
  includeFmt?: boolean;
  fmtSize?: number;
  includeData?: boolean;
  includeJunk?: boolean;
}

function makeWav({
  channels = 2,
  sampleRate = 48_000,
  dataSize = 4,
  includeFmt = true,
  fmtSize = 16,
  includeData = true,
  includeJunk = false,
}: WavOptions = {}): ArrayBuffer {
  const chunks: Uint8Array[] = [];
  const addChunk = (tag: string, data: Uint8Array) => {
    const paddedSize = data.length + (data.length % 2);
    const chunk = new Uint8Array(8 + paddedSize);
    tag.split('').forEach((character, index) => { chunk[index] = character.charCodeAt(0); });
    new DataView(chunk.buffer).setUint32(4, data.length, true);
    chunk.set(data, 8);
    chunks.push(chunk);
  };

  if (includeJunk) addChunk('JUNK', new Uint8Array([1]));
  if (includeFmt) {
    const format = new Uint8Array(fmtSize);
    if (fmtSize >= 16) {
      const view = new DataView(format.buffer);
      view.setUint16(0, 1, true);
      view.setUint16(2, channels, true);
      view.setUint32(4, sampleRate, true);
      view.setUint32(8, channels * 2 * sampleRate, true);
      view.setUint16(12, channels * 2, true);
      view.setUint16(14, 16, true);
    }
    addChunk('fmt ', format);
  }
  if (includeData) addChunk('data', new Uint8Array(dataSize).fill(1));

  const riffSize = 4 + chunks.reduce((size, chunk) => size + chunk.length, 0);
  const output = new Uint8Array(8 + riffSize);
  ['R', 'I', 'F', 'F', 'W', 'A', 'V', 'E'].forEach((character, index) => {
    output[index < 4 ? index : index + 4] = character.charCodeAt(0);
  });
  new DataView(output.buffer).setUint32(4, riffSize, true);
  let offset = 12;
  chunks.forEach(chunk => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output.buffer;
}

describe('parseWavMetadata', () => {
  it('walks standard RIFF chunks and reads stereo 48 kHz metadata', () => {
    expect(parseWavMetadata(makeWav({ includeJunk: true }), { channels: 2, sampleRate: 48_000 }))
      .toMatchObject({ channels: 2, sampleRate: 48_000, dataSize: 4 });
  });

  it('rejects a source with the wrong sample rate', () => {
    expect(() => parseWavMetadata(makeWav({ sampleRate: 44_100 }), { sampleRate: 48_000 }))
      .toThrow('Expected 48000 Hz WAV');
  });

  it('rejects a mono source when stereo is required', () => {
    expect(() => parseWavMetadata(makeWav({ channels: 1 }), { channels: 2 }))
      .toThrow('Expected 2 WAV channels');
  });

  it('rejects missing and invalid fmt chunks', () => {
    expect(() => parseWavMetadata(makeWav({ includeFmt: false }))).toThrow('Missing WAV fmt chunk');
    expect(() => parseWavMetadata(makeWav({ fmtSize: 12 }))).toThrow('Invalid WAV fmt chunk');
  });

  it('rejects missing and empty data chunks', () => {
    expect(() => parseWavMetadata(makeWav({ includeData: false }))).toThrow('Missing WAV data chunk');
    expect(() => parseWavMetadata(makeWav({ dataSize: 0 }))).toThrow('Empty WAV data chunk');
  });

  it('rejects malformed or truncated RIFF input', () => {
    expect(() => parseWavMetadata(new ArrayBuffer(11))).toThrow('Invalid RIFF/WAVE header');
    const valid = makeWav();
    expect(() => parseWavMetadata(valid.slice(0, valid.byteLength - 1))).toThrow('Invalid RIFF/WAVE bounds');
  });
});
