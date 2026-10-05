import { useEffect } from 'react';
import { act, cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppUpdateProvider, useAppUpdate } from '../../runtime/appUpdate';
import { SettingsProvider } from '../../settings/SettingsProvider';
import { ToastProvider } from '../Toast';
import UpdateSessionNotice from './UpdateSessionNotice';
import {
  available, installUpdateBridge, ready, requiredAvailable, updateState,
} from './updateTestFixtures';

// A slow runner must not turn a UI that is merely late into a failure; a wait that holds at once costs nothing.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
  window.localStorage.clear();
});

const READY = 'Bản cập nhật đã sẵn sàng. Bạn có thể cập nhật sau khi kết thúc ván chơi.';
const REQUIRED = 'Cần cập nhật Own the Block. Bạn có thể cập nhật sau khi rời phòng.';

let defer: () => void = () => undefined;
function DeferProbe() {
  const update = useAppUpdate();
  useEffect(() => {
    defer = update.defer;
  });
  return null;
}

function renderNotice(initial: ReturnType<typeof updateState>, inSession: boolean) {
  const bridge = installUpdateBridge(initial);
  const tree = (session: boolean) => (
    <SettingsProvider>
      <AppUpdateProvider inSession={session}>
        <ToastProvider>
          <UpdateSessionNotice />
          <DeferProbe />
        </ToastProvider>
      </AppUpdateProvider>
    </SettingsProvider>
  );
  const view = render(tree(inSession));
  return { ...bridge, setSession: (session: boolean) => view.rerender(tree(session)) };
}

describe('update notice during a game', () => {
  it('says once that a downloaded update waits for after the game', async () => {
    const { push } = renderNotice(updateState({ phase: 'up-to-date' }), true);

    await push(ready());
    expect(await screen.findByText(READY)).toBeTruthy();

    await push(ready({ checkedAt: 99 }));
    expect(screen.getAllByText(READY)).toHaveLength(1);
  });

  it('says when a mandatory update is found, as a warning, and only once', async () => {
    const { push } = renderNotice(updateState({ phase: 'up-to-date' }), true);

    await push(requiredAvailable());
    expect(await screen.findByText(REQUIRED)).toBeTruthy();
    await push(requiredAvailable({ checkedAt: 1 }));
    expect(screen.getAllByText(REQUIRED)).toHaveLength(1);
  });

  it('stays silent about an optional update that was merely found, and outside a game', async () => {
    const inGame = renderNotice(updateState({ phase: 'up-to-date' }), true);
    await inGame.push(available());
    expect(screen.queryByText(READY)).toBeNull();
    expect(screen.queryByText(REQUIRED)).toBeNull();
    cleanup();

    const onStartScreen = renderNotice(updateState({ phase: 'up-to-date' }), false);
    await onStartScreen.push(ready());
    await onStartScreen.push(requiredAvailable());
    expect(screen.queryByText(READY)).toBeNull();
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });

  it('does not remind a player who pressed "Để sau"', async () => {
    const { push, update } = renderNotice(available(), true);
    await waitFor(() => expect(update.getState).toHaveBeenCalled());
    await push(available());
    act(() => defer());

    await push(ready());

    expect(screen.queryByText(READY)).toBeNull();
  });

  it('speaks when the player enters a game while an update is already downloaded', async () => {
    const { setSession } = renderNotice(ready(), false);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(READY)).toBeNull();

    setSession(true);

    expect(await screen.findByText(READY)).toBeTruthy();
  });
});
