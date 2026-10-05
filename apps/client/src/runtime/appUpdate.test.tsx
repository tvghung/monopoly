import { useEffect } from 'react';
import { act, cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  available, downloading, installUpdateBridge, ready, requiredAvailable, updateState,
} from '../components/update/updateTestFixtures';
import { AppUpdateProvider, useAppUpdate, type AppUpdateContextValue } from './appUpdate';

// A slow runner must not turn a late first answer into a failure; a wait that holds at once costs nothing.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
});

let latest: AppUpdateContextValue;

function Probe() {
  const value = useAppUpdate();
  // After every render, so that `latest` is what the last committed render saw.
  useEffect(() => {
    latest = value;
  });
  return <output data-testid="phase">{value.state?.phase ?? 'none'}</output>;
}

function renderProvider(inSession = false) {
  return render(<AppUpdateProvider inSession={inSession}><Probe /></AppUpdateProvider>);
}

describe('AppUpdateProvider', () => {
  it('is inert without a desktop bridge, on a bridge that predates the updater and while the updater is unsupported', async () => {
    renderProvider();
    expect(latest).toMatchObject({ available: false, state: null, locked: false, canApply: false });
    await act(async () => { await latest.check(); await latest.download(); await latest.install(); });
    cleanup();

    window.ownTheBlockDesktop = { getRuntimeConfig: () => Promise.resolve({ ok: false, code: 'SOCKET_URL_INVALID' }) } as never;
    renderProvider();
    expect(latest.available).toBe(false);
    cleanup();

    const { update } = installUpdateBridge(updateState({ phase: 'unsupported' }));
    renderProvider();
    // The state is read (and ignored) before the assertion, not just assumed.
    await waitFor(() => expect(update.getState).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(latest.state).toBeNull();
    expect(latest.available).toBe(false);
  });

  it('reads the state the main process has and follows every state it publishes', async () => {
    const { push } = installUpdateBridge(updateState({ phase: 'up-to-date' }));
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('up-to-date'));
    expect(latest.available).toBe(true);

    await push(available());
    expect(screen.getByTestId('phase').textContent).toBe('available');
    await push(downloading(100));
    expect(latest.state?.progress?.receivedBytes).toBe(100);
  });

  it('prefers a state that was published while the first answer was on its way', async () => {
    let answer!: (state: ReturnType<typeof updateState>) => void;
    const { update, push } = installUpdateBridge(updateState({ phase: 'idle' }));
    update.getState.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
    renderProvider();

    await push(available());
    await act(async () => { answer(updateState({ phase: 'idle' })); await Promise.resolve(); });

    expect(screen.getByTestId('phase').textContent).toBe('available');
  });

  it('stops listening when it unmounts', async () => {
    const { update } = installUpdateBridge(updateState({ phase: 'up-to-date' }));
    const view = renderProvider();
    await waitFor(() => expect(latest.available).toBe(true));
    expect(update.onStateChanged).toHaveBeenCalledOnce();

    view.unmount();

    // The unsubscribe the bridge returned ran: pushing now reaches nobody (no error, nothing to update).
    expect(update.onStateChanged.mock.results[0]?.type).toBe('return');
  });

  it('asks the main process for each next step and shows the state it answers with', async () => {
    const { update } = installUpdateBridge(updateState({ phase: 'up-to-date' }));
    update.check.mockResolvedValueOnce(available());
    update.download.mockResolvedValueOnce(downloading(0));
    update.cancelDownload.mockResolvedValueOnce(available());
    update.install.mockResolvedValueOnce(updateState({ phase: 'installing', update: available().update }));
    renderProvider();
    await waitFor(() => expect(latest.available).toBe(true));

    await act(async () => { await latest.check(); });
    expect(latest.state?.phase).toBe('available');
    await act(async () => { await latest.download(); });
    expect(latest.state?.phase).toBe('downloading');
    await act(async () => { await latest.cancelDownload(); });
    expect(latest.state?.phase).toBe('available');
    await act(async () => { await latest.install(); });
    expect(latest.state?.phase).toBe('installing');
    expect([update.check, update.download, update.cancelDownload, update.install].map(call => call.mock.calls.length)).toEqual([1, 1, 1, 1]);
  });

  it('survives a call that cannot be delivered', async () => {
    const { update } = installUpdateBridge(available());
    update.download.mockRejectedValueOnce(new Error('No handler registered'));
    renderProvider();
    await waitFor(() => expect(latest.state?.phase).toBe('available'));

    await act(async () => { await latest.download(); });

    expect(latest.state?.phase).toBe('available');
  });

  it('remembers "Để sau" for that version only, and never for a mandatory update', async () => {
    const { push } = installUpdateBridge(available());
    renderProvider();
    // Wait for the first state itself: `deferred` is false before it arrives too, so it proves nothing.
    await waitFor(() => expect(latest.state?.phase).toBe('available'));
    expect(latest.deferred).toBe(false);

    act(() => latest.defer());
    expect(latest.deferred).toBe(true);

    await push(available({ update: { version: '1.3.0', mandatory: false, sizeBytes: 168_398_848 } }));
    expect(latest.deferred).toBe(false);

    await push(requiredAvailable());
    act(() => latest.defer());
    expect(latest.deferred).toBe(false);
    expect(latest.locked).toBe(true);
  });

  it('locks multiplayer only while a mandatory update is known', async () => {
    const { push } = installUpdateBridge(available());
    renderProvider();
    await waitFor(() => expect(latest.state?.phase).toBe('available'));
    expect(latest.locked).toBe(false);

    await push(requiredAvailable());
    expect(latest.locked).toBe(true);
    await push(downloading(5, { update: requiredAvailable().update }));
    expect(latest.locked).toBe(true);
    await push(updateState({ phase: 'up-to-date' }));
    expect(latest.locked).toBe(false);
  });

  it('allows applying only a downloaded update, outside a session, with no room of this machine open', async () => {
    const { push } = installUpdateBridge(ready());
    const view = renderProvider(false);
    await waitFor(() => expect(latest.state?.phase).toBe('ready'));
    expect(latest.canApply).toBe(true);

    await push(ready({ installBlocked: 'HOST_OPEN' }));
    expect(latest.canApply).toBe(false);
    await push(available());
    expect(latest.canApply).toBe(false);

    await push(ready());
    view.rerender(<AppUpdateProvider inSession><Probe /></AppUpdateProvider>);
    expect(latest.inSession).toBe(true);
    expect(latest.canApply).toBe(false);
  });

  it('allows retrying a failed install under the same conditions, but not a failed download', async () => {
    const failedInstall = updateState({
      phase: 'error', update: available().update, error: { stage: 'install', code: 'INSTALL_FAILED' },
    });
    const failedDownload = updateState({
      phase: 'error', update: available().update, error: { stage: 'download', code: 'OFFLINE' },
    });
    const { push } = installUpdateBridge(failedInstall);
    const view = renderProvider(false);
    await waitFor(() => expect(latest.state?.phase).toBe('error'));
    expect(latest.canApply).toBe(true);

    await push({ ...failedInstall, installBlocked: 'HOST_OPEN' });
    expect(latest.canApply).toBe(false);
    await push(failedDownload);
    expect(latest.canApply).toBe(false);

    await push(failedInstall);
    view.rerender(<AppUpdateProvider inSession><Probe /></AppUpdateProvider>);
    expect(latest.canApply).toBe(false);
  });
});
