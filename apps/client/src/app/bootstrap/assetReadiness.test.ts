import type { RoomPlayerMeta } from '@monopoly/shared';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  AssetReadinessAbortedError,
  AssetReadinessError,
  createRoomGameplayAssetInventory,
  DEFERRED_ASSET_INVENTORY,
  GLOBAL_ASSET_INVENTORY,
  getRoomGameplayAssetKey,
  preloadAssetPlan,
  type AssetDescriptor,
} from './assetReadiness';
import {
  preloadSharedSvgImage,
  resetSharedSvgImageCacheForTests,
} from '../../game/scene/special/RaisedSvgTileIcon';

class MockSvgImage {
  static instances: MockSvgImage[] = [];

  onload: (() => void) | null = null;
  onerror: ((cause: unknown) => void) | null = null;
  decoding = '';
  crossOrigin = '';
  private source = '';

  public constructor() {
    MockSvgImage.instances.push(this);
  }

  public set src(value: string) {
    this.source = value;
  }

  public get src(): string {
    return this.source;
  }

  public resolve(): void {
    this.onload?.();
  }

  public reject(cause: unknown): void {
    this.onerror?.(cause);
  }
}

function asset(overrides: Partial<AssetDescriptor> = {}): AssetDescriptor {
  return {
    id: 'test.asset',
    label: 'Tài nguyên kiểm thử',
    classification: 'critical-global',
    failurePolicy: 'block',
    load: async () => {},
    ...overrides,
  };
}

function player(overrides: Partial<RoomPlayerMeta> = {}): RoomPlayerMeta {
  return {
    playerId: 'player-1',
    name: 'Người chơi',
    color: 'red',
    characterId: 'dog',
    joinOrder: 1,
    membershipStatus: 'ACTIVE',
    ready: true,
    connected: true,
    ...overrides,
  };
}

describe('asset readiness inventory and loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    MockSvgImage.instances = [];
    resetSharedSvgImageCacheForTests();
  });

  it('classifies global assets as fallback-capable and deferred assets as optional', () => {
    expect(GLOBAL_ASSET_INVENTORY).toHaveLength(2);
    expect(GLOBAL_ASSET_INVENTORY.every(assetItem => (
      assetItem.classification === 'critical-global'
      && assetItem.failurePolicy === 'fallback'
    ))).toBe(true);
    expect(DEFERRED_ASSET_INVENTORY.every(assetItem => (
      assetItem.classification === 'deferred/optional'
      && assetItem.failurePolicy === 'optional'
    ))).toBe(true);
  });

  it('builds a deterministic room inventory from active WebGL appearances', () => {
    const inventory = createRoomGameplayAssetInventory([
      player({ playerId: 'left', characterId: 'duck', color: 'green', membershipStatus: 'LEFT' }),
      player({ playerId: 'panda-player', characterId: 'panda', color: 'blue' }),
      player({ playerId: 'duplicate', characterId: 'dog', color: 'red' }),
    ], true);
    const ids = inventory.map(assetItem => assetItem.id);

    expect(ids[0]).toBe('gameplay.board-font');
    expect(ids.filter(id => id.startsWith('gameplay.special-icon.'))).toHaveLength(6);
    expect(ids.filter(id => id.startsWith('gameplay.character.'))).toEqual([
      'gameplay.character.dog:red',
      'gameplay.character.panda:blue',
    ]);
    expect(createRoomGameplayAssetInventory([], false)).toEqual([]);
    expect(getRoomGameplayAssetKey(
      'room-1',
      [
        player({ characterId: 'panda', color: 'blue' }),
        player({ characterId: 'dog', color: 'red' }),
        player({ characterId: 'duck', color: 'green', membershipStatus: 'LEFT' }),
      ],
      true,
    )).toBe('room-1|dog:red|panda:blue');
  });

  it('reports truthful progress and retains successful asset leases', async () => {
    const release = vi.fn();
    const progress: Array<{ loaded: number; total: number; failed: number }> = [];
    const report = await preloadAssetPlan([
      asset({ id: 'first', load: async () => ({ release }) }),
      asset({ id: 'second', load: async () => {} }),
    ], {
      onProgress: value => progress.push({
        loaded: value.loaded,
        total: value.total,
        failed: value.failed,
      }),
    });

    expect(report.progress).toMatchObject({ loaded: 2, total: 2, failed: 0 });
    expect(progress.at(-1)).toEqual({ loaded: 2, total: 2, failed: 0 });
    report.release();
    report.release();
    expect(release).toHaveBeenCalledOnce();
  });

  it('uses declared fallbacks for optional failures while continuing the plan', async () => {
    const progress: Array<{ loaded: number; failed: number }> = [];
    const report = await preloadAssetPlan([
      asset({
        id: 'optional-failure',
        failurePolicy: 'optional',
        classification: 'deferred/optional',
        fallback: 'Nhãn dự phòng',
        load: async () => { throw new Error('optional asset unavailable'); },
      }),
      asset({ id: 'optional-success', failurePolicy: 'optional', load: async () => {} }),
    ], { onProgress: value => progress.push({ loaded: value.loaded, failed: value.failed }) });

    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({
      id: 'optional-failure',
      fallback: 'Nhãn dự phòng',
    });
    expect(report.progress).toMatchObject({ loaded: 1, total: 2, failed: 1 });
    expect(progress.at(-1)).toEqual({ loaded: 1, failed: 1 });
  });

  it('blocks on critical gameplay failures and releases earlier leases', async () => {
    const release = vi.fn();
    let caught: unknown;
    try {
      await preloadAssetPlan([
        asset({ id: 'ready-first', load: async () => ({ release }) }),
        asset({
          id: 'critical-failure',
          classification: 'critical-gameplay',
          load: async () => { throw new Error('missing board icon'); },
        }),
      ]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AssetReadinessError);
    expect((caught as AssetReadinessError).failures[0]).toMatchObject({
      id: 'critical-failure',
      classification: 'critical-gameplay',
    });
    expect(release).toHaveBeenCalledOnce();
  });

  it('converts a hung loader into a retryable readiness failure', async () => {
    let caught: unknown;
    try {
      await preloadAssetPlan([
        asset({
          id: 'hung-asset',
          classification: 'critical-gameplay',
          load: () => new Promise<void>(() => {}),
        }),
      ], { timeoutMs: 10 });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AssetReadinessError);
    expect((caught as AssetReadinessError).failures[0].cause).toMatchObject({
      name: 'AssetLoadTimeoutError',
    });

    const retry = await preloadAssetPlan([
      asset({ id: 'hung-asset', load: async () => {} }),
    ]);
    expect(retry.progress.loaded).toBe(1);
  });

  it('aborts an in-flight plan without waiting for its timeout', async () => {
    const controller = new AbortController();
    const pending = preloadAssetPlan([
      asset({ load: () => new Promise<void>(() => {}) }),
    ], { signal: controller.signal, timeoutMs: 1_000 });

    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(AssetReadinessAbortedError);
  });
});

describe('shared SVG preload cache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    MockSvgImage.instances = [];
    resetSharedSvgImageCacheForTests();
  });

  it('shares one in-flight image request and retries a failed request', async () => {
    vi.stubGlobal('Image', MockSvgImage);
    const first = preloadSharedSvgImage('/assets/special.svg');
    const second = preloadSharedSvgImage('/assets/special.svg');

    expect(MockSvgImage.instances).toHaveLength(1);
    MockSvgImage.instances[0].resolve();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    resetSharedSvgImageCacheForTests();
    const failed = preloadSharedSvgImage('/assets/special.svg');
    const cause = new Error('decode failed');
    MockSvgImage.instances[1].reject(cause);
    await expect(failed).rejects.toThrow('Shared SVG image failed to load.');

    const retry = preloadSharedSvgImage('/assets/special.svg');
    expect(MockSvgImage.instances).toHaveLength(3);
    MockSvgImage.instances[2].resolve();
    await expect(retry).resolves.toBe(MockSvgImage.instances[2]);
  });
});
