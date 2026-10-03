import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOggVorbisMetadata } from '../src/oggVorbisMetadata';

interface PageOptions {
  headerType: number;
  granule: number | null;
  serial: number;
  body: Uint8Array;
}

function makePage({ headerType, granule, serial, body }: PageOptions): Uint8Array {
  // Lacing: 255-byte segments, then a final segment shorter than 255 (possibly 0) that ends the packet.
  const lacing: number[] = [];
  for (let remaining = body.length; ; remaining -= 255) {
    lacing.push(Math.min(remaining, 255));
    if (remaining < 255) break;
  }
  const page = new Uint8Array(27 + lacing.length + body.length);
  const view = new DataView(page.buffer);
  'OggS'.split('').forEach((character, index) => { page[index] = character.charCodeAt(0); });
  page[5] = headerType;
  if (granule === null) {
    view.setUint32(6, 0xffffffff, true);
    view.setUint32(10, 0xffffffff, true);
  } else {
    view.setUint32(6, granule % 4294967296, true);
    view.setUint32(10, Math.floor(granule / 4294967296), true);
  }
  view.setUint32(14, serial, true);
  page[26] = lacing.length;
  page.set(lacing, 27);
  page.set(body, 27 + lacing.length);
  return page;
}

function identificationHeader(channels: number, sampleRate: number, nominalBitrate = 160_000): Uint8Array {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  header[0] = 1;
  'vorbis'.split('').forEach((character, index) => { header[1 + index] = character.charCodeAt(0); });
  view.setUint32(7, 0, true);
  header[11] = channels;
  view.setUint32(12, sampleRate, true);
  view.setInt32(16, -1, true);
  view.setInt32(20, nominalBitrate, true);
  view.setInt32(24, -1, true);
  header[28] = 0xb8;
  header[29] = 1;
  return header;
}

function concat(parts: Uint8Array[]): ArrayBuffer {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output.buffer;
}

function makeOgg({
  channels = 2,
  sampleRate = 48_000,
  frames = 6_781_091,
  serial = 7,
  endOfStream = true,
}: { channels?: number; sampleRate?: number; frames?: number; serial?: number; endOfStream?: boolean } = {}): Uint8Array[] {
  return [
    makePage({ headerType: 0x02, granule: 0, serial, body: identificationHeader(channels, sampleRate) }),
    makePage({ headerType: 0x00, granule: null, serial, body: new Uint8Array(600).fill(3) }),
    makePage({ headerType: 0x00, granule: Math.floor(frames / 2), serial, body: new Uint8Array(40).fill(5) }),
    makePage({ headerType: endOfStream ? 0x04 : 0x00, granule: frames, serial, body: new Uint8Array(20).fill(9) }),
  ];
}

describe('parseOggVorbisMetadata', () => {
  it('reads channels, rate, nominal bitrate and the declared frame count of the last page', () => {
    const metadata = parseOggVorbisMetadata(concat(makeOgg()), { channels: 2, sampleRate: 48_000 });
    expect(metadata).toEqual({
      channels: 2,
      sampleRate: 48_000,
      nominalBitrate: 160_000,
      totalFrames: 6_781_091,
      pages: 4,
    });
  });

  it('keeps frame counts above 32 bits exact', () => {
    expect(parseOggVorbisMetadata(concat(makeOgg({ frames: 5_000_000_000 }))).totalFrames).toBe(5_000_000_000);
  });

  it('rejects a stream with the wrong channel count or sample rate', () => {
    expect(() => parseOggVorbisMetadata(concat(makeOgg({ sampleRate: 44_100 })), { sampleRate: 48_000 }))
      .toThrow('Expected 48000 Hz Vorbis, got 44100 Hz');
    expect(() => parseOggVorbisMetadata(concat(makeOgg({ channels: 1 })), { channels: 2 }))
      .toThrow('Expected 2 Vorbis channels, got 1');
  });

  it('rejects data that is not a single complete Ogg Vorbis stream', () => {
    expect(() => parseOggVorbisMetadata(new ArrayBuffer(10))).toThrow('Invalid Ogg page header');
    expect(() => parseOggVorbisMetadata(new TextEncoder().encode('RIFF'.repeat(20)).buffer)).toThrow('Invalid Ogg page header');

    const valid = new Uint8Array(concat(makeOgg()));
    expect(() => parseOggVorbisMetadata(valid.slice(0, valid.length - 1).buffer)).toThrow('Truncated Ogg page');
    expect(() => parseOggVorbisMetadata(concat(makeOgg({ endOfStream: false })))).toThrow('no end-of-stream page');

    const [identification, ...rest] = makeOgg();
    const notStart = identification?.slice() ?? new Uint8Array();
    notStart[5] = 0x00;
    expect(() => parseOggVorbisMetadata(concat([notStart, ...rest]))).toThrow('not the start of a stream');

    const opus = identification?.slice() ?? new Uint8Array();
    opus[27 + 1 + 1] = 'x'.charCodeAt(0);
    expect(() => parseOggVorbisMetadata(concat([opus, ...rest]))).toThrow('not a Vorbis identification header');

    const chained = [...makeOgg({ serial: 1 }), ...makeOgg({ serial: 2 })];
    expect(() => parseOggVorbisMetadata(concat(chained))).toThrow('more than one logical stream');
  });
});

describe('shipped gameplay music', () => {
  it('is one stereo 48 kHz Ogg Vorbis loop of exactly 6,781,091 frames (141.27 s)', () => {
    const file = readFileSync(path.resolve(process.cwd(), '../client/public/audio/music/own-the-block-main-theme-loop.ogg'));
    const payload = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const metadata = parseOggVorbisMetadata(payload, { channels: 2, sampleRate: 48_000 });
    // The frame count is the loop length of the production track; a re-encode that adds or drops audio changes it.
    expect(metadata.totalFrames).toBe(6_781_091);
    expect(file.byteLength).toBeLessThan(5 * 1024 * 1024);
  });
});
