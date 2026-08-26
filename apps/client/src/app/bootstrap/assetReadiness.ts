import type {
  CharacterId,
  PlayerColorId,
  RoomPlayerMeta,
} from '@monopoly/shared';
import cursorUrl from '../../cursor.png?url';
import { BOARD_FONT_FAMILY, BOARD_FONT_URL, BOARD_FONT_WEIGHT } from '../../design-system/typography/gameFonts';
import { getCharacterDefinition } from '../../game/characters/characterRegistry';
import {
  preloadCharacterTexture,
} from '../../game/characters/characterTextureCache';
import {
  BOARD_SVG_TILE_ICON_ASSETS,
  type BoardSvgTileIconKind,
} from '../../game/scene/special/boardIconAssets';
import { preloadSharedSvgImage } from '../../game/scene/special/RaisedSvgTileIcon';

export const DEFAULT_ASSET_TIMEOUT_MS = 8_000;

export type AssetClassification =
  | 'critical-global'
  | 'critical-gameplay'
  | 'deferred/optional';

export type AssetFailurePolicy = 'block' | 'fallback' | 'optional';

export interface AssetProgress {
  loaded: number;
  total: number;
  failed: number;
  currentAssetId: string | null;
  currentAssetLabel: string | null;
}

export interface AssetLoadContext {
  timeoutMs: number;
  signal: AbortSignal;
  onCancel(cleanup: () => void): () => void;
}

export interface AssetLoadResult {
  release?: () => void;
}

export interface AssetDescriptor {
  id: string;
  label: string;
  classification: AssetClassification;
  failurePolicy: AssetFailurePolicy;
  fallback?: string;
  load: (context: AssetLoadContext) => Promise<AssetLoadResult | void>;
}

export interface AssetFailure {
  id: string;
  label: string;
  classification: AssetClassification;
  failurePolicy: AssetFailurePolicy;
  fallback?: string;
  cause: unknown;
}

export interface AssetPreloadReport {
  progress: AssetProgress;
  failures: readonly AssetFailure[];
  release: () => void;
}

export interface AssetPreloadOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: AssetProgress) => void;
}

export class AssetReadinessError extends Error {
  public constructor(
    public readonly failures: readonly AssetFailure[],
    public readonly progress: AssetProgress,
  ) {
    super('Critical asset readiness failed.');
    this.name = 'AssetReadinessError';
  }
}

export class AssetReadinessAbortedError extends Error {
  public constructor() {
    super('Asset readiness was cancelled.');
    this.name = 'AssetReadinessAbortedError';
  }
}

class AssetLoadTimeoutError extends Error {
  public constructor(assetLabel: string) {
    super(`Asset load timed out: ${assetLabel}`);
    this.name = 'AssetLoadTimeoutError';
  }
}

const GLOBAL_FONT_WEIGHTS = [400, 500, 600, 700, 800] as const;

function emptyProgress(total: number): AssetProgress {
  return {
    loaded: 0,
    total,
    failed: 0,
    currentAssetId: null,
    currentAssetLabel: null,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof AssetReadinessAbortedError;
}

function resolveClientAssetUrl(rawUrl: string): string {
  if (typeof document === 'undefined') return rawUrl;
  try {
    return new URL(rawUrl, document.baseURI).toString();
  } catch {
    return rawUrl;
  }
}

async function loadImageAsset(
  rawUrl: string,
  context: AssetLoadContext,
): Promise<void> {
  if (typeof Image === 'undefined') {
    throw new Error('The browser image loader is unavailable.');
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let unregisterCancel = () => {};
    const image = new Image();
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      unregisterCancel();
      callback();
    };

    const cancel = () => {
      image.onload = null;
      image.onerror = null;
      try {
        image.src = '';
      } catch {
        // The asset has already been abandoned; there is no recovery work here.
      }
      finish(() => reject(new AssetReadinessAbortedError()));
    };
    unregisterCancel = context.onCancel(cancel);

    image.decoding = 'async';
    image.onload = () => {
      if (typeof image.decode !== 'function') {
        finish(resolve);
        return;
      }
      void Promise.resolve()
        .then(() => image.decode())
        .then(() => finish(resolve), cause => finish(() => reject(cause)));
    };
    image.onerror = cause => finish(() => reject(cause ?? new Error('Image decode failed.')));
    image.src = resolveClientAssetUrl(rawUrl);
  });
}

async function loadFetchedAsset(
  rawUrl: string,
  context: AssetLoadContext,
): Promise<void> {
  if (typeof fetch !== 'function') throw new Error('The browser fetch API is unavailable.');
  const response = await fetch(resolveClientAssetUrl(rawUrl), {
    cache: 'force-cache',
    signal: context.signal,
  });
  if (!response.ok) throw new Error(`Asset request failed with status ${response.status}.`);
  const body = await response.arrayBuffer();
  if (body.byteLength === 0) throw new Error('Asset response was empty.');
}

export async function preloadDocumentFontFamily(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  await Promise.all(GLOBAL_FONT_WEIGHTS.map(weight => (
    document.fonts.load(`${weight} 1em "Be Vietnam Pro"`)
  )));
}

async function loadBoardFont(
  context: AssetLoadContext,
): Promise<void> {
  if (typeof fetch !== 'function') throw new Error('The browser fetch API is unavailable.');
  const response = await fetch(resolveClientAssetUrl(BOARD_FONT_URL), {
    cache: 'force-cache',
    signal: context.signal,
  });
  if (!response.ok) throw new Error(`Board font request failed with status ${response.status}.`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('Board font response was empty.');

  if (typeof FontFace === 'function') {
    const probe = new FontFace(
      `${BOARD_FONT_FAMILY} preload`,
      await blob.arrayBuffer(),
      { weight: String(BOARD_FONT_WEIGHT) },
    );
    await probe.load();
  }
}

function makeImageAsset(
  id: string,
  label: string,
  classification: AssetClassification,
  failurePolicy: AssetFailurePolicy,
  url: string,
  fallback?: string,
): AssetDescriptor {
  return {
    id,
    label,
    classification,
    failurePolicy,
    ...(fallback ? { fallback } : {}),
    load: context => loadImageAsset(url, context),
  };
}

export const GLOBAL_ASSET_INVENTORY: readonly AssetDescriptor[] = [
  {
    id: 'global.ui-font-family',
    label: 'Phông chữ giao diện',
    classification: 'critical-global',
    failurePolicy: 'fallback',
    fallback: 'Phông chữ hệ thống',
    load: () => preloadDocumentFontFamily(),
  },
  makeImageAsset(
    'global.brand-favicon',
    'Nhận diện Own the Block',
    'critical-global',
    'fallback',
    '/favicon.svg',
    'Nhãn chữ Own the Block',
  ),
];

const LEGACY_ICON_INVENTORY: readonly [string, string, string][] = [
  ['chance', 'Biểu tượng Cơ Hội dự phòng', '/icons/chance.png'],
  ['chest', 'Biểu tượng Khí Vận dự phòng', '/icons/chest.gif'],
  ['electric', 'Biểu tượng Công Ty Điện dự phòng', '/icons/electric.gif'],
  ['go', 'Biểu tượng Bắt Đầu dự phòng', '/icons/go.gif'],
  ['gotojail', 'Biểu tượng Vào Tù dự phòng', '/icons/gotojail.gif'],
  ['jail', 'Biểu tượng Nhà Tù dự phòng', '/icons/jail.png'],
  ['railroad', 'Biểu tượng Ga Tàu dự phòng', '/icons/railroad.png'],
  ['tax', 'Biểu tượng Thuế dự phòng', '/icons/tax.png'],
  ['water', 'Biểu tượng Công Ty Nước dự phòng', '/icons/water.png'],
];

export const DEFERRED_ASSET_INVENTORY: readonly AssetDescriptor[] = [
  makeImageAsset(
    'deferred.cursor',
    'Con trỏ trò chơi',
    'deferred/optional',
    'optional',
    cursorUrl,
    'Con trỏ hệ thống',
  ),
  ...LEGACY_ICON_INVENTORY.map(([name, label, url]) => makeImageAsset(
    `deferred.legacy-icon.${name}`,
    label,
    'deferred/optional',
    'optional',
    url,
    'Nhãn ô cờ và biểu tượng chữ',
  )),
  {
    id: 'deferred.web-manifest',
    label: 'Thông tin cài đặt web',
    classification: 'deferred/optional' as const,
    failurePolicy: 'optional' as const,
    fallback: 'Chạy trực tiếp trên trình duyệt',
    load: context => loadFetchedAsset('/manifest.json', context),
  },
];

export const PRODUCTION_ASSET_INVENTORY: readonly AssetDescriptor[] = [
  ...GLOBAL_ASSET_INVENTORY,
  ...DEFERRED_ASSET_INVENTORY,
];

const BOARD_ICON_LABELS: Record<BoardSvgTileIconKind, string> = {
  'railroad-train-svg': 'Biểu tượng Ga Tàu',
  'handcuffs-svg': 'Biểu tượng Vào Tù',
  'water-faucet-svg': 'Biểu tượng Công Ty Nước',
  'electric-bulb-svg': 'Biểu tượng Công Ty Điện',
  'chance-question-svg': 'Biểu tượng Cơ Hội',
  'fortune-wheel-svg': 'Biểu tượng Khí Vận',
};

function loadSharedSvgAsset(
  url: string,
  context: AssetLoadContext,
): Promise<void> {
  return preloadSharedSvgImage(url, {
    timeoutMs: context.timeoutMs,
    signal: context.signal,
  }).then(() => undefined);
}

function loadCharacterAsset(
  characterId: CharacterId | null,
  playerColor: PlayerColorId,
  context: AssetLoadContext,
): Promise<AssetLoadResult> {
  const handle = preloadCharacterTexture(characterId, playerColor);
  const unregisterCancel = context.onCancel(handle.release);
  return handle.promise.then(
    () => {
      unregisterCancel();
      return { release: handle.release };
    },
    cause => {
      unregisterCancel();
      handle.release();
      throw cause;
    },
  );
}

function characterAssetKey(characterId: CharacterId | null, color: PlayerColorId): string {
  return `${characterId ?? 'legacy'}:${color}`;
}

function createRoomCharacterAsset(
  characterId: CharacterId | null,
  color: PlayerColorId,
): AssetDescriptor {
  const definition = getCharacterDefinition(characterId);
  const key = characterAssetKey(characterId, color);
  return {
    id: `gameplay.character.${key}`,
    label: `Nhân vật ${definition.displayName}`,
    classification: 'critical-gameplay',
    failurePolicy: 'block',
    load: context => loadCharacterAsset(characterId, color, context),
  };
}

export function createRoomGameplayAssetInventory(
  players: readonly RoomPlayerMeta[],
  webglSupported: boolean,
): readonly AssetDescriptor[] {
  if (!webglSupported) return [];

  const assets: AssetDescriptor[] = [
    {
      id: 'gameplay.board-font',
      label: 'Chữ tên ô cờ',
      classification: 'critical-gameplay',
      failurePolicy: 'block',
      load: loadBoardFont,
    },
  ];

  Object.values(BOARD_SVG_TILE_ICON_ASSETS)
    .sort((left, right) => left.kind.localeCompare(right.kind))
    .forEach(icon => {
      assets.push({
        id: `gameplay.special-icon.${icon.kind}`,
        label: BOARD_ICON_LABELS[icon.kind],
        classification: 'critical-gameplay',
        failurePolicy: 'block',
        load: context => loadSharedSvgAsset(icon.url, context),
      });
    });

  const appearances = new Map<string, readonly [CharacterId | null, PlayerColorId]>();
  players
    .filter(player => player.membershipStatus !== 'LEFT')
    .forEach(player => {
      const key = characterAssetKey(player.characterId, player.color);
      if (!appearances.has(key)) appearances.set(key, [player.characterId, player.color]);
    });
  [...appearances.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([, [characterId, color]]) => {
      assets.push(createRoomCharacterAsset(characterId, color));
    });

  return assets;
}

export function getRoomGameplayAssetKey(
  roomId: string | null,
  players: readonly RoomPlayerMeta[],
  webglSupported: boolean,
): string | null {
  if (!roomId || !webglSupported) return roomId ? `${roomId}:legacy` : null;
  const appearances = players
    .filter(player => player.membershipStatus !== 'LEFT')
    .map(player => characterAssetKey(player.characterId, player.color))
    .sort();
  return `${roomId}|${appearances.join('|')}`;
}

function releaseAll(releases: readonly (() => void)[]): void {
  releases.forEach(release => release());
}

async function waitForAsset<T>(
  promise: Promise<T>,
  assetLabel: string,
  timeoutMs: number,
  signal: AbortSignal,
  cancel: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => {
      cancel();
      finish(() => reject(new AssetReadinessAbortedError()));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      cancel();
      finish(() => reject(new AssetLoadTimeoutError(assetLabel)));
    }, timeoutMs);
    promise.then(
      value => finish(() => resolve(value)),
      cause => finish(() => reject(cause)),
    );
  });
}

export async function preloadAssetPlan(
  assets: readonly AssetDescriptor[],
  options: AssetPreloadOptions = {},
): Promise<AssetPreloadReport> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_ASSET_TIMEOUT_MS);
  const controller = new AbortController();
  const signal = options.signal ?? controller.signal;
  const releases: Array<() => void> = [];
  const failures: AssetFailure[] = [];
  let released = false;
  let progress = emptyProgress(assets.length);
  const emitProgress = () => options.onProgress?.({ ...progress });
  const release = () => {
    if (released) return;
    released = true;
    releaseAll(releases);
    releases.length = 0;
  };

  emitProgress();
  for (const asset of assets) {
    if (signal.aborted) {
      release();
      throw new AssetReadinessAbortedError();
    }

    progress = {
      ...progress,
      currentAssetId: asset.id,
      currentAssetLabel: asset.label,
    };
    emitProgress();

    const cancellations = new Set<() => void>();
    const cancel = () => {
      [...cancellations].forEach(cleanup => cleanup());
      cancellations.clear();
    };
    const context: AssetLoadContext = {
      timeoutMs,
      signal,
      onCancel: cleanup => {
        cancellations.add(cleanup);
        return () => cancellations.delete(cleanup);
      },
    };

    try {
      const result = await waitForAsset(
        Promise.resolve().then(() => asset.load(context)),
        asset.label,
        timeoutMs,
        signal,
        cancel,
      );
      cancellations.clear();
      if (result?.release) releases.push(result.release);
      progress = {
        ...progress,
        loaded: progress.loaded + 1,
      };
      emitProgress();
    } catch (cause) {
      cancel();
      if (signal.aborted || isAbortError(cause)) {
        release();
        throw cause;
      }

      progress = {
        ...progress,
        failed: progress.failed + 1,
      };
      const failure: AssetFailure = {
        id: asset.id,
        label: asset.label,
        classification: asset.classification,
        failurePolicy: asset.failurePolicy,
        ...(asset.fallback ? { fallback: asset.fallback } : {}),
        cause,
      };
      failures.push(failure);
      emitProgress();
      if (asset.failurePolicy === 'block') {
        release();
        throw new AssetReadinessError([...failures], { ...progress });
      }
    }
  }

  progress = {
    ...progress,
    currentAssetId: null,
    currentAssetLabel: null,
  };
  emitProgress();
  return {
    progress: { ...progress },
    failures: [...failures],
    release,
  };
}

export function getSafeAssetReadinessMessage(error: unknown): string {
  if (error instanceof AssetReadinessError) {
    if (error.failures.some(failure => failure.classification === 'critical-gameplay')) {
      return 'Không thể chuẩn bị bàn cờ. Hãy kiểm tra kết nối rồi thử lại.';
    }
    return 'Không thể tải giao diện trò chơi. Hãy thử lại.';
  }
  return 'Không thể chuẩn bị trò chơi. Hãy thử lại.';
}
