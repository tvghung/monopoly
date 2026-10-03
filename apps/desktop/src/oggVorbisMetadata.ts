export interface OggVorbisMetadata {
  channels: number;
  sampleRate: number;
  nominalBitrate: number;
  /** Granule position of the last page: the exact number of frames the stream decodes to. */
  totalFrames: number;
  pages: number;
}

// Reads the facts of a single-stream Ogg Vorbis file that a looping music buffer depends on, from its container
// alone (no decoder). The packaged audio proof serializes this function into the renderer with `toString()`, so it
// must stay self-contained: no imports and no references to outer scope.
export function parseOggVorbisMetadata(
  payload: ArrayBuffer,
  requirements: { channels?: number; sampleRate?: number } = {},
): OggVorbisMetadata {
  const bytes = new Uint8Array(payload);
  const view = new DataView(payload);
  const hasTag = (offset: number, tag: string) => (
    offset + tag.length <= bytes.length
    && tag.split('').every((character, index) => bytes[offset + index] === character.charCodeAt(0))
  );

  let identification: { channels: number; sampleRate: number; nominalBitrate: number } | null = null;
  let serial: number | null = null;
  let totalFrames = -1;
  let endOfStream = false;
  let pages = 0;

  for (let offset = 0; offset < bytes.length;) {
    if (bytes.length - offset < 27 || !hasTag(offset, 'OggS')) throw new Error('Invalid Ogg page header');
    if (bytes[offset + 4] !== 0) throw new Error('Unsupported Ogg stream structure version');
    const headerType = bytes[offset + 5] ?? 0;
    const granuleLow = view.getUint32(offset + 6, true);
    const granuleHigh = view.getUint32(offset + 10, true);
    const pageSerial = view.getUint32(offset + 14, true);
    const segmentCount = bytes[offset + 26] ?? 0;
    const bodyOffset = offset + 27 + segmentCount;
    if (bodyOffset > bytes.length) throw new Error('Truncated Ogg segment table');
    let bodySize = 0;
    for (let segment = 0; segment < segmentCount; segment += 1) bodySize += bytes[offset + 27 + segment] ?? 0;
    if (bodyOffset + bodySize > bytes.length) throw new Error('Truncated Ogg page');

    if (serial === null) serial = pageSerial;
    else if (pageSerial !== serial) throw new Error('Ogg file holds more than one logical stream');

    if (pages === 0) {
      if ((headerType & 0x02) === 0) throw new Error('First Ogg page is not the start of a stream');
      // Vorbis identification header: type 1, "vorbis", version, channels, rate, three bitrates, blocksizes, framing.
      if (bodySize < 30 || bytes[bodyOffset] !== 1 || !hasTag(bodyOffset + 1, 'vorbis')) {
        throw new Error('First Ogg packet is not a Vorbis identification header');
      }
      if (view.getUint32(bodyOffset + 7, true) !== 0) throw new Error('Unsupported Vorbis version');
      const channels = bytes[bodyOffset + 11] ?? 0;
      const sampleRate = view.getUint32(bodyOffset + 12, true);
      if (!channels || !sampleRate || ((bytes[bodyOffset + 29] ?? 0) & 1) === 0) {
        throw new Error('Invalid Vorbis identification header');
      }
      identification = { channels, sampleRate, nominalBitrate: view.getInt32(bodyOffset + 20, true) };
    }

    // An all-ones granule position means that no packet ends on this page.
    if (granuleLow !== 0xffffffff || granuleHigh !== 0xffffffff) totalFrames = granuleHigh * 4294967296 + granuleLow;
    endOfStream = (headerType & 0x04) !== 0;
    pages += 1;
    offset = bodyOffset + bodySize;
  }

  if (!identification) throw new Error('Missing Ogg Vorbis identification header');
  if (!endOfStream) throw new Error('Ogg stream has no end-of-stream page (truncated file)');
  if (totalFrames <= 0) throw new Error('Ogg stream declares no audio frames');
  if (requirements.channels !== undefined && identification.channels !== requirements.channels) {
    throw new Error(`Expected ${requirements.channels} Vorbis channels, got ${identification.channels}`);
  }
  if (requirements.sampleRate !== undefined && identification.sampleRate !== requirements.sampleRate) {
    throw new Error(`Expected ${requirements.sampleRate} Hz Vorbis, got ${identification.sampleRate} Hz`);
  }

  return { ...identification, totalFrames, pages };
}
