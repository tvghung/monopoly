export const TILE_TEXT_SAFE_WIDTH_RATIO = 0.90;
export const TILE_TEXT_FOOTER_HEIGHT_RATIO = 0.90;
export const TILE_TEXT_LINE_HEIGHT = 1.03;

export const NORMAL_TILE_TEXT_ONE_LINE_SIZE = 0.40;
export const NORMAL_TILE_TEXT_TWO_LINE_SIZE = 0.33;
export const NORMAL_TILE_TEXT_MIN_SIZE = 0.29;
export const SPECIAL_TILE_TEXT_ONE_LINE_SIZE = 0.36;
export const SPECIAL_TILE_TEXT_TWO_LINE_SIZE = 0.30;
export const SPECIAL_TILE_TEXT_MIN_SIZE = 0.29;

/**
 * Normalized advances measured from the local Be Vietnam Pro ExtraBold font.
 * Keeping this small table local makes the board fit deterministic before
 * Troika's asynchronous SDF sync runs.
 */
const BOARD_FONT_ADVANCE_WIDTHS: Readonly<Record<string, number>> = {
  ' ': 0.230,
  '1': 0.446,
  '8': 0.679,
  B: 0.721,
  C: 0.781,
  G: 0.793,
  H: 0.740,
  K: 0.728,
  L: 0.650,
  M: 0.900,
  N: 0.754,
  P: 0.690,
  T: 0.698,
  a: 0.663,
  c: 0.635,
  d: 0.673,
  g: 0.665,
  h: 0.617,
  i: 0.306,
  k: 0.613,
  m: 0.897,
  n: 0.607,
  r: 0.441,
  t: 0.441,
  u: 0.596,
  v: 0.600,
  y: 0.601,
  à: 0.667,
  ê: 0.621,
  í: 0.311,
  ô: 0.660,
  ú: 0.605,
  Đ: 0.783,
  đ: 0.692,
  ơ: 0.678,
  ư: 0.598,
  ậ: 0.667,
  ế: 0.621,
  ễ: 0.621,
  ệ: 0.621,
  ị: 0.311,
  ộ: 0.660,
  ớ: 0.660,
  ủ: 0.605,
  ỹ: 0.601,
  '…': 0.700,
};

const DEFAULT_BOARD_FONT_ADVANCE = 0.62;

export interface TileTextFitOptions {
  value: string;
  desiredLineCount: 1 | 2;
  desiredFontSize: number;
  twoLineFontSize: number;
  minFontSize: number;
  maxWidth: number;
  maxHeight: number;
  lineHeight?: number;
}

export interface TileTextFit {
  value: string;
  fontSize: number;
  lineCount: 1 | 2;
  measuredWidth: number;
  measuredHeight: number;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function getAdvanceWidth(character: string): number {
  return BOARD_FONT_ADVANCE_WIDTHS[character] ?? DEFAULT_BOARD_FONT_ADVANCE;
}

export function estimateBoardTextWidth(value: string, fontSize: number): number {
  const lines = value.split(/\r?\n/);
  return Math.max(
    0,
    ...lines.map(line => Array.from(line).reduce(
      (total, character) => total + getAdvanceWidth(character),
      0,
    ) * fontSize),
  );
}

export function getBoardTextHeight(
  fontSize: number,
  lineCount: 1 | 2,
  lineHeight = TILE_TEXT_LINE_HEIGHT,
): number {
  return fontSize * lineHeight * lineCount;
}

export function getTwoLineCandidates(value: string): {
  word: readonly string[];
  character: readonly string[];
} {
  const normalized = normalizeText(value);
  const words = normalized.split(' ').filter(Boolean);
  const wordCandidates: string[] = [];
  for (let index = 1; index < words.length; index += 1) {
    wordCandidates.push([
      words.slice(0, index).join(' '),
      words.slice(index).join(' '),
    ].join('\n'));
  }

  const characterCandidates: string[] = [];
  const characters = Array.from(normalized);
  for (let index = 1; index < characters.length; index += 1) {
    const first = characters.slice(0, index).join('').trimEnd();
    const second = characters.slice(index).join('').trimStart();
    if (first && second) characterCandidates.push(`${first}\n${second}`);
  }

  return {
    word: [...new Set(wordCandidates)],
    character: [...new Set(characterCandidates)],
  };
}

export function getPreferredTwoLineValue(value: string): string {
  const normalized = normalizeText(value);
  const candidates = getTwoLineCandidates(normalized);
  const preferred = candidates.word.length > 0 ? candidates.word : candidates.character;
  if (preferred.length === 0) return normalized;
  const targetLength = normalized.length / 2;
  return [...preferred].sort((left, right) => (
    Math.abs(left.split('\n')[0].length - targetLength)
      - Math.abs(right.split('\n')[0].length - targetLength)
  ))[0] ?? normalized;
}

function roundFontSize(value: number): number {
  return Math.round(value * 100) / 100;
}

function getFontSizes(start: number, minimum: number): readonly number[] {
  const sizes: number[] = [];
  for (let size = roundFontSize(start); size >= minimum - 0.0001; size = roundFontSize(size - 0.01)) {
    sizes.push(size);
  }
  return sizes;
}

function chooseFittingCandidate(
  candidates: readonly string[],
  fontSize: number,
  maxWidth: number,
  maxHeight: number,
  lineHeight: number,
): TileTextFit | null {
  const fits = candidates.map(value => {
    const lineCount: 1 | 2 = value.includes('\n') ? 2 : 1;
    return {
      value,
      fontSize,
      lineCount,
      measuredWidth: estimateBoardTextWidth(value, fontSize),
      measuredHeight: getBoardTextHeight(fontSize, lineCount, lineHeight),
    } satisfies TileTextFit;
  }).filter(candidate => (
    candidate.measuredWidth <= maxWidth + 0.0001
      && candidate.measuredHeight <= maxHeight + 0.0001
  ));
  if (fits.length === 0) return null;
  return [...fits].sort((left, right) => {
    const leftLines = left.value.split('\n').map(line => estimateBoardTextWidth(line, fontSize));
    const rightLines = right.value.split('\n').map(line => estimateBoardTextWidth(line, fontSize));
    const leftBalance = leftLines.length === 2 ? Math.abs(leftLines[0] - leftLines[1]) : 0;
    const rightBalance = rightLines.length === 2 ? Math.abs(rightLines[0] - rightLines[1]) : 0;
    return left.measuredWidth - right.measuredWidth + (leftBalance - rightBalance) * 0.06;
  })[0] ?? null;
}

function fitTwoLines(
  value: string,
  startFontSize: number,
  minimumFontSize: number,
  maxWidth: number,
  maxHeight: number,
  lineHeight: number,
): TileTextFit | null {
  const candidates = getTwoLineCandidates(value);
  const groups = [candidates.word, candidates.character].filter(group => group.length > 0);
  for (const group of groups) {
    for (const fontSize of getFontSizes(startFontSize, minimumFontSize)) {
      const fitting = chooseFittingCandidate(group, fontSize, maxWidth, maxHeight, lineHeight);
      if (fitting) return fitting;
    }
  }
  return null;
}

function truncateLineToWidth(value: string, fontSize: number, maxWidth: number): string {
  const normalized = value.trim();
  if (estimateBoardTextWidth(normalized, fontSize) <= maxWidth + 0.0001) return normalized;
  const ellipsis = '…';
  let prefix = '';
  for (const character of Array.from(normalized)) {
    const next = `${prefix}${character}`;
    if (estimateBoardTextWidth(`${next}${ellipsis}`, fontSize) > maxWidth + 0.0001) break;
    prefix = next;
  }
  return prefix.trimEnd() ? `${prefix.trimEnd()}${ellipsis}` : ellipsis;
}

function getTruncatedTwoLineValue(value: string, fontSize: number, maxWidth: number): string {
  const normalized = normalizeText(value);
  const characters = Array.from(normalized);
  const candidates = characters.slice(1).map((_, index) => {
    const splitIndex = index + 1;
    const first = truncateLineToWidth(
      characters.slice(0, splitIndex).join(''),
      fontSize,
      maxWidth,
    );
    const second = truncateLineToWidth(
      characters.slice(splitIndex).join(''),
      fontSize,
      maxWidth,
    );
    const retainedCharacters = `${first}${second}`.replace(/…/g, '').replace(/\s/g, '').length;
    const balance = Math.abs(splitIndex - characters.length / 2);
    return { value: `${first}\n${second}`, retainedCharacters, balance };
  });
  return [...candidates].sort((left, right) => (
    right.retainedCharacters - left.retainedCharacters || left.balance - right.balance
  ))[0]?.value ?? `${'…'}\n${'…'}`;
}

export function fitTileText(options: TileTextFitOptions): TileTextFit {
  const value = normalizeText(options.value);
  const lineHeight = options.lineHeight ?? TILE_TEXT_LINE_HEIGHT;
  const minimumFontSize = Math.min(options.minFontSize, options.desiredFontSize);
  const oneLine = chooseFittingCandidate(
    [value],
    options.desiredFontSize,
    options.maxWidth,
    options.maxHeight,
    lineHeight,
  );
  if (options.desiredLineCount === 1 && oneLine) return oneLine;

  if (options.desiredLineCount === 1) {
    for (const fontSize of getFontSizes(options.desiredFontSize, minimumFontSize).slice(1)) {
      const fitting = chooseFittingCandidate(
        [value],
        fontSize,
        options.maxWidth,
        options.maxHeight,
        lineHeight,
      );
      if (fitting) return fitting;
    }
  }

  const twoLine = fitTwoLines(
    value,
    options.twoLineFontSize,
    minimumFontSize,
    options.maxWidth,
    options.maxHeight,
    lineHeight,
  );
  if (twoLine) return twoLine;

  const fallbackValue = getTruncatedTwoLineValue(value, minimumFontSize, options.maxWidth);
  const fallbackLineCount = fallbackValue.includes('\n') ? 2 : 1;
  return {
    value: fallbackValue,
    fontSize: minimumFontSize,
    lineCount: fallbackLineCount,
    measuredWidth: estimateBoardTextWidth(fallbackValue, minimumFontSize),
    measuredHeight: getBoardTextHeight(minimumFontSize, fallbackLineCount, lineHeight),
  };
}
