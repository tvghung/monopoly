/**
 * Dependency-free PNG decoding, encoding and pixel comparison for before/after visual checks (Node built-ins only).
 * Decodes 8-bit RGB and RGBA non-interlaced PNGs, which is what Chrome screenshots are.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodePng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG file');
  let offset = 8;
  let header = null;
  const compressed = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0), height: body.readUInt32BE(4), bitDepth: body[8], colorType: body[9], interlace: body[12],
      };
    } else if (type === 'IDAT') {
      compressed.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (!header) throw new Error('PNG has no IHDR');
  if (header.bitDepth !== 8 || header.interlace !== 0 || (header.colorType !== 2 && header.colorType !== 6)) {
    throw new Error(`Unsupported PNG (bit depth ${header.bitDepth}, color type ${header.colorType}, interlace ${header.interlace})`);
  }
  const channels = header.colorType === 6 ? 4 : 3;
  const stride = header.width * channels;
  const raw = inflateSync(Buffer.concat(compressed));
  if (raw.length !== (stride + 1) * header.height) throw new Error('PNG data has an unexpected length');
  const pixels = Buffer.alloc(stride * header.height);
  for (let row = 0; row < header.height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const source = row * (stride + 1) + 1;
    const target = row * stride;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? pixels[target + index - channels] : 0;
      const up = row > 0 ? pixels[target - stride + index] : 0;
      const upLeft = row > 0 && index >= channels ? pixels[target - stride + index - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const distanceLeft = Math.abs(estimate - left);
        const distanceUp = Math.abs(estimate - up);
        const distanceUpLeft = Math.abs(estimate - upLeft);
        predictor = distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft ? left : distanceUp <= distanceUpLeft ? up : upLeft;
      } else if (filter !== 0) {
        throw new Error(`Unknown PNG filter ${filter}`);
      }
      pixels[target + index] = (raw[source + index] + predictor) & 0xff;
    }
  }
  const rgba = new Uint8Array(header.width * header.height * 4);
  for (let pixel = 0; pixel < header.width * header.height; pixel += 1) {
    rgba[pixel * 4] = pixels[pixel * channels];
    rgba[pixel * 4 + 1] = pixels[pixel * channels + 1];
    rgba[pixel * 4 + 2] = pixels[pixel * channels + 2];
    rgba[pixel * 4 + 3] = channels === 4 ? pixels[pixel * channels + 3] : 255;
  }
  return { width: header.width, height: header.height, data: rgba };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, tail]);
}

export function encodePng({ width, height, data }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + row * stride, stride).copy(raw, row * (stride + 1) + 1);
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Pixel comparison. A pixel differs when any of its R, G, B channels differs by more than `tolerance` (0 = exact; alpha is
 * compared too). `meanAbsDelta` is the mean absolute channel difference over all channels, in 0..255.
 */
export function compareImages(left, right, { tolerance = 0 } = {}) {
  if (left.width !== right.width || left.height !== right.height) {
    return {
      comparable: false, identical: false, reason: `size ${left.width}x${left.height} vs ${right.width}x${right.height}`,
    };
  }
  const total = left.width * left.height;
  let differing = 0;
  let maxChannelDelta = 0;
  let sumDelta = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    let pixelMax = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(left.data[pixel * 4 + channel] - right.data[pixel * 4 + channel]);
      sumDelta += delta;
      if (delta > pixelMax) pixelMax = delta;
    }
    if (pixelMax > maxChannelDelta) maxChannelDelta = pixelMax;
    if (pixelMax > tolerance) differing += 1;
  }
  return {
    comparable: true,
    identical: maxChannelDelta === 0,
    width: left.width,
    height: left.height,
    totalPixels: total,
    differingPixels: differing,
    differingRatio: total === 0 ? 0 : differing / total,
    maxChannelDelta,
    meanAbsDelta: total === 0 ? 0 : sumDelta / (total * 4),
  };
}

/** A visual diff: the left image dimmed, with every differing pixel painted red. */
export function diffImage(left, right, { tolerance = 0 } = {}) {
  const data = new Uint8Array(left.width * left.height * 4);
  for (let pixel = 0; pixel < left.width * left.height; pixel += 1) {
    let pixelMax = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      pixelMax = Math.max(pixelMax, Math.abs(left.data[pixel * 4 + channel] - right.data[pixel * 4 + channel]));
    }
    if (pixelMax > tolerance) {
      data.set([255, 0, 0, 255], pixel * 4);
    } else {
      data.set([left.data[pixel * 4] >> 1, left.data[pixel * 4 + 1] >> 1, left.data[pixel * 4 + 2] >> 1, 255], pixel * 4);
    }
  }
  return { width: left.width, height: left.height, data };
}
