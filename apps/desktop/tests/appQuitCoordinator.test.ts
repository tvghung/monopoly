import { describe, expect, it, vi } from 'vitest';
import {
  AppQuitCoordinator,
  type AppQuitCoordinatorOptions,
} from '../src/appQuitCoordinator';

function options(overrides: Partial<AppQuitCoordinatorOptions> = {}) {
  return {
    hasLiveWindow: vi.fn(() => true),
    requestRendererDecision: vi.fn(() => Promise.resolve(true)),
    stopRuntime: vi.fn(async () => undefined),
    armFinalWindowClose: vi.fn(),
    quitApp: vi.fn(),
    reportError: vi.fn(),
    ...overrides,
  };
}

describe('AppQuitCoordinator', () => {
  it('waits for renderer cancellation before doing any runtime shutdown', async () => {
    let resolveDecision!: (allow: boolean) => void;
    const decision = new Promise<boolean>(resolve => { resolveDecision = resolve; });
    const dependencies = options({
      requestRendererDecision: vi.fn(() => decision),
    });
    const coordinator = new AppQuitCoordinator(dependencies);
    const event = { preventDefault: vi.fn() };

    coordinator.handleBeforeQuit(event);
    await Promise.resolve();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(dependencies.stopRuntime).not.toHaveBeenCalled();

    resolveDecision(false);
    await coordinator.waitForSettled();
    expect(dependencies.stopRuntime).not.toHaveBeenCalled();
    expect(dependencies.quitApp).not.toHaveBeenCalled();
  });

  it('coalesces concurrent quit events and performs one ordered shutdown', async () => {
    const dependencies = options();
    const coordinator = new AppQuitCoordinator(dependencies);
    const firstEvent = { preventDefault: vi.fn() };
    const secondEvent = { preventDefault: vi.fn() };

    coordinator.handleBeforeQuit(firstEvent);
    coordinator.handleBeforeQuit(secondEvent);
    await coordinator.waitForSettled();

    expect(dependencies.requestRendererDecision).toHaveBeenCalledOnce();
    expect(dependencies.stopRuntime).toHaveBeenCalledOnce();
    expect(dependencies.armFinalWindowClose).toHaveBeenCalledOnce();
    expect(dependencies.quitApp).toHaveBeenCalledOnce();

    const finalEvent = { preventDefault: vi.fn() };
    coordinator.handleBeforeQuit(finalEvent);
    expect(finalEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('still authorizes quit when runtime cleanup reports an error', async () => {
    const cleanupError = new Error('runtime cleanup failed');
    const dependencies = options({
      stopRuntime: vi.fn(async () => { throw cleanupError; }),
    });
    const coordinator = new AppQuitCoordinator(dependencies);

    coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    await coordinator.waitForSettled();

    expect(dependencies.reportError).toHaveBeenCalledWith(cleanupError);
    expect(dependencies.armFinalWindowClose).toHaveBeenCalledOnce();
    expect(dependencies.quitApp).toHaveBeenCalledOnce();
  });

  it('does not ask a renderer when the application has no live window', async () => {
    const dependencies = options({ hasLiveWindow: vi.fn(() => false) });
    const coordinator = new AppQuitCoordinator(dependencies);

    coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    await coordinator.waitForSettled();

    expect(dependencies.requestRendererDecision).not.toHaveBeenCalled();
    expect(dependencies.stopRuntime).toHaveBeenCalledOnce();
    expect(dependencies.quitApp).toHaveBeenCalledOnce();
  });
});
