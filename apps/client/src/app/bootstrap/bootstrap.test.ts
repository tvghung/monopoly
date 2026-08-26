import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { bootstrap } from './bootstrap';
import type { BootstrapProgress } from './types';

class ImmediateImage {
  onload: (() => void) | null = null;
  onerror: ((cause: unknown) => void) | null = null;
  decoding = '';
  private source = '';

  public set src(value: string) {
    this.source = value;
    queueMicrotask(() => {
      if (this.source === value) this.onload?.();
    });
  }
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(resolve => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe('client bootstrap readiness', () => {
  let originalFontsDescriptor: PropertyDescriptor | undefined;

  afterEach(() => {
    if (originalFontsDescriptor) {
      Object.defineProperty(document, 'fonts', originalFontsDescriptor);
    } else {
      Reflect.deleteProperty(document, 'fonts');
    }
    originalFontsDescriptor = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not initialize the socket or reach ready until critical global assets finish', async () => {
    originalFontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
    const fontGate = deferred<void>();
    const fontLoad = vi.fn(() => fontGate.promise);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: fontLoad },
    });
    vi.stubGlobal('Image', ImmediateImage);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(1),
    })));

    const progress: BootstrapProgress[] = [];
    const pending = bootstrap(value => progress.push(value));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(progress.at(-1)?.stage).toBe('loading-assets');
    expect(progress.some(value => value.stage === 'ready')).toBe(false);

    fontGate.resolve(undefined);
    const result = await pending;

    expect(result.socket).toBeDefined();
    expect(fontLoad).toHaveBeenCalledTimes(5);
    expect(progress.at(-1)?.stage).toBe('ready');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
});
